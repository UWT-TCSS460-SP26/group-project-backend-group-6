/// <reference types="jest" />
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../src/app';
import { prisma } from '../../../src/lib/prisma';

jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    review: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const JWT_SECRET = 'test-secret';

const makeToken = (sub: number, role = 'user') =>
  `Bearer ${jwt.sign({ sub, email: `user${sub}@test.local`, role }, JWT_SECRET, { expiresIn: '1h' })}`;

const mockReview = {
  id: 1,
  title: 'Great film',
  body: 'Loved every moment of it.',
  tmdbId: 27205,
  mediaType: 'movie',
  userId: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Reviews Router', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // POST /v1/reviews
  // ---------------------------------------------------------------------------
  describe('POST /v1/reviews', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app)
        .post('/v1/reviews')
        .send({ tmdbId: 27205, mediaType: 'movie', body: 'Great!' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when body field is missing', async () => {
      const res = await request(app)
        .post('/v1/reviews')
        .set('Authorization', makeToken(1))
        .send({ tmdbId: 27205, mediaType: 'movie' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when mediaType is invalid', async () => {
      const res = await request(app)
        .post('/v1/reviews')
        .set('Authorization', makeToken(1))
        .send({ tmdbId: 27205, mediaType: 'anime', body: 'Great!' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when tmdbId is missing', async () => {
      const res = await request(app)
        .post('/v1/reviews')
        .set('Authorization', makeToken(1))
        .send({ mediaType: 'movie', body: 'Great!' });
      expect(res.status).toBe(400);
    });

    it('returns 201 and the created review on success', async () => {
      (prisma.review.create as jest.Mock).mockResolvedValue(mockReview);

      const res = await request(app).post('/v1/reviews').set('Authorization', makeToken(1)).send({
        tmdbId: 27205,
        mediaType: 'movie',
        title: 'Great film',
        body: 'Loved every moment of it.',
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        tmdbId: 27205,
        mediaType: 'movie',
        body: 'Loved every moment of it.',
      });
    });

    it('creates a review without an optional title', async () => {
      (prisma.review.create as jest.Mock).mockResolvedValue({ ...mockReview, title: null });

      const res = await request(app)
        .post('/v1/reviews')
        .set('Authorization', makeToken(1))
        .send({ tmdbId: 27205, mediaType: 'movie', body: 'Loved every moment of it.' });

      expect(res.status).toBe(201);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/reviews/:tmdbId
  // ---------------------------------------------------------------------------
  describe('GET /v1/reviews/:tmdbId', () => {
    it('returns 400 when tmdbId is not a number', async () => {
      const res = await request(app).get('/v1/reviews/abc?mediaType=movie');
      expect(res.status).toBe(400);
    });

    it('returns 400 when mediaType query param is missing', async () => {
      const res = await request(app).get('/v1/reviews/27205');
      expect(res.status).toBe(400);
    });

    it('returns 400 when mediaType is invalid', async () => {
      const res = await request(app).get('/v1/reviews/27205?mediaType=anime');
      expect(res.status).toBe(400);
    });

    it('returns 200 with paginated reviews', async () => {
      (prisma.review.findMany as jest.Mock).mockResolvedValue([mockReview]);
      (prisma.review.count as jest.Mock).mockResolvedValue(1);

      const res = await request(app).get('/v1/reviews/27205?mediaType=movie');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        tmdbId: 27205,
        mediaType: 'movie',
        totalReviews: 1,
        page: 1,
        results: expect.any(Array),
      });
    });

    it('returns empty results when no reviews exist', async () => {
      (prisma.review.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.review.count as jest.Mock).mockResolvedValue(0);

      const res = await request(app).get('/v1/reviews/99999?mediaType=tv');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ totalReviews: 0, results: [] });
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /v1/reviews/:id
  // ---------------------------------------------------------------------------
  describe('PUT /v1/reviews/:id', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).put('/v1/reviews/1').send({ body: 'Updated.' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when id is not a number', async () => {
      const res = await request(app)
        .put('/v1/reviews/abc')
        .set('Authorization', makeToken(1))
        .send({ body: 'Updated.' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when body is an empty object', async () => {
      const res = await request(app)
        .put('/v1/reviews/1')
        .set('Authorization', makeToken(1))
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 when review does not exist', async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .put('/v1/reviews/999')
        .set('Authorization', makeToken(1))
        .send({ body: 'Updated.' });

      expect(res.status).toBe(404);
    });

    it('returns 403 when user does not own the review', async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue({ ...mockReview, userId: 2 });

      const res = await request(app)
        .put('/v1/reviews/1')
        .set('Authorization', makeToken(1))
        .send({ body: 'Updated.' });

      expect(res.status).toBe(403);
    });

    it('returns 200 and the updated review on success', async () => {
      const updated = { ...mockReview, body: 'Updated.' };
      (prisma.review.findUnique as jest.Mock).mockResolvedValue(mockReview);
      (prisma.review.update as jest.Mock).mockResolvedValue(updated);

      const res = await request(app)
        .put('/v1/reviews/1')
        .set('Authorization', makeToken(1))
        .send({ body: 'Updated.' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ body: 'Updated.' });
    });

    it('allows an admin to update any review', async () => {
      const updated = { ...mockReview, body: 'Admin edit.', userId: 2 };
      (prisma.review.findUnique as jest.Mock).mockResolvedValue({ ...mockReview, userId: 2 });
      (prisma.review.update as jest.Mock).mockResolvedValue(updated);

      const res = await request(app)
        .put('/v1/reviews/1')
        .set('Authorization', makeToken(99, 'admin'))
        .send({ body: 'Admin edit.' });

      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /v1/reviews/:id
  // ---------------------------------------------------------------------------
  describe('DELETE /v1/reviews/:id', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).delete('/v1/reviews/1');
      expect(res.status).toBe(401);
    });

    it('returns 400 when id is not a number', async () => {
      const res = await request(app).delete('/v1/reviews/abc').set('Authorization', makeToken(1));
      expect(res.status).toBe(400);
    });

    it('returns 404 when review does not exist', async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app).delete('/v1/reviews/999').set('Authorization', makeToken(1));

      expect(res.status).toBe(404);
    });

    it('returns 403 when user does not own the review', async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue({ ...mockReview, userId: 2 });

      const res = await request(app).delete('/v1/reviews/1').set('Authorization', makeToken(1));

      expect(res.status).toBe(403);
    });

    it('returns 204 on successful delete', async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue(mockReview);
      (prisma.review.delete as jest.Mock).mockResolvedValue(mockReview);

      const res = await request(app).delete('/v1/reviews/1').set('Authorization', makeToken(1));

      expect(res.status).toBe(204);
    });

    it('allows an admin to delete any review', async () => {
      (prisma.review.findUnique as jest.Mock).mockResolvedValue({ ...mockReview, userId: 2 });
      (prisma.review.delete as jest.Mock).mockResolvedValue(mockReview);

      const res = await request(app)
        .delete('/v1/reviews/1')
        .set('Authorization', makeToken(99, 'admin'));

      expect(res.status).toBe(204);
    });
  });
});
