/// <reference types="jest" />
import request from 'supertest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/lib/prisma';

jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    rating: {
      aggregate: jest.fn(),
      findUnique: jest.fn(),
    },
    review: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

// null  → unauthenticated request (optionalAuth passes through without req.user)
// object → authenticated request (req.user is set)
let mockAuthUser: { sub: string; role: string; email: string } | null = null;

jest.mock('../../../src/middleware/requireAuth', () => ({
  optionalAuth: [
    (req: any, _res: any, next: any) => {
      if (mockAuthUser) req.user = mockAuthUser;
      next();
    },
  ],
  requireAuth: [
    (req: any, _res: any, next: any) => {
      if (mockAuthUser) req.user = mockAuthUser;
      next();
    },
  ],
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireRoleAtLeast: () => (_req: any, _res: any, next: any) => next(),
  hasRoleAtLeast: () => true,
  ROLE_HIERARCHY: ['User', 'Moderator', 'Admin', 'SuperAdmin', 'Owner'],
}));

// ── TMDB mock payloads ────────────────────────────────────────────────────────

const mockMovieDetail = {
  id: 27205,
  title: 'Inception',
  tagline: 'Your mind is the scene of the crime.',
  overview: 'A thief who steals corporate secrets through dream-sharing.',
  release_date: '2010-07-16',
  runtime: 148,
  vote_count: 24000,
  vote_average: 8.4,
  backdrop_path: '/backdrop.jpg',
  poster_path: '/poster.jpg',
  status: 'Released',
  genres: [
    { id: 28, name: 'Action' },
    { id: 878, name: 'Science Fiction' },
  ],
  credits: {
    cast: [{ name: 'Leonardo DiCaprio', character: 'Cobb', profile_path: '/leo.jpg' }],
  },
  similar: { results: [] },
};

const mockTVDetail = {
  id: 1396,
  name: 'Breaking Bad',
  overview: 'A chemistry teacher turns to manufacturing methamphetamine.',
  first_air_date: '2008-01-20',
  last_air_date: '2013-09-29',
  status: 'Ended',
  number_of_seasons: 5,
  number_of_episodes: 62,
  episode_run_time: [45],
  vote_count: 13500,
  vote_average: 9.5,
  backdrop_path: '/backdrop.jpg',
  poster_path: '/poster.jpg',
  genres: [
    { id: 18, name: 'Drama' },
    { id: 80, name: 'Crime' },
  ],
  networks: [{ name: 'AMC', logo_path: '/amc.png' }],
  seasons: [{ season_number: 1, episode_count: 7, air_date: '2008-01-20', poster_path: '/s1.jpg' }],
  credits: {
    cast: [{ name: 'Bryan Cranston', character: 'Walter White', profile_path: '/bryan.jpg' }],
  },
};

// ── Community mock helpers ────────────────────────────────────────────────────

const setupEmptyCommunity = () => {
  (prisma.rating.aggregate as jest.Mock).mockResolvedValue({ _avg: { score: null } });
  (prisma.review.count as jest.Mock).mockResolvedValue(0);
  (prisma.review.findMany as jest.Mock).mockResolvedValue([]);
};

const setupCommunityWithData = () => {
  (prisma.rating.aggregate as jest.Mock).mockResolvedValue({ _avg: { score: 8.5 } });
  (prisma.review.count as jest.Mock).mockResolvedValue(3);
  (prisma.review.findMany as jest.Mock).mockResolvedValue([
    {
      id: 1,
      title: 'Great film',
      body: 'Loved every minute.',
      createdAt: new Date('2026-04-20'),
      user: { username: 'johndoe', displayName: 'John Doe' },
    },
  ]);
};

// ── Fetch mock helper ─────────────────────────────────────────────────────────

type FetchStub = { ok: boolean; status: number; json: () => Promise<unknown> };

