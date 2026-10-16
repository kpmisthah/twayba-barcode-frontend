import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, MovementType, Prisma, StockMovement, VariantKind } from '@prisma/client';
import { LocationsService } from '../locations/locations.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertShape, effectsOf, isValidLevel, MovementShape, systemLocationError } from './movement-rules.js';
import { reasonError } from './reasons.js';

type Tx = Prisma.TransactionClient;

export interface MoveInput extends MovementShape {
  variantId: string;
  reason?: string | null;
  note?: string | null;
  reference?: string | null;
}

interface LockedLevel {
  id: string;
  variantId: string;
  locationId: string;
  onHand: number;
  reserved: number;
  dirty?: boolean;
}

const key = (variantId: string, locationId: string) => `${variantId}:${locationId}`;

/**
 * The only place stock changes. Every call:
 *  - validates the movements,
 *  - locks the stock rows it touches (SELECT … FOR UPDATE, in a fixed order so two
 *    requests can't deadlock), so two users can never take the same last unit,
 *  - updates the rows and writes the movements in the same transaction.
 * Pass `tx` to make the stock change part of a bigger transaction (a sale, an order…).
 */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  async apply(userId: string | null, moves: MoveInput[], tx?: Tx): Promise<StockMovement[]> {
    if (!moves.length) return [];
    for (const m of moves) {
      try {
        assertShape(m);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }
    const run = (t: Tx) => this.applyIn(t, userId, moves);
    return tx ? run(tx) : this.prisma.$transaction(run, { timeout: 15_000 });
  }

  /**
   * A movement entered by a person (add / remove / move / damage / correction).
   * DAMAGE always goes to the Damaged location; a kit variant means whole kits, so each
   * box moves `quantity × per-kit` — all boxes or none.
   */
  async recordManual(userId: string, input: MoveInput): Promise<StockMovement[]> {
    const reasonProblem = reasonError(input.type, input.reason, input.note);
    if (reasonProblem) throw new BadRequestException(reasonProblem);

    const toLocationId = input.type === MovementType.DAMAGE ? await this.damagedLocationId() : input.toLocationId;
    const reason = input.type === MovementType.DAMAGE ? input.reason?.trim() || 'Damaged' : input.reason;
    const move = { ...input, toLocationId, reason };

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: input.variantId },
      select: { kind: true, components: { select: { componentVariantId: true, quantity: true } } },
    });
    if (!variant) throw new NotFoundException('Item not found');
    if (variant.kind !== VariantKind.KIT) return this.apply(userId, [move]);

    if (!variant.components.length) throw new BadRequestException('This kit has no boxes yet');
    return this.apply(
      userId,
      variant.components.map((c) => ({ ...move, variantId: c.componentVariantId, quantity: input.quantity * c.quantity })),
    );
  }

  /** The Damaged system location (created by the locations migration). */
  async damagedLocationId(tx?: Tx): Promise<string> {
    return this.systemLocationId(LocationType.DAMAGED, tx);
  }

  /** The In Transit system location: loaded orders on their way to the customer. */
  async transitLocationId(tx?: Tx): Promise<string> {
    return this.systemLocationId(LocationType.TRANSIT, tx);
  }

  private async systemLocationId(type: LocationType, tx?: Tx): Promise<string> {
    const db = tx ?? this.prisma;
    const loc = await db.location.findFirst({ where: { type }, select: { id: true } });
    if (!loc) throw new NotFoundException(`The ${type} location is missing — run the database migrations`);
    return loc.id;
  }

  private async applyIn(tx: Tx, userId: string | null, moves: MoveInput[]): Promise<StockMovement[]> {
    const variantIds = [...new Set(moves.map((m) => m.variantId))];
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, kind: true, code: true, name: true, product: { select: { name: true } } },
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const locationIds = [...new Set(moves.flatMap((m) => [m.fromLocationId, m.toLocationId]).filter((id): id is string => !!id))];
    const locations = await tx.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, type: true, name: true, active: true, _count: { select: { children: { where: { active: true } } } } },
    });
    const locationById = new Map(locations.map((l) => [l.id, l]));

    for (const m of moves) {
      const variant = variantById.get(m.variantId);
      if (!variant) throw new NotFoundException('Item not found');
      if (variant.kind === VariantKind.KIT) {
        throw new BadRequestException(`${variant.product.name} is a kit — stock is kept per box, so move its boxes`);
      }
      const from = m.fromLocationId ? locationById.get(m.fromLocationId) : undefined;
      const to = m.toLocationId ? locationById.get(m.toLocationId) : undefined;
      if ((m.fromLocationId && !from) || (m.toLocationId && !to)) throw new NotFoundException('Location not found');
      if (to && !to.active) throw new BadRequestException(`"${to.name}" is hidden — stock can't go there`);
      if (to && to._count.children > 0) {
        throw new BadRequestException(`"${to.name}" has spaces inside it — choose the exact space`);
      }
      const systemError = systemLocationError(m.type, from?.type, to?.type);
      if (systemError) throw new BadRequestException(systemError);
    }

    const levels = await this.lockLevels(tx, moves);

    for (const m of moves) {
      for (const effect of effectsOf(m)) {
        const level = levels.get(key(m.variantId, effect.locationId))!;
        const next = { onHand: level.onHand + effect.onHand, reserved: level.reserved + effect.reserved };
        if (!isValidLevel(next)) {
          throw new ConflictException(await this.shortageMessage(m, effect, level, variantById.get(m.variantId)!));
        }
        Object.assign(level, next, { dirty: true });
      }
    }

    for (const level of levels.values()) {
      if (level.dirty) {
        await tx.stockLevel.update({ where: { id: level.id }, data: { onHand: level.onHand, reserved: level.reserved } });
      }
    }

    return tx.stockMovement.createManyAndReturn({
      data: moves.map((m) => ({
        type: m.type,
        variantId: m.variantId,
        quantity: m.quantity,
        fromLocationId: m.fromLocationId ?? null,
        toLocationId: m.toLocationId ?? null,
        userId,
        reason: m.reason?.trim() || null,
        note: m.note?.trim() || null,
        reference: m.reference?.trim() || null,
      })),
    });
  }

  /** Creates any missing rows, then locks every touched row in id order. */
  private async lockLevels(tx: Tx, moves: MoveInput[]): Promise<Map<string, LockedLevel>> {
    const pairs = new Map<string, { variantId: string; locationId: string }>();
    for (const m of moves) {
      for (const e of effectsOf(m)) pairs.set(key(m.variantId, e.locationId), { variantId: m.variantId, locationId: e.locationId });
    }
    const wanted = [...pairs.values()];
    await tx.stockLevel.createMany({ data: wanted, skipDuplicates: true });

    const ids = (await tx.stockLevel.findMany({ where: { OR: wanted }, select: { id: true } })).map((r) => r.id);
    const rows = await tx.$queryRaw<LockedLevel[]>`
      SELECT id, "variantId", "locationId", "onHand", reserved
      FROM stock_levels
      WHERE id = ANY(${ids}::uuid[])
      ORDER BY id
      FOR UPDATE`;
    return new Map(rows.map((r) => [key(r.variantId, r.locationId), r]));
  }

  private async shortageMessage(
    m: MoveInput,
    effect: { locationId: string; onHand: number; reserved: number },
    level: LockedLevel,
    variant: { code: string; name: string; product: { name: string } },
  ): Promise<string> {
    const item = `${variant.product.name}${variant.name === 'Default' ? '' : ` – ${variant.name}`} (${variant.code})`;
    const path = (await this.locations.withPaths()).find((l) => l.id === effect.locationId)?.path ?? 'that location';
    const available = level.onHand - level.reserved;

    if (effect.reserved > 0) return `Only ${available} of ${item} free to reserve at ${path}`;
    if (effect.reserved < 0) {
      return `Only ${level.reserved} of ${item} reserved at ${path}` + (effect.onHand < 0 ? ' — reserve it for the order first' : '');
    }
    return (
      `Not enough ${item} at ${path}: ${available} available, ${m.quantity} needed` +
      (level.reserved > 0 ? ` (another ${level.reserved} reserved for orders)` : '')
    );
  }
}
