import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, MovementType, Prisma, StocktakeStatus, VariantKind } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { nextCounter } from '../catalog/products.service.js';
import { withDescendants } from '../locations/location-tree.js';
import { LocationsService, LocationWithPath } from '../locations/locations.service.js';
import { SiteAccessService } from '../locations/site-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MoveInput, StockService } from '../stock/stock.service.js';
import { CountDto, CreateStocktakeDto, ListStocktakesQuery } from './dto/stocktake.dto.js';

type Tx = Prisma.TransactionClient;

const SYSTEM: LocationType[] = [LocationType.TRANSIT, LocationType.DAMAGED];
const OPEN: StocktakeStatus[] = [StocktakeStatus.COUNTING, StocktakeStatus.SUBMITTED];

export function stocktakeCode(n: number) {
  return `ST-${String(n).padStart(6, '0')}`;
}

@Injectable()
export class StocktakesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
    private readonly locations: LocationsService,
    private readonly sites: SiteAccessService,
  ) {}

  /** Starts a count of a location: the expected list is everything on hand there right now. */
  async create(user: AuthUser, dto: CreateStocktakeDto) {
    const all = await this.locations.withPaths();
    const location = all.find((l) => l.id === dto.locationId);
    if (!location) throw new NotFoundException('Location not found');
    await this.sites.assert(user, [location.id]);
    if (SYSTEM.includes(location.type)) throw new BadRequestException(`${location.name} can't be stocktaken`);
    if (!location.active) throw new BadRequestException(`${location.name} is hidden`);
    const scope = this.scope(all, location.id);

    // Two counts of the same shelf at once would fight over the same stock.
    const open = await this.prisma.stocktake.findMany({ where: { status: { in: OPEN } }, select: { code: true, locationId: true } });
    for (const o of open) {
      const theirs = new Set(this.scope(all, o.locationId).map((l) => l.id));
      if (scope.some((l) => theirs.has(l.id)) || theirs.has(location.id)) {
        const path = all.find((l) => l.id === o.locationId)?.path ?? 'an overlapping location';
        throw new ConflictException(`${o.code} is already counting ${path} — finish or cancel it first`);
      }
    }

    const levels = await this.prisma.stockLevel.findMany({
      where: { locationId: { in: scope.map((l) => l.id) }, onHand: { gt: 0 } },
      select: { variantId: true, locationId: true, onHand: true },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const number = await nextCounter(tx, 'stocktake');
      const st = await tx.stocktake.create({
        data: {
          number,
          code: stocktakeCode(number),
          locationId: location.id,
          note: dto.note?.trim() || null,
          createdById: user.id,
          lines: { create: levels.map((l) => ({ variantId: l.variantId, locationId: l.locationId, expected: l.onHand })) },
        },
      });
      await this.audit.log(
        { userId: user.id, action: 'STOCKTAKE_STARTED', entity: 'Stocktake', entityId: st.id, data: { code: st.code, location: location.path } },
        tx,
      );
      return st;
    });
    return this.get(created.id);
  }

  async get(id: string) {
    const st = await this.prisma.stocktake.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        lines: {
          include: {
            variant: { select: { id: true, kind: true, code: true, name: true, product: { select: { id: true, name: true, images: true } } } },
          },
        },
      },
    });
    if (!st) throw new NotFoundException('Stocktake not found');

    const all = await this.locations.withPaths();
    const byId = new Map(all.map((l) => [l.id, l]));
    // Live stock, so the screen shows differences against what the system holds now.
    const levels = await this.prisma.stockLevel.findMany({
      where: { OR: st.lines.map((l) => ({ variantId: l.variantId, locationId: l.locationId })) },
      select: { variantId: true, locationId: true, onHand: true },
    });
    const current = new Map(levels.map((l) => [`${l.variantId}:${l.locationId}`, l.onHand]));
    const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

    const lines = st.lines
      .map((l) => {
        const onHand = l.onHandAtApproval ?? current.get(`${l.variantId}:${l.locationId}`) ?? 0;
        return {
          ...l,
          path: byId.get(l.locationId)?.path ?? '?',
          onHand,
          variance: l.adjustment ?? (l.counted === null ? null : l.counted - (l.onHandAtCount ?? onHand)),
        };
      })
      .sort((a, b) => collator.compare(a.path, b.path) || collator.compare(a.variant.product.name, b.variant.product.name));

    return {
      ...st,
      location: { id: st.locationId, path: byId.get(st.locationId)?.path ?? '?' },
      /** Where counts can be entered: stock-holding spaces inside the stocktake's location. */
      spaces: this.countable(all, st.locationId).map((l) => ({ id: l.id, code: l.code, path: l.path })),
      lines,
    };
  }

  async list(query: ListStocktakesQuery) {
    const items = await this.prisma.stocktake.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    });
    const paths = new Map((await this.locations.withPaths()).map((l) => [l.id, l.path]));
    return items.map((s) => ({ ...s, locationPath: paths.get(s.locationId) ?? '?' }));
  }

  /** Records a count. `add` is atomic, so several people can scan into the same stocktake. */
  async count(user: AuthUser, id: string, dto: CountDto) {
    const st = await this.prisma.stocktake.findUnique({ where: { id } });
    if (!st) throw new NotFoundException('Stocktake not found');
    if (st.status !== StocktakeStatus.COUNTING) throw new BadRequestException(`${st.code} is ${st.status.toLowerCase()} — counting is closed`);

    const all = await this.locations.withPaths();
    const space = this.countable(all, st.locationId).find((l) => l.id === dto.locationId);
    if (!space) throw new BadRequestException('Choose a space inside the location being counted');
    await this.sites.assert(user, [space.id]);

    const variant = await this.prisma.productVariant.findUnique({ where: { id: dto.variantId }, select: { kind: true, product: { select: { name: true } } } });
    if (!variant) throw new NotFoundException('Item not found');
    if (variant.kind === VariantKind.KIT) throw new BadRequestException(`${variant.product.name} is a kit — count each box`);

    const key = { stocktakeId_variantId_locationId: { stocktakeId: id, variantId: dto.variantId, locationId: dto.locationId } };
    await this.prisma.$transaction(async (tx) => {
      // Something found that the system didn't expect here: add a line (expected = what's on record, normally 0).
      const exists = await tx.stocktakeLine.findUnique({ where: key, select: { id: true } });
      if (!exists) {
        const level = await tx.stockLevel.findUnique({
          where: { variantId_locationId: { variantId: dto.variantId, locationId: dto.locationId } },
          select: { onHand: true },
        });
        await tx.stocktakeLine.create({
          data: { stocktakeId: id, variantId: dto.variantId, locationId: dto.locationId, expected: level?.onHand ?? 0 },
        });
      }
      // Remember what the system held at this moment: approval applies counted − this.
      const onHandNow =
        (
          await tx.stockLevel.findUnique({
            where: { variantId_locationId: { variantId: dto.variantId, locationId: dto.locationId } },
            select: { onHand: true },
          })
        )?.onHand ?? 0;
      if (dto.add !== undefined) {
        await tx.$executeRaw`
          UPDATE stocktake_lines
          SET counted = GREATEST(COALESCE(counted, 0) + ${dto.add}, 0), "onHandAtCount" = ${onHandNow},
              "countedById" = ${user.id}::uuid, "countedAt" = now()
          WHERE "stocktakeId" = ${id}::uuid AND "variantId" = ${dto.variantId}::uuid AND "locationId" = ${dto.locationId}::uuid`;
      } else {
        await tx.stocktakeLine.update({
          where: key,
          data: { counted: dto.counted, onHandAtCount: onHandNow, countedById: user.id, countedAt: new Date() },
        });
      }
    });
    return this.prisma.stocktakeLine.findUniqueOrThrow({ where: key });
  }

  async submit(user: AuthUser, id: string, uncountedAsZero: boolean) {
    const st = await this.mustBe(id, [StocktakeStatus.COUNTING]);
    const uncounted = await this.prisma.stocktakeLine.count({ where: { stocktakeId: id, counted: null } });
    if (uncounted && !uncountedAsZero) {
      throw new BadRequestException(`${uncounted} item(s) not counted yet — count them, or confirm they were not found`);
    }
    await this.prisma.$transaction(async (tx) => {
      // "Not found" items count as 0 against what the system holds now.
      const missing = await tx.stocktakeLine.findMany({ where: { stocktakeId: id, counted: null } });
      for (const line of missing) {
        const level = await tx.stockLevel.findUnique({
          where: { variantId_locationId: { variantId: line.variantId, locationId: line.locationId } },
          select: { onHand: true },
        });
        await tx.stocktakeLine.update({
          where: { id: line.id },
          data: { counted: 0, onHandAtCount: level?.onHand ?? 0, countedById: user.id, countedAt: new Date() },
        });
      }
      await tx.stocktake.update({ where: { id }, data: { status: StocktakeStatus.SUBMITTED, submittedById: user.id, submittedAt: new Date() } });
      await this.audit.log({ userId: user.id, action: 'STOCKTAKE_SUBMITTED', entity: 'Stocktake', entityId: id, data: { code: st.code, uncountedAsZero: uncounted } }, tx);
    });
    return this.get(id);
  }

  /**
   * Applies the differences as ADJUSTMENT movements. Each difference is counted − what the system
   * held when that item was counted, applied to today's stock (rows locked) — so a chair sold
   * after it was counted is not "found" again.
   */
  async approve(user: AuthUser, id: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const [locked] = await tx.$queryRaw<{ status: StocktakeStatus; code: string }[]>`
          SELECT status, code FROM stocktakes WHERE id = ${id}::uuid FOR UPDATE`;
        if (!locked) throw new NotFoundException('Stocktake not found');
        if (locked.status !== StocktakeStatus.SUBMITTED) throw new BadRequestException(`${locked.code} must be submitted before approval`);

        const lines = await tx.stocktakeLine.findMany({ where: { stocktakeId: id } });
        const onHand = await this.lockOnHand(tx, lines);
        const moves: MoveInput[] = [];
        for (const line of lines) {
          const now = onHand.get(`${line.variantId}:${line.locationId}`) ?? 0;
          const adjustment = (line.counted ?? 0) - (line.onHandAtCount ?? line.expected);
          await tx.stocktakeLine.update({ where: { id: line.id }, data: { onHandAtApproval: now, adjustment } });
          if (adjustment !== 0) {
            moves.push({
              type: MovementType.ADJUSTMENT,
              variantId: line.variantId,
              quantity: Math.abs(adjustment),
              ...(adjustment > 0 ? { toLocationId: line.locationId } : { fromLocationId: line.locationId }),
              reason: 'Stocktake',
              reference: locked.code,
            });
          }
        }
        await this.stock.apply(user.id, moves, tx);
        await tx.stocktake.update({ where: { id }, data: { status: StocktakeStatus.APPROVED, approvedById: user.id, approvedAt: new Date() } });
        await this.audit.log(
          { userId: user.id, action: 'STOCKTAKE_APPROVED', entity: 'Stocktake', entityId: id, data: { code: locked.code, adjustments: moves.length } },
          tx,
        );
      },
      { timeout: 30_000 },
    );
    return this.get(id);
  }

  /** Send back for recounting. */
  async reopen(user: AuthUser, id: string) {
    const st = await this.mustBe(id, [StocktakeStatus.SUBMITTED]);
    await this.prisma.stocktake.update({ where: { id }, data: { status: StocktakeStatus.COUNTING, submittedById: null, submittedAt: null } });
    await this.audit.log({ userId: user.id, action: 'STOCKTAKE_REOPENED', entity: 'Stocktake', entityId: id, data: { code: st.code } });
    return this.get(id);
  }

  async cancel(user: AuthUser, id: string) {
    const st = await this.mustBe(id, OPEN);
    await this.prisma.stocktake.update({ where: { id }, data: { status: StocktakeStatus.CANCELLED } });
    await this.audit.log({ userId: user.id, action: 'STOCKTAKE_CANCELLED', entity: 'Stocktake', entityId: id, data: { code: st.code } });
    return this.get(id);
  }

  // ---------------------------------------------------------------- helpers

  private async mustBe(id: string, statuses: StocktakeStatus[]) {
    const st = await this.prisma.stocktake.findUnique({ where: { id } });
    if (!st) throw new NotFoundException('Stocktake not found');
    if (!statuses.includes(st.status)) throw new BadRequestException(`${st.code} is ${st.status.toLowerCase()}`);
    return st;
  }

  private scope(all: LocationWithPath[], locationId: string) {
    return withDescendants(all, [locationId]).filter((l) => !SYSTEM.includes(l.type));
  }

  /** Visible locations with nothing visible inside — where stock actually sits. */
  private countable(all: LocationWithPath[], locationId: string) {
    const parents = new Set(all.filter((l) => l.active && l.parentId).map((l) => l.parentId));
    return this.scope(all, locationId).filter((l) => l.active && !parents.has(l.id));
  }

  private async lockOnHand(tx: Tx, lines: { variantId: string; locationId: string }[]) {
    if (!lines.length) return new Map<string, number>();
    const ids = (
      await tx.stockLevel.findMany({ where: { OR: lines.map((l) => ({ variantId: l.variantId, locationId: l.locationId })) }, select: { id: true } })
    ).map((r) => r.id);
    const rows = ids.length
      ? await tx.$queryRaw<{ variantId: string; locationId: string; onHand: number }[]>`
          SELECT "variantId", "locationId", "onHand" FROM stock_levels WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`
      : [];
    return new Map(rows.map((r) => [`${r.variantId}:${r.locationId}`, r.onHand]));
  }
}