const mockFetchSequence = (...stubs: FetchStub[]) => {
  let call = 0;
  jest
    .spyOn(global, 'fetch')
    .mockImplementation(() => Promise.resolve(stubs[call++] as unknown as Response));
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Enriched Routes', () => {
  let originalTmdbKey: string | undefined;

  beforeEach(() => {
    originalTmdbKey = process.env.TMDB_API_KEY;
    mockAuthUser = null;
  });

  afterEach(() => {
    process.env.TMDB_API_KEY = originalTmdbKey;
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // ── GET /v1/media/movies/:id/enriched ─────────────────────────────────────

  describe('GET /v1/media/movies/:id/enriched', () => {
    it('returns 400 for a non-numeric id', async () => {
      const res = await request(app).get('/v1/media/movies/abc/enriched');
      expect(res.status).toBe(400);
    });

    it('returns 400 for id zero', async () => {
      const res = await request(app).get('/v1/media/movies/0/enriched');
      expect(res.status).toBe(400);
    });

    it('returns 503 when TMDB_API_KEY is not set', async () => {
      delete process.env.TMDB_API_KEY;
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      expect(res.status).toBe(503);
    });

    it('returns 502 when fetch throws a network error', async () => {
      setupEmptyCommunity();
      global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as jest.Mock;
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      expect(res.status).toBe(502);
    });

    it('propagates a TMDB 404 when the movie is not found', async () => {
      setupEmptyCommunity();
      mockFetchSequence({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ status_message: 'Not Found' }),
      });
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      expect(res.status).toBe(404);
    });

    it('returns 200 with tmdb and community blocks', async () => {
      setupEmptyCommunity();
      mockFetchSequence({ ok: true, status: 200, json: () => Promise.resolve(mockMovieDetail) });
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tmdb');
      expect(res.body).toHaveProperty('community');
    });

    it('tmdb block has movie metadata and no TMDB rating or voteCount', async () => {
      setupEmptyCommunity();
      mockFetchSequence({ ok: true, status: 200, json: () => Promise.resolve(mockMovieDetail) });
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      const { tmdb } = res.body;
      expect(tmdb).toMatchObject({
        id: 27205,
        title: 'Inception',
        releaseYear: 2010,
        runtimeMinutes: 148,
        status: 'Released',
      });
      expect(Array.isArray(tmdb.genres)).toBe(true);
      expect(Array.isArray(tmdb.cast)).toBe(true);
      expect(tmdb).not.toHaveProperty('rating');
      expect(tmdb).not.toHaveProperty('voteCount');
    });

    it('community block is zero-state when no ratings or reviews exist', async () => {
      setupEmptyCommunity();
      mockFetchSequence({ ok: true, status: 200, json: () => Promise.resolve(mockMovieDetail) });
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      expect(res.body.community).toMatchObject({
        averageRating: null,
        reviewCount: 0,
        recentReviews: [],
      });
    });

    it('community block includes averageRating and recentReviews when data exists', async () => {
      setupCommunityWithData();
      mockFetchSequence({ ok: true, status: 200, json: () => Promise.resolve(mockMovieDetail) });
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      const { community } = res.body;
      expect(community.averageRating).toBe(8.5);
      expect(community.reviewCount).toBe(3);
      expect(community.recentReviews).toHaveLength(1);
      expect(community.recentReviews[0]).toMatchObject({
        id: 1,
        title: 'Great film',
        body: 'Loved every minute.',
        author: 'John Doe',
      });
    });

    it('author falls back to username when displayName is null', async () => {
      (prisma.rating.aggregate as jest.Mock).mockResolvedValue({ _avg: { score: null } });
      (prisma.review.count as jest.Mock).mockResolvedValue(1);
      (prisma.review.findMany as jest.Mock).mockResolvedValue([
        {
          id: 2,
          title: null,
          body: 'Solid.',
          createdAt: new Date(),
          user: { username: 'janedoe', displayName: null },
        },
      ]);
      mockFetchSequence({ ok: true, status: 200, json: () => Promise.resolve(mockMovieDetail) });
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      expect(res.body.community.recentReviews[0].author).toBe('janedoe');
    });

    it('unauthenticated response has no myRating field', async () => {
      setupEmptyCommunity();
      mockFetchSequence({ ok: true, status: 200, json: () => Promise.resolve(mockMovieDetail) });
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      expect(res.body.community).not.toHaveProperty('myRating');
    });

    it('authenticated response includes myRating with the user score', async () => {
      mockAuthUser = { sub: 'user-sub-1', role: 'User', email: 'user@test.local' };
      setupEmptyCommunity();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue({ score: 8 });
      mockFetchSequence({ ok: true, status: 200, json: () => Promise.resolve(mockMovieDetail) });
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      expect(res.body.community).toHaveProperty('myRating', 8);
    });

    it('authenticated response has myRating null when user has not rated', async () => {
      mockAuthUser = { sub: 'user-sub-1', role: 'User', email: 'user@test.local' };
      setupEmptyCommunity();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue(null);
      mockFetchSequence({ ok: true, status: 200, json: () => Promise.resolve(mockMovieDetail) });
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      expect(res.body.community).toHaveProperty('myRating', null);
    });

    it('authenticated response has myRating null when user has no local account yet', async () => {
      mockAuthUser = { sub: 'brand-new-sub', role: 'User', email: 'new@test.local' };
      setupEmptyCommunity();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      mockFetchSequence({ ok: true, status: 200, json: () => Promise.resolve(mockMovieDetail) });
      const res = await request(app).get('/v1/media/movies/27205/enriched');
      expect(res.body.community).toHaveProperty('myRating', null);
    });
  });

  // ── GET /v1/media/tv/:id/enriched ─────────────────────────────────────────

  describe('GET /v1/media/tv/:id/enriched', () => {
    it('returns 400 for a non-numeric id', async () => {
      const res = await request(app).get('/v1/media/tv/abc/enriched');
      expect(res.status).toBe(400);
    });

    it('returns 400 for id zero', async () => {
      const res = await request(app).get('/v1/media/tv/0/enriched');
      expect(res.status).toBe(400);
    });

    it('returns 503 when TMDB_API_KEY is not set', async () => {
      delete process.env.TMDB_API_KEY;
      const res = await request(app).get('/v1/media/tv/1396/enriched');
      expect(res.status).toBe(503);
    });

    it('returns 502 when fetch throws a network error', async () => {
      setupEmptyCommunity();
      global.fetch = jest.fn(() => Promise.reject(new Error('Network error'))) as jest.Mock;
      const res = await request(app).get('/v1/media/tv/1396/enriched');
      expect(res.status).toBe(502);
    });

    it('propagates a TMDB 404 when the show is not found', async () => {
      setupEmptyCommunity();
      mockFetchSequence(
        { ok: false, status: 404, json: () => Promise.resolve({ status_message: 'Not Found' }) },
        { ok: true, status: 200, json: () => Promise.resolve({ results: [] }) }
      );
      const res = await request(app).get('/v1/media/tv/1396/enriched');
      expect(res.status).toBe(404);
    });

    it('returns 200 with tmdb and community blocks', async () => {
      setupEmptyCommunity();
      mockFetchSequence(
        { ok: true, status: 200, json: () => Promise.resolve(mockTVDetail) },
        { ok: true, status: 200, json: () => Promise.resolve({ results: [] }) }
      );
      const res = await request(app).get('/v1/media/tv/1396/enriched');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tmdb');
      expect(res.body).toHaveProperty('community');
    });

    it('tmdb block has TV show metadata and no TMDB rating or voteCount', async () => {
      setupEmptyCommunity();
      mockFetchSequence(
        { ok: true, status: 200, json: () => Promise.resolve(mockTVDetail) },
        { ok: true, status: 200, json: () => Promise.resolve({ results: [] }) }
      );
      const res = await request(app).get('/v1/media/tv/1396/enriched');
      const { tmdb } = res.body;
      expect(tmdb).toMatchObject({
        id: 1396,
        title: 'Breaking Bad',
        totalSeasons: 5,
        totalEpisodes: 62,
        status: 'Ended',
      });
      expect(Array.isArray(tmdb.seasons)).toBe(true);
      expect(Array.isArray(tmdb.networks)).toBe(true);
      expect(Array.isArray(tmdb.cast)).toBe(true);
      expect(tmdb).not.toHaveProperty('rating');
      expect(tmdb).not.toHaveProperty('voteCount');
    });

    it('community block is zero-state when no ratings or reviews exist', async () => {
      setupEmptyCommunity();
      mockFetchSequence(
        { ok: true, status: 200, json: () => Promise.resolve(mockTVDetail) },
        { ok: true, status: 200, json: () => Promise.resolve({ results: [] }) }
      );
      const res = await request(app).get('/v1/media/tv/1396/enriched');
      expect(res.body.community).toMatchObject({
        averageRating: null,
        reviewCount: 0,
        recentReviews: [],
      });
    });

    it('unauthenticated response has no myRating field', async () => {
      setupEmptyCommunity();
      mockFetchSequence(
        { ok: true, status: 200, json: () => Promise.resolve(mockTVDetail) },
        { ok: true, status: 200, json: () => Promise.resolve({ results: [] }) }
      );
      const res = await request(app).get('/v1/media/tv/1396/enriched');
      expect(res.body.community).not.toHaveProperty('myRating');
    });

    it('authenticated response includes myRating with the user score', async () => {
      mockAuthUser = { sub: 'user-sub-1', role: 'User', email: 'user@test.local' };
      setupEmptyCommunity();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue({ score: 9 });
      mockFetchSequence(
        { ok: true, status: 200, json: () => Promise.resolve(mockTVDetail) },
        { ok: true, status: 200, json: () => Promise.resolve({ results: [] }) }
      );
      const res = await request(app).get('/v1/media/tv/1396/enriched');
      expect(res.body.community).toHaveProperty('myRating', 9);
    });

    it('authenticated response has myRating null when user has not rated', async () => {
      mockAuthUser = { sub: 'user-sub-1', role: 'User', email: 'user@test.local' };
      setupEmptyCommunity();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue(null);
      mockFetchSequence(
        { ok: true, status: 200, json: () => Promise.resolve(mockTVDetail) },
        { ok: true, status: 200, json: () => Promise.resolve({ results: [] }) }
      );
      const res = await request(app).get('/v1/media/tv/1396/enriched');
      expect(res.body.community).toHaveProperty('myRating', null);
    });

    it('gracefully handles a failed similar fetch and still returns 200', async () => {
      setupEmptyCommunity();
      mockFetchSequence(
        { ok: true, status: 200, json: () => Promise.resolve(mockTVDetail) },
        { ok: false, status: 503, json: () => Promise.resolve({}) }
      );
      const res = await request(app).get('/v1/media/tv/1396/enriched');
      expect(res.status).toBe(200);
      expect(res.body.tmdb.similar).toEqual([]);
    });
  });
});
