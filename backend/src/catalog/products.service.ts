import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BarcodeType,
  Prisma,
  ProductType,
  VariantKind,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  componentCode,
  componentName,
  CODE_PREFIX,
  LOCATION_PREFIX,
  productCode,
  variantCode,
  variantName,
} from './codes.js';
import {
  CreateProductDto,
  ListProductsQuery,
  NewComponentDto,
  NewVariantDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/product.dto.js';

type Tx = Prisma.TransactionClient;

/**
 * "TW-123…" and "LOC-123…" are reserved for generated product and location codes,
 * so manual entries can never collide with them (or make a scan ambiguous).
 */
const RESERVED_CODE = new RegExp(`^(${CODE_PREFIX}|${LOCATION_PREFIX})-\\d`, 'i');

export const productDetailInclude = {
  category: { select: { id: true, name: true } },
  taxRate: { select: { id: true, name: true, rate: true } },
  variants: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      barcodes: { orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] },
      components: {
        include: {
          componentVariant: { select: { id: true, code: true, sku: true, name: true, active: true } },
        },
      },
    },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ read

  async list(query: ListProductsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim();

    const where: Prisma.ProductWhereInput = {
      status: query.status,
      type: query.type,
      categoryId: query.categoryId,
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          {
            variants: {
              some: {
                OR: [
                  { sku: { contains: q, mode: 'insensitive' } },
                  { code: { contains: q, mode: 'insensitive' } },
                  { barcodes: { some: { code: q } } },
                ],
              },
            },
          },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { id: true, name: true } },
          variants: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, kind: true, code: true, sku: true, name: true, price: true, active: true },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: productDetailInclude });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** Resolve a scanned code to its item. Unknown codes → 404. */
  async lookup(code: string) {
    const barcode = await this.prisma.barcode.findUnique({
      where: { code: code.trim() },
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true, type: true, status: true, images: true, minStock: true },
            },
            usedInKits: {
              include: { kitVariant: { select: { id: true, code: true, name: true, productId: true } } },
            },
          },
        },
      },
    });
    if (!barcode) throw new NotFoundException(`No item has the barcode "${code}"`);
    return barcode;
  }

  // ---------------------------------------------------------------- create

  async create(userId: string, dto: CreateProductDto) {
    const taxRateId = await this.resolveTaxRate(dto.taxRateId);
    if (dto.categoryId) await this.assertCategory(dto.categoryId);

    const isKit = dto.type === ProductType.KIT;
    if (isKit && !dto.kit) throw new BadRequestException('A kit needs its boxes');
    if (!isKit && !dto.variants?.length) throw new BadRequestException('Add at least one variant');

    const rows = isKit ? dto.kit!.components : dto.variants!;
    const skus = [isKit ? dto.kit!.sku : undefined, ...rows.map((r) => r.sku)];
    const barcodes = rows.map((r) => r.barcode);
    this.assertManualCodes(skus, barcodes);
    if (!isKit) assertUniqueVariantNames(dto.variants!);
    await this.assertCodesFree(skus, barcodes);

    const product = await this.withConflicts(() =>
      this.prisma.$transaction(async (tx) => {
        const number = await nextCounter(tx, 'product');
        const base = productCode(number);
        const created = await tx.product.create({
          data: {
            number,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            type: dto.type,
            status: dto.status,
            categoryId: dto.categoryId ?? null,
            brand: dto.brand?.trim() || null,
            taxRateId,
            minStock: dto.minStock ?? 0,
            images: dto.images ?? [],
          },
        });

        if (isKit) {
          await this.createKitVariants(tx, created.id, base, dto.kit!);
        } else {
          const single = dto.variants!.length === 1 && variantName(dto.variants![0].color, dto.variants![0].size) === 'Default';
          for (const [i, v] of dto.variants!.entries()) {
            await this.createStandardVariant(tx, created.id, single ? base : variantCode(base, i + 1), v, i);
          }
        }
        return tx.product.findUniqueOrThrow({ where: { id: created.id }, include: productDetailInclude });
      }),
    );

    await this.audit.log({
      userId,
      action: 'PRODUCT_CREATED',
      entity: 'Product',
      entityId: product.id,
      data: { name: product.name, type: product.type, codes: product.variants.map((v) => v.code) },
    });
    return product;
  }

  private createStandardVariant(tx: Tx, productId: string, code: string, v: NewVariantDto, sortOrder: number) {
    return tx.productVariant.create({
      data: {
        productId,
        kind: VariantKind.STANDARD,
        code,
        sku: v.sku?.trim() || code,
        name: variantName(v.color, v.size),
        color: v.color?.trim() || null,
        size: v.size?.trim() || null,
        price: v.price,
        costPrice: v.costPrice ?? null,
        sortOrder,
        barcodes: { create: barcodeRows(code, v.barcode) },
      },
    });
  }

  private async createKitVariants(
    tx: Tx,
    productId: string,
    base: string,
    kit: { sku?: string; price: number; costPrice?: number; components: NewComponentDto[] },
  ) {
    // The kit unit itself: priced and sold, but never stocked or scanned.
    const kitVariant = await tx.productVariant.create({
      data: {
        productId,
        kind: VariantKind.KIT,
        code: base,
        sku: kit.sku?.trim() || base,
        name: 'Complete kit',
        price: kit.price,
        costPrice: kit.costPrice ?? null,
      },
    });
    for (const [i, c] of kit.components.entries()) {
      await this.createComponent(tx, productId, kitVariant.id, base, i, c);
    }
    return kitVariant;
  }

  private async createComponent(
    tx: Tx,
    productId: string,
    kitVariantId: string,
    base: string,
    index: number,
    c: NewComponentDto,
  ) {
    const code = componentCode(base, index);
    const component = await tx.productVariant.create({
      data: {
        productId,
        kind: VariantKind.COMPONENT,
        code,
        sku: c.sku?.trim() || code,
        name: componentName(index, c.label),
        sortOrder: index + 1,
        barcodes: { create: barcodeRows(code, c.barcode) },
      },
    });
    await tx.kitComponent.create({
      data: { kitVariantId, componentVariantId: component.id, quantity: c.quantity },
    });
    return component;
  }

  // ---------------------------------------------------------------- update

  async update(userId: string, id: string, dto: UpdateProductDto) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Product not found');
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    if (dto.taxRateId) await this.resolveTaxRate(dto.taxRateId);

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        categoryId: dto.categoryId,
        brand: dto.brand === undefined ? undefined : dto.brand?.trim() || null,
        taxRateId: dto.taxRateId,
        minStock: dto.minStock,
        status: dto.status,
        images: dto.images,
      },
      include: productDetailInclude,
    });

    await this.audit.log({
      userId,
      action: 'PRODUCT_UPDATED',
      entity: 'Product',
      entityId: id,
      data: { changes: changedFields(before, dto) } as Prisma.InputJsonValue,
    });
    return product;
  }

  async addVariant(userId: string, productId: string, dto: NewVariantDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { select: { name: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.type !== ProductType.STANDARD) {
      throw new BadRequestException('Kits get boxes, not variants — use "Add box"');
    }
    const name = variantName(dto.color, dto.size);
    if (name === 'Default') throw new BadRequestException('Enter a colour or size for the new variant');
    if (product.variants.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
      throw new ConflictException(`Variant "${name}" already exists`);
    }
    this.assertManualCodes([dto.sku], [dto.barcode]);
    await this.assertCodesFree([dto.sku], [dto.barcode]);

    const n = product.variants.length + 1;
    const variant = await this.withConflicts(() =>
      this.prisma.$transaction((tx) =>
        this.createStandardVariant(tx, productId, variantCode(productCode(product.number), n), dto, n - 1),
      ),
    );
    await this.audit.log({
      userId,
      action: 'VARIANT_ADDED',
      entity: 'ProductVariant',
      entityId: variant.id,
      data: { productId, code: variant.code, name: variant.name },
    });
    return this.get(productId);
  }

  async addComponent(userId: string, productId: string, dto: NewComponentDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { select: { id: true, kind: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    const kitVariant = product.variants.find((v) => v.kind === VariantKind.KIT);
    if (product.type !== ProductType.KIT || !kitVariant) {
      throw new BadRequestException('Only kit products have boxes');
    }
    this.assertManualCodes([dto.sku], [dto.barcode]);
    await this.assertCodesFree([dto.sku], [dto.barcode]);

    const index = product.variants.filter((v) => v.kind === VariantKind.COMPONENT).length;
    const component = await this.withConflicts(() =>
      this.prisma.$transaction((tx) =>
        this.createComponent(tx, productId, kitVariant.id, productCode(product.number), index, dto),
      ),
    );
    await this.audit.log({
      userId,
      action: 'KIT_BOX_ADDED',
      entity: 'ProductVariant',
      entityId: component.id,
      data: { productId, code: component.code, name: component.name, quantity: dto.quantity },
    });
    return this.get(productId);
  }

  async updateVariant(userId: string, variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { include: { variants: { select: { id: true, name: true } } } }, usedInKits: true },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    const data: Prisma.ProductVariantUpdateInput = {};
    const kind = variant.kind;
    const reject = (field: string) => {
      throw new BadRequestException(`"${field}" cannot be set on a ${kind.toLowerCase()} item`);
    };

    if (dto.sku !== undefined) {
      const sku = dto.sku.trim();
      if (sku !== variant.code) this.assertManualCodes([sku], []);
      if (sku !== variant.sku) await this.assertCodesFree([sku], []);
      data.sku = sku;
    }

    if (dto.color !== undefined || dto.size !== undefined) {
      if (kind !== VariantKind.STANDARD) reject('colour/size');
      const color = dto.color === undefined ? variant.color : dto.color?.trim() || null;
      const size = dto.size === undefined ? variant.size : dto.size?.trim() || null;
      const name = variantName(color, size);
      const clash = variant.product.variants.some(
        (v) => v.id !== variant.id && v.name.toLowerCase() === name.toLowerCase(),
      );
      if (clash) throw new ConflictException(`Variant "${name}" already exists`);
      Object.assign(data, { color, size, name });
    }

    if (dto.label !== undefined) {
      if (kind !== VariantKind.COMPONENT) reject('box label');
      data.name = componentName(variant.sortOrder - 1, dto.label);
    }

    if (dto.price !== undefined) {
      if (kind === VariantKind.COMPONENT) reject('price');
      data.price = dto.price;
    }
    if (dto.costPrice !== undefined) {
      if (kind === VariantKind.COMPONENT) reject('cost price');
      data.costPrice = dto.costPrice;
    }
    if (dto.active !== undefined) {
      if (kind === VariantKind.KIT) reject('active (change the product status instead)');
      data.active = dto.active;
    }
    if (dto.quantity !== undefined && kind !== VariantKind.COMPONENT) reject('quantity');

    const updated = await this.withConflicts(() =>
      this.prisma.$transaction(async (tx) => {
        if (dto.quantity !== undefined) {
          await tx.kitComponent.updateMany({
            where: { componentVariantId: variantId },
            data: { quantity: dto.quantity },
          });
        }
        return tx.productVariant.update({ where: { id: variantId }, data });
      }),
    );

    await this.audit.log({
      userId,
      action: 'VARIANT_UPDATED',
      entity: 'ProductVariant',
      entityId: variantId,
      data: {
        code: variant.code,
        before: {
          sku: variant.sku,
          name: variant.name,
          price: variant.price?.toString() ?? null,
          costPrice: variant.costPrice?.toString() ?? null,
          active: variant.active,
          quantity: variant.usedInKits[0]?.quantity ?? null,
        },
        changes: dto,
      } as unknown as Prisma.InputJsonValue,
    });
    return this.get(updated.productId);
  }

  // -------------------------------------------------------------- barcodes

  async addBarcode(userId: string, variantId: string, code: string) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Variant not found');
    if (variant.kind === VariantKind.KIT) {
      throw new BadRequestException('A kit has no barcode of its own — add barcodes to its boxes');
    }
    const value = code.trim();
    this.assertManualCodes([], [value]);
    await this.assertCodesFree([], [value]);

    const barcode = await this.withConflicts(() =>
      this.prisma.barcode.create({ data: { code: value, variantId, type: BarcodeType.SUPPLIER } }),
    );
    await this.audit.log({
      userId,
      action: 'BARCODE_ADDED',
      entity: 'Barcode',
      entityId: barcode.id,
      data: { code: value, variantCode: variant.code },
    });
    return this.get(variant.productId);
  }

  async setBarcodeActive(userId: string, barcodeId: string, active: boolean) {
    const barcode = await this.prisma.barcode.findUnique({
      where: { id: barcodeId },
      include: { variant: { select: { productId: true, code: true } } },
    });
    if (!barcode) throw new NotFoundException('Barcode not found');

    await this.prisma.barcode.update({
      where: { id: barcodeId },
      data: { active, deactivatedAt: active ? null : new Date() },
    });
    await this.audit.log({
      userId,
      action: active ? 'BARCODE_ACTIVATED' : 'BARCODE_DEACTIVATED',
      entity: 'Barcode',
      entityId: barcodeId,
      data: { code: barcode.code, variantCode: barcode.variant.code },
    });
    return this.get(barcode.variant.productId);
  }

  // ---------------------------------------------------------------- checks

  private async resolveTaxRate(taxRateId?: string): Promise<string | null> {
    if (taxRateId) {
      const rate = await this.prisma.taxRate.findUnique({ where: { id: taxRateId } });
      if (!rate || !rate.active) throw new BadRequestException('Choose an active tax rate');
      return rate.id;
    }
    const fallback = await this.prisma.taxRate.findFirst({ where: { isDefault: true, active: true } });
    return fallback?.id ?? null;
  }

  private async assertCategory(categoryId: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || !category.active) throw new BadRequestException('Choose an active category');
  }

  private assertManualCodes(skus: (string | undefined)[], barcodes: (string | undefined)[]) {
    const entered = [...skus, ...barcodes].map((v) => v?.trim()).filter((v): v is string => !!v);
    const reserved = entered.find((v) => RESERVED_CODE.test(v));
    if (reserved) {
      throw new BadRequestException(
        `"${reserved}" looks like a system code (${CODE_PREFIX}-… or ${LOCATION_PREFIX}-…). Leave it empty and the system will generate one.`,
      );
    }
    const dupes = entered.filter((v, i) => entered.indexOf(v) !== i);
    if (dupes.length) throw new BadRequestException(`"${dupes[0]}" is entered more than once`);
  }

  /** Friendly pre-check; the unique indexes still guard against races. */
  private async assertCodesFree(skus: (string | undefined)[], barcodes: (string | undefined)[]) {
    const skuList = skus.map((s) => s?.trim()).filter((s): s is string => !!s);
    const codeList = barcodes.map((b) => b?.trim()).filter((b): b is string => !!b);

    if (skuList.length) {
      const taken = await this.prisma.productVariant.findFirst({
        where: { sku: { in: skuList } },
        include: { product: { select: { name: true } } },
      });
      if (taken) throw new ConflictException(`SKU "${taken.sku}" is already used by ${taken.product.name} (${taken.name})`);
    }
    if (codeList.length) {
      const taken = await this.prisma.barcode.findFirst({
        where: { code: { in: codeList } },
        include: { variant: { include: { product: { select: { name: true } } } } },
      });
      if (taken) {
        const owner = `${taken.variant.product.name} (${taken.variant.name})`;
        throw new ConflictException(
          taken.active
            ? `Barcode "${taken.code}" already belongs to ${owner}`
            : `Barcode "${taken.code}" was used before by ${owner} and cannot be reused`,
        );
      }
    }
  }

  private async withConflicts<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException('That SKU or barcode was just taken by another item. Please try again.');
      }
      throw e;
    }
  }
}

