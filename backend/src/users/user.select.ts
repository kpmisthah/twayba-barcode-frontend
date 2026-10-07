import { Prisma } from '@prisma/client';

/** Fields safe to return to clients — never includes passwordHash. */
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
