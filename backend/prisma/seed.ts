import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/common/password.js';

const prisma = new PrismaClient();

/** Creates the first admin account if no admin exists yet. Safe to run repeatedly. */
async function main() {
  const existing = await prisma.user.count({ where: { role: Role.ADMIN } });
  if (existing > 0) {
    console.log('Admin already exists — nothing to seed.');
    return;
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@twayba.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error('Set SEED_ADMIN_PASSWORD in .env');

  await prisma.user.create({
    data: {
      name: 'Administrator',
      email,
      role: Role.ADMIN,
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Created admin ${email} — change this password after first login.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
