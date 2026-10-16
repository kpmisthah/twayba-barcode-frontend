import { Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, Prisma, ProductStatus, VariantKind } from '@prisma/client';
import { withDescendants } from '../locations/location-tree.js';
import { LocationsService } from '../locations/locations.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListMovementsQuery } from './dto/stock.dto.js';
import { kitAvailability } from './kit-math.js';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const byPath = (a: { path: string }, b: { path: string }) => collator.compare(a.path, b.path);

/** Read-only stock views. Stock is never written here — see StockService. */
@Injectable()
export class StockQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  /**
   * Stock of every box / variant of a product.
   * "In store" counts real locations only; In Transit and Damaged are shown separately.
   */
  async productStock(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        type: true,
        minStock: true,
        variants: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            kind: true,
            code: true,
            name: true,
            active: true,
            components: { select: { componentVariantId: true, quantity: true } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    const levels = await this.prisma.stockLevel.findMany({
      where: { variant: { productId }, OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] },
    });
    const paths = new Map((await this.locations.withPaths()).map((l) => [l.id, l]));

    const items = product.variants
      .filter((v) => v.kind !== VariantKind.KIT)
      .map((v) => {
        const totals = { onHand: 0, reserved: 0, available: 0, inTransit: 0, damaged: 0 };
        const rows = levels
          .filter((l) => l.variantId === v.id)
          .map((l) => {
            const loc = paths.get(l.locationId)!;
            if (loc.type === LocationType.TRANSIT) totals.inTransit += l.onHand;
            else if (loc.type === LocationType.DAMAGED) totals.damaged += l.onHand;
            else {
              totals.onHand += l.onHand;
              totals.reserved += l.reserved;
            }
            return {
              locationId: l.locationId,
              path: loc.path,
              site: loc.pathNames[0],
              type: loc.type,
              onHand: l.onHand,
              reserved: l.reserved,
              available: l.onHand - l.reserved,
            };
          })
          .sort(byPath);
        totals.available = totals.onHand - totals.reserved;
        return {
          variantId: v.id,
          kind: v.kind,
          code: v.code,
          name: v.name,
          active: v.active,
          totals,
          low: v.kind === VariantKind.STANDARD && product.minStock > 0 && totals.available < product.minStock,
          locations: rows,
        };
      });

    const kitVariant = product.variants.find((v) => v.kind === VariantKind.KIT);
    let kit = null;
    if (kitVariant) {
      const availability = kitAvailability(
        kitVariant.components.map((c) => ({
          variantId: c.componentVariantId,
          perKit: c.quantity,
          available: items.find((i) => i.variantId === c.componentVariantId)?.totals.available ?? 0,
        })),
      );
      kit = { ...availability, low: product.minStock > 0 && availability.sellable < product.minStock };
    }

    return { productId: product.id, minStock: product.minStock, items, kit };
  }

  /**
   * Items below their product's minimum stock (available in real locations). A kit counts in
   * complete kits; a normal product is checked per variant.
   */
  async lowStock() {
    const products = await this.prisma.product.findMany({
      where: { minStock: { gt: 0 }, status: ProductStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        images: true,
        minStock: true,
        variants: {
          where: { active: true },
          select: { id: true, kind: true, code: true, name: true, components: { select: { componentVariantId: true, quantity: true } } },
        },
      },
    });
    const levels = await this.prisma.stockLevel.findMany({
      where: {
        variant: { product: { minStock: { gt: 0 }, status: ProductStatus.ACTIVE } },
        location: { type: { notIn: [LocationType.TRANSIT, LocationType.DAMAGED] } },
      },
      select: { variantId: true, onHand: true, reserved: true },
    });
    const available = new Map<string, number>();
    for (const l of levels) available.set(l.variantId, (available.get(l.variantId) ?? 0) + l.onHand - l.reserved);

    const rows: { productId: string; name: string; image?: string; variantId: string; code: string; available: number; minStock: number }[] = [];
    for (const p of products) {
      const kit = p.variants.find((v) => v.kind === VariantKind.KIT);
      if (kit) {
        const { sellable } = kitAvailability(
          kit.components.map((c) => ({ variantId: c.componentVariantId, perKit: c.quantity, available: available.get(c.componentVariantId) ?? 0 })),
        );
        if (sellable < p.minStock) rows.push({ productId: p.id, name: `${p.name} (complete kits)`, image: p.images[0], variantId: kit.id, code: kit.code, available: sellable, minStock: p.minStock });
        continue;
      }
      for (const v of p.variants.filter((x) => x.kind === VariantKind.STANDARD)) {
        const n = available.get(v.id) ?? 0;
        if (n < p.minStock) {
          rows.push({ productId: p.id, name: v.name === 'Default' ? p.name : `${p.name} – ${v.name}`, image: p.images[0], variantId: v.id, code: v.code, available: n, minStock: p.minStock });
        }
      }
    }
    // Emptiest first.
    return rows.sort((a, b) => a.available / a.minStock - b.available / b.minStock || collator.compare(a.name, b.name));
  }

  /** Everything stored in a location and the locations inside it (e.g. a whole shelf). */
  async locationStock(locationId: string) {
    const all = await this.locations.withPaths();
    const location = all.find((l) => l.id === locationId);
    if (!location) throw new NotFoundException('Location not found');
    const scope = withDescendants(all, [locationId]);
    const byId = new Map(scope.map((l) => [l.id, l]));

    const levels = await this.prisma.stockLevel.findMany({
      where: { locationId: { in: scope.map((l) => l.id) }, OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] },
      include: {
        variant: {
          select: {
            id: true,
            kind: true,
            code: true,
            name: true,
            product: { select: { id: true, name: true, images: true } },
          },
        },
      },
    });

    const items = levels
      .map((l) => ({
        locationId: l.locationId,
        path: byId.get(l.locationId)!.path,
        variant: l.variant,
        onHand: l.onHand,
        reserved: l.reserved,
        available: l.onHand - l.reserved,
      }))
      .sort((a, b) => byPath(a, b) || collator.compare(a.variant.product.name, b.variant.product.name));

    return { location, items };
  }

  async movements(query: ListMovementsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.StockMovementWhereInput = {
      ...(query.variantId && { variantId: query.variantId }),
      ...(query.productId && { variant: { productId: query.productId } }),
      ...(query.type && { type: query.type }),
      ...(query.locationId && { OR: [{ fromLocationId: query.locationId }, { toLocationId: query.locationId }] }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          variant: { select: { id: true, code: true, name: true, product: { select: { id: true, name: true } } } },
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    const paths = new Map((await this.locations.withPaths()).map((l) => [l.id, l.path]));
    const items = rows.map(({ fromLocationId, toLocationId, ...m }) => ({
      ...m,
      from: fromLocationId ? { id: fromLocationId, path: paths.get(fromLocationId) ?? '?' } : null,
      to: toLocationId ? { id: toLocationId, path: paths.get(toLocationId) ?? '?' } : null,
    }));
    return { items, total, page, pageSize };
  }
}
