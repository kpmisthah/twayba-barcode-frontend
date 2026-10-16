import { ForbiddenException, Injectable } from '@nestjs/common';
import { LocationType, Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types.js';
import { LocationsService } from './locations.service.js';

/** Admins and managers work everywhere; site limits apply to everyone else who has some. */
const UNLIMITED: Role[] = [Role.ADMIN, Role.MANAGER];
const SYSTEM: LocationType[] = [LocationType.TRANSIT, LocationType.DAMAGED];

export function isLimited(user: AuthUser): boolean {
  return !UNLIMITED.includes(user.role) && user.siteIds.length > 0;
}

/**
 * "Receive, transfer, count and adjust stock only for permitted locations" (client brief §2).
 * A user with site limits may only touch locations inside those sites. The system locations
 * (In Transit, Damaged) belong to no site and are always allowed — the stock got there from a site.
 */
@Injectable()
export class SiteAccessService {
  constructor(private readonly locations: LocationsService) {}

  async assert(user: AuthUser, locationIds: (string | null | undefined)[]) {
    if (!isLimited(user)) return;
    const ids = [...new Set(locationIds.filter((id): id is string => !!id))];
    if (!ids.length) return;
    const all = new Map((await this.locations.withPaths()).map((l) => [l.id, l]));
    for (const id of ids) {
      const loc = all.get(id);
      if (!loc || SYSTEM.includes(loc.type)) continue;
      if (!user.siteIds.includes(loc.siteId)) {
        throw new ForbiddenException(`You can only work with stock at your own site(s) — ${loc.path} is not one of them`);
      }
    }
  }
}
