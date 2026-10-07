import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(includeInactive: boolean) {
    return this.prisma.category.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async create(userId: string, dto: CreateCategoryDto) {
    const name = dto.name.trim();
    await this.assertNameFree(name);
    const category = await this.prisma.category.create({ data: { name } });
    await this.audit.log({ userId, action: 'CATEGORY_CREATED', entity: 'Category', entityId: category.id, data: { name } });
    return category;
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Category not found');
    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== before.name.toLowerCase()) await this.assertNameFree(name, id);

    const category = await this.prisma.category.update({
      where: { id },
      data: { name, active: dto.active },
    });
    await this.audit.log({
      userId,
      action: 'CATEGORY_UPDATED',
      entity: 'Category',
      entityId: id,
      data: { before: { name: before.name, active: before.active }, after: { name: category.name, active: category.active } },
    });
    return category;
  }

  /** Names are unique ignoring case ("Chairs" and "chairs" are the same). */
  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.category.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) },
    });
    if (clash) throw new ConflictException(`Category "${clash.name}" already exists`);
  }
}
