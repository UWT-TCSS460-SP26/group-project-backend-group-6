import { PrismaClient, Role } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const users = [
  { email: 'admin@dev.local', username: 'admin', displayName: 'Admin', role: Role.Admin, subjectId: 'seed|admin' },
  { email: 'alice@dev.local', username: 'alice', displayName: 'Alice', role: Role.User,  subjectId: 'seed|alice' },
  { email: 'bob@dev.local',   username: 'bob',   displayName: 'Bob',   role: Role.User,  subjectId: 'seed|bob' },
  { email: 'carol@dev.local', username: 'carol', displayName: 'Carol', role: Role.User,  subjectId: 'seed|carol' },
  { email: 'dave@dev.local',  username: 'dave',  displayName: 'Dave',  role: Role.User,  subjectId: 'seed|dave' },
  { email: 'eve@dev.local',   username: 'eve',   displayName: 'Eve',   role: Role.User,  subjectId: 'seed|eve' },
  { email: 'frank@dev.local', username: 'frank', displayName: 'Frank', role: Role.User,  subjectId: 'seed|frank' },
  { email: 'grace@dev.local', username: 'grace', displayName: 'Grace', role: Role.User,  subjectId: 'seed|grace' },
  { email: 'henry@dev.local', username: 'henry', displayName: 'Henry', role: Role.User,  subjectId: 'seed|henry' },
  { email: 'iris@dev.local',  username: 'iris',  displayName: 'Iris',  role: Role.User,  subjectId: 'seed|iris' },
  { email: 'jack@dev.local',  username: 'jack',  displayName: 'Jack',  role: Role.User,  subjectId: 'seed|jack' },
];

async function main() {
  // Upsert all users
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
  }
  console.log('Users seeded!');

  // Fetch created users so we have their real IDs
  const seededUsers = await prisma.user.findMany({
    where: { email: { in: users.map((u) => u.email) } },
    orderBy: { id: 'asc' },
  });

  const userId = (username: string) => seededUsers.find((u) => u.username === username)!.id;

  // 10 ratings spread across movies and TV — unique per [userId, tmdbId, mediaType]
  const ratings = [
    { username: 'alice', score: 9,  tmdbId: 27205,  mediaType: 'movie' as const }, // Inception
    { username: 'bob',   score: 8,  tmdbId: 157336, mediaType: 'movie' as const }, // Interstellar
    { username: 'carol', score: 10, tmdbId: 278,    mediaType: 'movie' as const }, // Shawshank Redemption
    { username: 'dave',  score: 7,  tmdbId: 550,    mediaType: 'movie' as const }, // Fight Club
    { username: 'eve',   score: 9,  tmdbId: 680,    mediaType: 'movie' as const }, // Pulp Fiction
    { username: 'frank', score: 8,  tmdbId: 603,    mediaType: 'movie' as const }, // The Matrix
    { username: 'grace', score: 10, tmdbId: 1396,   mediaType: 'tv' as const },    // Breaking Bad
    { username: 'henry', score: 9,  tmdbId: 1399,   mediaType: 'tv' as const },    // Game of Thrones
    { username: 'iris',  score: 8,  tmdbId: 66732,  mediaType: 'tv' as const },    // Stranger Things
    { username: 'jack',  score: 7,  tmdbId: 1396,   mediaType: 'tv' as const },    // Breaking Bad
  ];

  for (const r of ratings) {
    await prisma.rating.upsert({
      where: {
        userId_tmdbId_mediaType: {
          userId: userId(r.username),
          tmdbId: r.tmdbId,
          mediaType: r.mediaType,
        },
      },
      update: { score: r.score },
      create: {
        userId: userId(r.username),
        score: r.score,
        tmdbId: r.tmdbId,
        mediaType: r.mediaType,
      },
    });
  }
  console.log('Ratings seeded!');

  // 10 reviews — no unique constraint, so skip if user already has a review for that tmdbId
  const reviews = [
    {
      username: 'alice',
      tmdbId: 27205,
      mediaType: 'movie' as const,
      title: 'Mind-bending masterpiece',
      body: 'Inception redefines what a blockbuster can be. The layered dream sequences never feel gimmicky.',
    },
    {
      username: 'bob',
      tmdbId: 157336,
      mediaType: 'movie' as const,
      title: 'Visually stunning',
      body: 'Interstellar is gorgeous and emotionally resonant, even if the third act stretches believability.',
    },
    {
      username: 'carol',
      tmdbId: 278,
      mediaType: 'movie' as const,
      title: 'The greatest film ever made',
      body: 'The Shawshank Redemption is a timeless story about hope and resilience. Required watching.',
    },
    {
      username: 'dave',
      tmdbId: 550,
      mediaType: 'movie' as const,
      title: 'Provocative and unforgettable',
      body: 'Fight Club is pure chaos wrapped in a sharp social critique. Still feels relevant decades later.',
    },
    {
      username: 'eve',
      tmdbId: 680,
      mediaType: 'movie' as const,
      title: 'Tarantino at his peak',
      body: 'Pulp Fiction weaves multiple storylines into something totally unique. The dialogue alone is worth it.',
    },
    {
      username: 'frank',
      tmdbId: 603,
      mediaType: 'movie' as const,
      title: 'The one that started it all',
      body: 'The Matrix was a paradigm shift for action movies. The bullet-time sequences hold up surprisingly well.',
    },
    {
      username: 'grace',
      tmdbId: 1396,
      mediaType: 'tv' as const,
      title: 'Peak television',
      body: 'Breaking Bad is the best character arc ever put to screen. Walter White is terrifying and fascinating.',
    },
    {
      username: 'henry',
      tmdbId: 1399,
      mediaType: 'tv' as const,
      title: 'Epic in every sense',
      body: 'Game of Thrones (seasons 1–4) is unmatched in scope and political intrigue. Just stop before season 8.',
    },
    {
      username: 'iris',
      tmdbId: 66732,
      mediaType: 'tv' as const,
      title: 'Nostalgia done right',
      body: 'Stranger Things nails the 80s aesthetic without feeling like a parody. The Upside Down is genuinely creepy.',
    },
    {
      username: 'jack',
      tmdbId: 1396,
      mediaType: 'tv' as const,
      title: 'Rewatchable every year',
      body: 'Every rewatch of Breaking Bad reveals something new. Vince Gilligan crafted a near-perfect show.',
    },
  ];

  for (const r of reviews) {
    const uid = userId(r.username);
    const existing = await prisma.review.findFirst({
      where: { userId: uid, tmdbId: r.tmdbId, mediaType: r.mediaType },
    });
    if (!existing) {
      await prisma.review.create({
        data: {
          userId: uid,
          tmdbId: r.tmdbId,
          mediaType: r.mediaType,
          title: r.title,
          body: r.body,
        },
      });
    }
  }
  console.log('Reviews seeded!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());