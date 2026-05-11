/// <reference types="jest" />
import request from 'supertest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/lib/prisma';

jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    rating: {
      groupBy: jest.fn(),
    },
  },
}));

jest.mock('../../../src/middleware/requireAuth', () => ({
  requireAuth: [(_req: any, _res: any, next: any) => next()],
  optionalAuth: [(_req: any, _res: any, next: any) => next()],
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireRoleAtLeast: () => (_req: any, _res: any, next: any) => next(),
  hasRoleAtLeast: () => true,
  ROLE_HIERARCHY: ['User', 'Moderator', 'Admin', 'SuperAdmin', 'Owner'],
}));

type FetchStub = { ok: boolean; status: number; json: () => Promise<unknown> };

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

const mockFetchSequence = (...stubs: FetchStub[]) => {
  let call = 0;
  jest
    .spyOn(global, 'fetch')
    .mockImplementation(() => Promise.resolve(stubs[call++] as unknown as Response));
};

const mockMovieTmdb = {
  id: 550,
  title: 'Fight Club',
  overview: 'An insomniac office worker forms an underground fight club.',
  release_date: '1999-10-15',
  poster_path: '/poster.jpg',
  genres: [{ id: 18, name: 'Drama' }],
};

const mockTvTmdb = {
  id: 1396,
  name: 'Breaking Bad',
  overview: 'A chemistry teacher turns to manufacturing methamphetamine.',
  first_air_date: '2008-01-20',
  poster_path: '/bbposter.jpg',
  genres: [{ id: 18, name: 'Drama' }],
};

// Rows returned by prisma.rating.groupBy
const makeRow = (tmdbId: number, mediaType: string, avg: number, count: number) => ({
  tmdbId,
  mediaType,
  _avg: { score: avg },
  _count: { score: count },
});