/** Atomically increments a named counter and returns the new value. */
export async function nextCounter(tx: Tx, name: string): Promise<number> {
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO counters (name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
    RETURNING value`;
  return row.value;
}

/** Every stocked item gets its internal code as a barcode, plus the supplier's if given. */
function barcodeRows(internalCode: string, supplierCode?: string) {
  const rows: Prisma.BarcodeCreateWithoutVariantInput[] = [{ code: internalCode, type: BarcodeType.INTERNAL }];
  if (supplierCode?.trim()) rows.push({ code: supplierCode.trim(), type: BarcodeType.SUPPLIER });
  return rows;
}

function assertUniqueVariantNames(variants: NewVariantDto[]) {
  const names = variants.map((v) => variantName(v.color, v.size).toLowerCase());
  const dupe = names.find((n, i) => names.indexOf(n) !== i);
  if (dupe) throw new BadRequestException(`Two variants are both "${dupe}" — each needs a different colour/size`);
  if (variants.length > 1 && names.includes('default')) {
    throw new BadRequestException('When a product has several variants, each needs a colour or size');
  }
}

function changedFields(before: Record<string, unknown>, dto: object) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(dto)) {
    if (to === undefined) continue;
    const from = before[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) out[key] = { from, to };
  }
  return out;
}
