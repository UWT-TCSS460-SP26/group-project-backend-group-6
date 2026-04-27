import { PrismaClient, Role } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@dev.local' },
    update: {},
    create: {
      email: 'admin@dev.local',
      username: 'admin',
      role: Role.admin,
    },
  });
  console.log('Admin user seeded!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());