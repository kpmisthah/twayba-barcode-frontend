import { Role } from '@prisma/client';

/** The authenticated user attached to each request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  /** Sites this user may change stock in; empty = all (see SiteAccessService). */
  siteIds: string[];
}

export interface JwtPayload {
  sub: string;
  role: Role;
}
