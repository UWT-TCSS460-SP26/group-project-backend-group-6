import { PrismaClient, Role } from '../src/generated/prisma';
 
const prisma = new PrismaClient();
 
async function main() {
  console.log('Seeding database...');
 
  // ── Admin user ─────────────────────────────────────────────────────────────
  // dev-login find-or-creates regular users, but admins must be pre-seeded.
  // Add as many admin accounts as your team needs.
 
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      email: 'admin@tcss460.local',
      username: 'admin',
      displayName: 'Admin',
      role: Role.admin,
    },
  });
 
  console.log(`  ✓ Admin user: ${admin.username} (id=${admin.id})`);
 
  // ── Optional: a couple of regular users for manual testing ─────────────────
 
  const alice = await prisma.user.upsert({
    where: { username: 'alice' },
    update: {},
    create: {
      email: 'alice@tcss460.local',
      username: 'alice',
      displayName: 'Alice',
      role: Role.user,
    },
  });
 
  const bob = await prisma.user.upsert({
    where: { username: 'bob' },
    update: {},
    create: {
      email: 'bob@tcss460.local',
      username: 'bob',
      displayName: 'Bob',
      role: Role.user,
    },
  });
 
  console.log(`  ✓ Regular users: ${alice.username}, ${bob.username}`);
 
  // ── Sample ratings on a well-known TMDB movie (Fight Club = 550) ───────────
 
  await prisma.rating.upsert({
    where: { userId_tmdbId_mediaType: { userId: alice.id, tmdbId: 550, mediaType: 'movie' } },
    update: {},
    create: { userId: alice.id, tmdbId: 550, mediaType: 'movie', score: 4.5 },
  });
 
  await prisma.rating.upsert({
    where: { userId_tmdbId_mediaType: { userId: bob.id, tmdbId: 550, mediaType: 'movie' } },
    update: {},
    create: { userId: bob.id, tmdbId: 550, mediaType: 'movie', score: 3.5 },
  });
 
  console.log('  ✓ Sample ratings seeded');
  console.log('Seeding complete.');
}
 
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });