/// <reference types="jest" />
import request from 'supertest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/lib/prisma';

jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    rating: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('../../../src/middleware/requireAuth', () => ({
  requireAuth: [
    (req: any, _res: any, next: any) => {
      req.headers.authorization = 'Bearer fake-token';
      req.user = { sub: 'auth2|user1', role: 'User', email: 'user1@test.local' };
      next();
    },
  ],
  optionalAuth: [(_req: any, _res: any, next: any) => next()],
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireRoleAtLeast: () => (_req: any, _res: any, next: any) => next(),
  hasRoleAtLeast: () => true,
  ROLE_HIERARCHY: ['User', 'Moderator', 'Admin', 'SuperAdmin', 'Owner'],
}));

const mockLocalUser = {
  id: 1,
  subjectId: 'auth2|user1',
  email: 'user1@test.local',
  username: 'user1',
  firstName: null,
  lastName: null,
  role: 'User',
  createdAt: new Date(),
};

const mockMovieRating = {
  id: 1,
  score: 8,
  tmdbId: 27205,
  mediaType: 'movie',
  userId: 1,
  createdAt: new Date('2026-04-01T12:00:00Z'),
  updatedAt: new Date('2026-04-01T12:00:00Z'),
};

const mockTvRating = {
  id: 2,
  score: 9,
  tmdbId: 1396,
  mediaType: 'tv',
  userId: 1,
  createdAt: new Date('2026-04-10T12:00:00Z'),
  updatedAt: new Date('2026-04-10T12:00:00Z'),
};

const mockMovieTmdb = {
  id: 27205,
  title: 'Inception',
  overview: 'A thief who steals corporate secrets through dream-sharing.',
  release_date: '2010-07-16',
  poster_path: '/poster.jpg',
  genres: [{ id: 28, name: 'Action' }],
};

const mockTvTmdb = {
  id: 1396,
  name: 'Breaking Bad',
  overview: 'A chemistry teacher turns to manufacturing methamphetamine.',
  first_air_date: '2008-01-20',
  poster_path: '/bbposter.jpg',
  genres: [{ id: 18, name: 'Drama' }],
};

type FetchStub = { ok: boolean; status: number; json: () => Promise<unknown> };

const mockFetchSequence = (...stubs: FetchStub[]) => {
  let call = 0;
  jest
    .spyOn(global, 'fetch')
    .mockImplementation(() => Promise.resolve(stubs[call++] as unknown as Response));
};

const ok = (body: unknown): FetchStub => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
});

const notFound = (): FetchStub => ({
  ok: false,
  status: 404,
  json: () => Promise.resolve({ status_message: 'Not Found' }),
});

