import { Role } from '@prisma/client';

/** The authenticated user attached to each request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  role: Role;
}
