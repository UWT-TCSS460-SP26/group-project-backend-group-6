/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../src/app';
import { prisma } from '../../../src/lib/prisma';

jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    rating: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const JWT_SECRET = 'test-secret';

const makeToken = (sub: number, role = 'user') =>
  `Bearer ${jwt.sign({ sub, email: `user${sub}@test.local`, role }, JWT_SECRET, { expiresIn: '1h' })}`;

const mockRating = {
  id: 1,
  score: 8,
  tmdbId: 27205,
  mediaType: 'movie',
  userId: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Ratings Router', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // POST /v1/ratings
  // ---------------------------------------------------------------------------
  describe('POST /v1/ratings', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .post('/v1/ratings')
        .send({ tmdbId: 27205, mediaType: 'movie', score: 8 });
      expect(res.status).toBe(401);
    });

    it('returns 400 when score exceeds 10', async () => {
      const res = await request(app)
        .post('/v1/ratings')
        .set('Authorization', makeToken(1))
        .send({ tmdbId: 27205, mediaType: 'movie', score: 11 });
      expect(res.status).toBe(400);
    });

    it('returns 400 when score is below 1', async () => {
      const res = await request(app)
        .post('/v1/ratings')
        .set('Authorization', makeToken(1))
        .send({ tmdbId: 27205, mediaType: 'movie', score: 0 });
      expect(res.status).toBe(400);
    });

    it('returns 400 when mediaType is invalid', async () => {
      const res = await request(app)
        .post('/v1/ratings')
        .set('Authorization', makeToken(1))
        .send({ tmdbId: 27205, mediaType: 'anime', score: 8 });
      expect(res.status).toBe(400);
    });

    it('returns 400 when tmdbId is missing', async () => {
      const res = await request(app)
        .post('/v1/ratings')
        .set('Authorization', makeToken(1))
        .send({ mediaType: 'movie', score: 8 });
      expect(res.status).toBe(400);
    });

    it('returns 200 and the upserted rating on success', async () => {
      (prisma.rating.upsert as jest.Mock).mockResolvedValue(mockRating);

      const res = await request(app)
        .post('/v1/ratings')
        .set('Authorization', makeToken(1))
        .send({ tmdbId: 27205, mediaType: 'movie', score: 8 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ tmdbId: 27205, mediaType: 'movie', score: 8 });
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/ratings/:tmdbId
  // ---------------------------------------------------------------------------
  describe('GET /v1/ratings/:tmdbId', () => {
    it('returns 400 when tmdbId is not a number', async () => {
      const res = await request(app).get('/v1/ratings/abc?mediaType=movie');
      expect(res.status).toBe(400);
    });

    it('returns 400 when mediaType query param is missing', async () => {
      const res = await request(app).get('/v1/ratings/27205');
      expect(res.status).toBe(400);
    });

    it('returns 400 when mediaType is invalid', async () => {
      const res = await request(app).get('/v1/ratings/27205?mediaType=anime');
      expect(res.status).toBe(400);
    });

    it('returns 200 with ratings and aggregate stats', async () => {
      (prisma.rating.findMany as jest.Mock).mockResolvedValue([mockRating]);
      (prisma.rating.count as jest.Mock).mockResolvedValue(1);
      (prisma.rating.aggregate as jest.Mock).mockResolvedValue({ _avg: { score: 8 } });

      const res = await request(app).get('/v1/ratings/27205?mediaType=movie');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        tmdbId: 27205,
        mediaType: 'movie',
        totalRatings: 1,
        averageScore: 8,
        page: 1,
        results: expect.any(Array),
      });
    });

    it('returns averageScore null when no ratings exist', async () => {
      (prisma.rating.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.rating.count as jest.Mock).mockResolvedValue(0);
      (prisma.rating.aggregate as jest.Mock).mockResolvedValue({ _avg: { score: null } });

      const res = await request(app).get('/v1/ratings/99999?mediaType=tv');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ totalRatings: 0, averageScore: null });
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /v1/ratings/:id
  // ---------------------------------------------------------------------------
  describe('PUT /v1/ratings/:id', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).put('/v1/ratings/1').send({ score: 9 });
      expect(res.status).toBe(401);
    });

    it('returns 400 when id is not a number', async () => {
      const res = await request(app)
        .put('/v1/ratings/abc')
        .set('Authorization', makeToken(1))
        .send({ score: 9 });
      expect(res.status).toBe(400);
    });

    it('returns 400 when score is out of range', async () => {
      const res = await request(app)
        .put('/v1/ratings/1')
        .set('Authorization', makeToken(1))
        .send({ score: 0 });
      expect(res.status).toBe(400);
    });

    it('returns 404 when rating does not exist', async () => {
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .put('/v1/ratings/999')
        .set('Authorization', makeToken(1))
        .send({ score: 9 });

      expect(res.status).toBe(404);
    });

    it('returns 403 when user does not own the rating', async () => {
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue({ ...mockRating, userId: 2 });

      const res = await request(app)
        .put('/v1/ratings/1')
        .set('Authorization', makeToken(1))
        .send({ score: 9 });

      expect(res.status).toBe(403);
    });

    it('returns 200 and the updated rating on success', async () => {
      const updated = { ...mockRating, score: 9 };
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue(mockRating);
      (prisma.rating.update as jest.Mock).mockResolvedValue(updated);

      const res = await request(app)
        .put('/v1/ratings/1')
        .set('Authorization', makeToken(1))
        .send({ score: 9 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ score: 9 });
    });

    it('allows an admin to update any rating', async () => {
      const updated = { ...mockRating, score: 5, userId: 2 };
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue({ ...mockRating, userId: 2 });
      (prisma.rating.update as jest.Mock).mockResolvedValue(updated);

      const res = await request(app)
        .put('/v1/ratings/1')
        .set('Authorization', makeToken(99, 'admin'))
        .send({ score: 5 });

      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /v1/ratings/:id
  // ---------------------------------------------------------------------------
  describe('DELETE /v1/ratings/:id', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).delete('/v1/ratings/1');
      expect(res.status).toBe(401);
    });

    it('returns 400 when id is not a number', async () => {
      const res = await request(app).delete('/v1/ratings/abc').set('Authorization', makeToken(1));
      expect(res.status).toBe(400);
    });

    it('returns 404 when rating does not exist', async () => {
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app).delete('/v1/ratings/999').set('Authorization', makeToken(1));

      expect(res.status).toBe(404);
    });

    it('returns 403 when user does not own the rating', async () => {
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue({ ...mockRating, userId: 2 });

      const res = await request(app).delete('/v1/ratings/1').set('Authorization', makeToken(1));

      expect(res.status).toBe(403);
    });

    it('returns 204 on successful delete', async () => {
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue(mockRating);
      (prisma.rating.delete as jest.Mock).mockResolvedValue(mockRating);

      const res = await request(app).delete('/v1/ratings/1').set('Authorization', makeToken(1));

      expect(res.status).toBe(204);
    });

    it('allows an admin to delete any rating', async () => {
      (prisma.rating.findUnique as jest.Mock).mockResolvedValue({ ...mockRating, userId: 2 });
      (prisma.rating.delete as jest.Mock).mockResolvedValue(mockRating);

      const res = await request(app)
        .delete('/v1/ratings/1')
        .set('Authorization', makeToken(99, 'admin'));

      expect(res.status).toBe(204);
    });
  });
});
