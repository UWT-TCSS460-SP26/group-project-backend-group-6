import { PrismaClient, Role } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@dev.local' },
    update: {}, // if admin already exists, do nothing
    create: {
      email: 'admin@dev.local',
      username: 'admin',
      role: Role.ADMIN,
    },
  });
  console.log('Admin user seeded!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