describe('GET /v1/users/me/ratings', () => {
  let originalTmdbKey: string | undefined;

  beforeEach(() => {
    originalTmdbKey = process.env.TMDB_API_KEY;
    process.env.TMDB_API_KEY = 'test-key';
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockLocalUser);
  });

  afterEach(() => {
    process.env.TMDB_API_KEY = originalTmdbKey;
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // ── Auth & env guards ───────────────────────────────────────────────────────

  it('returns 503 when TMDB_API_KEY is not set', async () => {
    delete process.env.TMDB_API_KEY;
    const res = await request(app).get('/v1/users/me/ratings');
    expect(res.status).toBe(503);
  });

  // ── Query param validation ──────────────────────────────────────────────────

  it('returns 400 when mediaType is invalid', async () => {
    const res = await request(app).get('/v1/users/me/ratings?mediaType=anime');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/mediaType/);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns 200 with enriched ratings list', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([mockMovieRating]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(1);
    mockFetchSequence(ok(mockMovieTmdb));

    const res = await request(app).get('/v1/users/me/ratings');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1,
      sort: 'date',
    });
    expect(res.body.results).toHaveLength(1);
  });

  it('result item has user score and DB fields', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([mockMovieRating]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(1);
    mockFetchSequence(ok(mockMovieTmdb));

    const res = await request(app).get('/v1/users/me/ratings');
    const item = res.body.results[0];

    expect(item).toMatchObject({
      id: 1,
      score: 8,
      tmdbId: 27205,
      mediaType: 'movie',
    });
  });

  it('movie tmdb block has metadata but no vote_average or community fields', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([mockMovieRating]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(1);
    mockFetchSequence(ok(mockMovieTmdb));

    const res = await request(app).get('/v1/users/me/ratings');
    const { tmdb } = res.body.results[0];

    expect(tmdb).toMatchObject({
      id: 27205,
      title: 'Inception',
      releaseYear: 2010,
      releaseDate: '2010-07-16',
    });
    expect(tmdb).not.toHaveProperty('vote_average');
    expect(tmdb).not.toHaveProperty('averageRating');
    expect(tmdb).not.toHaveProperty('recentReviews');
    expect(Array.isArray(tmdb.genres)).toBe(true);
  });

  it('tv tmdb block uses name and firstAirDate', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([mockTvRating]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(1);
    mockFetchSequence(ok(mockTvTmdb));

    const res = await request(app).get('/v1/users/me/ratings');
    const { tmdb } = res.body.results[0];

    expect(tmdb).toMatchObject({
      id: 1396,
      title: 'Breaking Bad',
      firstAirDate: '2008-01-20',
      releaseYear: 2008,
    });
    expect(tmdb).not.toHaveProperty('releaseDate');
  });

  it('returns empty results when user has no ratings', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(0);

    const res = await request(app).get('/v1/users/me/ratings');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalCount: 0, totalPages: 0, results: [] });
  });

  // ── TMDB unavailable items ──────────────────────────────────────────────────

  it('sets tmdb to null when TMDB returns non-200 for that item', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([mockMovieRating]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(1);
    mockFetchSequence(notFound());

    const res = await request(app).get('/v1/users/me/ratings');

    expect(res.status).toBe(200);
    expect(res.body.results[0].tmdb).toBeNull();
  });

  it('one failed TMDB call does not affect the rest', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([mockMovieRating, mockTvRating]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(2);
    mockFetchSequence(notFound(), ok(mockTvTmdb));

    const res = await request(app).get('/v1/users/me/ratings');

    expect(res.status).toBe(200);
    expect(res.body.results[0].tmdb).toBeNull();
    expect(res.body.results[1].tmdb).toMatchObject({ title: 'Breaking Bad' });
  });

  it('sets tmdb to null when fetch throws a network error', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([mockMovieRating]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(1);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    const res = await request(app).get('/v1/users/me/ratings');

    expect(res.status).toBe(200);
    expect(res.body.results[0].tmdb).toBeNull();
  });

  // ── Pagination ──────────────────────────────────────────────────────────────

  it('respects page and pageSize query params', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([mockMovieRating]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(25);
    mockFetchSequence(ok(mockMovieTmdb));

    const res = await request(app).get('/v1/users/me/ratings?page=2&pageSize=10');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, pageSize: 10, totalCount: 25, totalPages: 3 });
    expect(prisma.rating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });

  it('caps pageSize at 50', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(0);

    const res = await request(app).get('/v1/users/me/ratings?pageSize=999');

    expect(res.body.pageSize).toBe(50);
    expect(prisma.rating.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  // ── Sort ────────────────────────────────────────────────────────────────────

  it('defaults to sort=date (createdAt desc)', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(0);

    await request(app).get('/v1/users/me/ratings');

    expect(prisma.rating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    );
  });

  it('sort=score orders by score desc', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(0);

    const res = await request(app).get('/v1/users/me/ratings?sort=score');

    expect(res.body.sort).toBe('score');
    expect(prisma.rating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { score: 'desc' } })
    );
  });

  // ── mediaType filter ────────────────────────────────────────────────────────

  it('filters by mediaType when provided', async () => {
    (prisma.rating.findMany as jest.Mock).mockResolvedValue([mockMovieRating]);
    (prisma.rating.count as jest.Mock).mockResolvedValue(1);
    mockFetchSequence(ok(mockMovieTmdb));

    await request(app).get('/v1/users/me/ratings?mediaType=movie');

    expect(prisma.rating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ mediaType: 'movie' }) })
    );
  });
});