describe('Community Routes', () => {
  let originalTmdbKey: string | undefined;

  beforeEach(() => {
    originalTmdbKey = process.env.TMDB_API_KEY;
    process.env.TMDB_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.TMDB_API_KEY = originalTmdbKey;
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // ── Shared guard tests ──────────────────────────────────────────────────────

  describe.each(['/v1/community/top-rated', '/v1/community/most-reviewed'])('%s', (route) => {
    it('returns 503 when TMDB_API_KEY is not set', async () => {
      delete process.env.TMDB_API_KEY;
      const res = await request(app).get(route);
      expect(res.status).toBe(503);
    });

    it('returns 400 when mediaType is invalid', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      const res = await request(app).get(`${route}?mediaType=anime`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/mediaType/);
    });

    it('returns 200 with an empty results array when no ratings exist', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([]);
    });
  });

  // ── GET /v1/community/top-rated ─────────────────────────────────────────────

  describe('GET /v1/community/top-rated', () => {
    it('returns feed=top-rated and minVotes in response', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      const res = await request(app).get('/v1/community/top-rated');
      expect(res.body).toMatchObject({ feed: 'top-rated', minVotes: 3 });
    });

    it('applies HAVING count >= minVotes in the DB query', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      await request(app).get('/v1/community/top-rated?minVotes=5');
      expect(prisma.rating.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          having: { score: { _count: { gte: 5 } } },
        })
      );
    });

    it('orders by average score descending in the DB query', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      await request(app).get('/v1/community/top-rated');
      expect(prisma.rating.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ _avg: { score: 'desc' } }],
        })
      );
    });

    it('returns enriched results with rank, averageScore, ratingCount, and tmdb', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([makeRow(550, 'movie', 9.2, 42)]);
      mockFetchSequence(ok(mockMovieTmdb));

      const res = await request(app).get('/v1/community/top-rated');

      expect(res.status).toBe(200);
      expect(res.body.results[0]).toMatchObject({
        rank: 1,
        tmdbId: 550,
        mediaType: 'movie',
        averageScore: 9.2,
        ratingCount: 42,
      });
      expect(res.body.results[0].tmdb).toMatchObject({ title: 'Fight Club', releaseYear: 1999 });
    });

    it('rounds averageScore to one decimal place', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([makeRow(550, 'movie', 7.333333, 9)]);
      mockFetchSequence(ok(mockMovieTmdb));

      const res = await request(app).get('/v1/community/top-rated');
      expect(res.body.results[0].averageScore).toBe(7.3);
    });

    it('respects limit param and caps at 25', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      await request(app).get('/v1/community/top-rated?limit=999');
      expect(prisma.rating.groupBy).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
    });

    it('filters by mediaType when provided', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      await request(app).get('/v1/community/top-rated?mediaType=movie');
      expect(prisma.rating.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { mediaType: 'movie' } })
      );
    });

    it('sets tmdb to null when TMDB lookup fails for that item', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([makeRow(550, 'movie', 9.0, 5)]);
      mockFetchSequence(notFound());

      const res = await request(app).get('/v1/community/top-rated');
      expect(res.status).toBe(200);
      expect(res.body.results[0].tmdb).toBeNull();
    });

    it('one failed TMDB lookup does not affect other results', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([
        makeRow(550, 'movie', 9.0, 10),
        makeRow(1396, 'tv', 8.5, 7),
      ]);
      mockFetchSequence(notFound(), ok(mockTvTmdb));

      const res = await request(app).get('/v1/community/top-rated');
      expect(res.body.results[0].tmdb).toBeNull();
      expect(res.body.results[1].tmdb).toMatchObject({ title: 'Breaking Bad' });
    });

    it('assigns sequential rank values starting at 1', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([
        makeRow(550, 'movie', 9.2, 10),
        makeRow(1396, 'tv', 8.5, 7),
      ]);
      mockFetchSequence(ok(mockMovieTmdb), ok(mockTvTmdb));

      const res = await request(app).get('/v1/community/top-rated');
      expect(res.body.results[0].rank).toBe(1);
      expect(res.body.results[1].rank).toBe(2);
    });
  });

  // ── GET /v1/community/most-reviewed ────────────────────────────────────────

  describe('GET /v1/community/most-reviewed', () => {
    it('returns feed=most-reviewed in response', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      const res = await request(app).get('/v1/community/most-reviewed');
      expect(res.body).toMatchObject({ feed: 'most-reviewed' });
      expect(res.body).not.toHaveProperty('minVotes');
    });

    it('orders by rating count descending in the DB query', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      await request(app).get('/v1/community/most-reviewed');
      expect(prisma.rating.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ _count: { score: 'desc' } }],
        })
      );
    });

    it('does not apply a HAVING filter', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      await request(app).get('/v1/community/most-reviewed');
      expect(prisma.rating.groupBy).toHaveBeenCalledWith(
        expect.not.objectContaining({ having: expect.anything() })
      );
    });

    it('returns enriched results with rank, averageScore, ratingCount, and tmdb', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([makeRow(550, 'movie', 7.5, 150)]);
      mockFetchSequence(ok(mockMovieTmdb));

      const res = await request(app).get('/v1/community/most-reviewed');

      expect(res.status).toBe(200);
      expect(res.body.results[0]).toMatchObject({
        rank: 1,
        tmdbId: 550,
        mediaType: 'movie',
        averageScore: 7.5,
        ratingCount: 150,
      });
    });

    it('respects limit param and caps at 25', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      await request(app).get('/v1/community/most-reviewed?limit=999');
      expect(prisma.rating.groupBy).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
    });

    it('filters by mediaType=tv when provided', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([]);
      await request(app).get('/v1/community/most-reviewed?mediaType=tv');
      expect(prisma.rating.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { mediaType: 'tv' } })
      );
    });

    it('sets tmdb to null when fetch throws a network error', async () => {
      (prisma.rating.groupBy as jest.Mock).mockResolvedValue([makeRow(550, 'movie', 7.0, 20)]);
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const res = await request(app).get('/v1/community/most-reviewed');
      expect(res.status).toBe(200);
      expect(res.body.results[0].tmdb).toBeNull();
    });
  });
});
