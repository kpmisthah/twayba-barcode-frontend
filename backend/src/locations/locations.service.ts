import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Location, LocationType } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { locationCode } from '../catalog/codes.js';
import { nextCounter } from '../catalog/products.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateLocationsDto, UpdateLocationDto } from './dto/location.dto.js';
import {
  buildPaths,
  CHILD_TYPES,
  PATH_SEPARATOR,
  sortSiblings,
  SYSTEM_TYPES,
  withDescendants,
} from './location-tree.js';

export const TYPE_LABELS: Record<LocationType, string> = {
  SITE: 'site',
  FLOOR: 'floor',
  ROOM: 'room',
  SHELF: 'shelf',
  SPACE: 'space',
  TRANSIT: 'In Transit',
  DAMAGED: 'Damaged',
};

/** `siteId` is the top-level location (the site) it belongs to — itself for a site or system location. */
export type LocationWithPath = Location & { path: string; pathNames: string[]; siteId: string };

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Every location with its full path, in tree order (parents before children).
   * The whole table is loaded: even a large warehouse has only a few thousand.
   */
  async list(includeInactive: boolean): Promise<LocationWithPath[]> {
    const all = await this.withPaths();
    const roots = sortSiblings(all.filter((l) => !l.parentId)).map((l) => l.id);
    const ordered = withDescendants(all, roots);
    // A hidden location never has visible children (update() enforces it), so this hides whole branches.
    return includeInactive ? ordered : ordered.filter((l) => l.active);
  }

  async get(id: string) {
    const all = await this.withPaths();
    const location = all.find((l) => l.id === id);
    if (!location) throw new NotFoundException('Location not found');
    const children = sortSiblings(all.filter((l) => l.parentId === id));
    return { ...location, children };
  }

  /** Finds a location by the code on its label (what a scanner types). */
  async lookup(code: string) {
    const location = await this.prisma.location.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!location) throw new NotFoundException(`No location has the code "${code.trim()}"`);
    return this.get(location.id);
  }

  async create(userId: string, dto: CreateLocationsDto) {
    const names = dto.names.map((n) => n.trim()).filter(Boolean);
    if (!names.length) throw new BadRequestException('Enter at least one name');
    const lower = names.map((n) => n.toLowerCase());
    const dupe = names.find((_, i) => lower.indexOf(lower[i]) !== i);
    if (dupe) throw new BadRequestException(`"${dupe}" is entered more than once`);

    const parent = dto.parentId ? await this.prisma.location.findUnique({ where: { id: dto.parentId } }) : null;
    if (dto.parentId && !parent) throw new NotFoundException('Parent location not found');
    if (parent && !parent.active) throw new BadRequestException(`"${parent.name}" is hidden — show it first`);

    const allowed = CHILD_TYPES[parent?.type ?? 'ROOT'];
    if (!allowed.includes(dto.type)) {
      throw new BadRequestException(
        parent
          ? `A ${TYPE_LABELS[dto.type]} can't go inside a ${TYPE_LABELS[parent.type]}` +
              (allowed.length ? ` (add a ${allowed.map((t) => TYPE_LABELS[t]).join(' or ')})` : '')
          : 'Only sites can be added at the top level',
      );
    }

    if (parent && (await this.holdsStock(parent.id))) {
      throw new BadRequestException(
        `"${parent.name}" holds stock — move it out first, then add a ${TYPE_LABELS[dto.type]} inside`,
      );
    }

    const siblings = await this.prisma.location.findMany({ where: { parentId: parent?.id ?? null } });
    const clash = siblings.find((s) => lower.includes(s.name.toLowerCase()));
    if (clash) {
      throw new ConflictException(
        `"${clash.name}" already exists ${parent ? `in ${parent.name}` : 'as a site'}` + (clash.active ? '' : ' (hidden)'),
      );
    }

    const startOrder = siblings.reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1;
    const created = await this.prisma.$transaction(async (tx) => {
      const rows: Location[] = [];
      for (const [i, name] of names.entries()) {
        const code = locationCode(await nextCounter(tx, 'location'));
        const row = await tx.location.create({
          data: { type: dto.type, name, code, parentId: parent?.id ?? null, sortOrder: startOrder + i },
        });
        await this.audit.log(
          {
            userId,
            action: 'LOCATION_CREATED',
            entity: 'Location',
            entityId: row.id,
            data: { type: row.type, name, code, parentId: row.parentId },
          },
          tx,
        );
        rows.push(row);
      }
      return rows;
    });

    const all = await this.withPaths();
    return created.map((c) => all.find((l) => l.id === c.id)!);
  }

  async update(userId: string, id: string, dto: UpdateLocationDto) {
    const before = await this.prisma.location.findUnique({
      where: { id },
      include: { parent: true, children: { where: { active: true }, select: { id: true } } },
    });
    if (!before) throw new NotFoundException('Location not found');
    if (SYSTEM_TYPES.includes(before.type)) {
      throw new BadRequestException(`"${before.name}" is a system location and can't be changed`);
    }

    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== before.name.toLowerCase()) {
      const clash = await this.prisma.location.findFirst({
        where: { parentId: before.parentId, id: { not: id }, name: { equals: name, mode: 'insensitive' } },
      });
      if (clash) throw new ConflictException(`"${clash.name}" already exists here`);
    }

    if (dto.active === false && before.active && before.children.length) {
      throw new BadRequestException(`Hide everything inside "${before.name}" first`);
    }
    if (dto.active === false && before.active && (await this.holdsStock(id))) {
      throw new BadRequestException(`"${before.name}" still holds stock — move it out first`);
    }
    if (dto.active === true && !before.active && before.parent && !before.parent.active) {
      throw new BadRequestException(`"${before.parent.name}" is hidden — show it first`);
    }

    const location = await this.prisma.location.update({ where: { id }, data: { name, active: dto.active } });
    await this.audit.log({
      userId,
      action: 'LOCATION_UPDATED',
      entity: 'Location',
      entityId: id,
      data: {
        before: { name: before.name, active: before.active },
        after: { name: location.name, active: location.active },
      },
    });
    return this.get(id);
  }

  private async holdsStock(locationId: string): Promise<boolean> {
    const level = await this.prisma.stockLevel.findFirst({ where: { locationId, onHand: { gt: 0 } }, select: { id: true } });
    return !!level;
  }

  /** All locations with `path` ("Hamrun Shop › Top › Room 1") attached. */
  async withPaths(): Promise<LocationWithPath[]> {
    const rows = await this.prisma.location.findMany();
    const paths = buildPaths(rows);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const rootOf = (r: Location) => {
      let cur = r;
      for (let i = 0; i < 50 && cur.parentId && byId.has(cur.parentId); i++) cur = byId.get(cur.parentId)!;
      return cur.id;
    };
    return rows.map((r) => {
      const pathNames = paths.get(r.id)!;
      return { ...r, pathNames, path: pathNames.join(PATH_SEPARATOR), siteId: rootOf(r) };
    });
  }
}
