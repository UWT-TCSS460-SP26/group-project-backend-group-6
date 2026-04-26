// Strategy:
//   • Mock the Prisma client so tests never touch a real database.
//   • Mint JWTs directly with JWT_SECRET — no calls to /auth/dev-login per request.
//   • One describe block per endpoint.
 
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app'; 
import { prisma } from '../../src/lib/prisma';
 
// ── Mock Prisma ───────────────────────────────────────────────────────────────
 
jest.mock('../../src/lib/prisma', () => ({
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
    user: {
      findUnique: jest.fn(),
    },
  },
}));
 
const mockedPrisma = jest.mocked(prisma);
 
// ── Token helpers ─────────────────────────────────────────────────────────────
 
const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
 
const mintToken = (overrides: Partial<{ sub: number; role: string; username: string }> = {}) =>
  jwt.sign(
    { sub: overrides.sub ?? 1, role: overrides.role ?? 'user', username: overrides.username ?? 'alice' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
 
const userToken  = mintToken({ sub: 1, role: 'user',  username: 'alice' });
const adminToken = mintToken({ sub: 99, role: 'admin', username: 'admin' });
const otherToken = mintToken({ sub: 2,  role: 'user',  username: 'bob'   });
 
// Shared fixture
const sampleRating = {
  id: 7,
  score: 4.5,
  tmdbId: 550,
  mediaType: 'movie' as const,
  userId: 1,
  createdAt: new Date('2026-04-20T10:00:00Z'),
  updatedAt: new Date('2026-04-20T10:00:00Z'),
};
 
// ── GET /ratings/:tmdbId ──────────────────────────────────────────────────────
 
describe('GET /ratings/:tmdbId', () => {
  beforeEach(() => jest.clearAllMocks());
 
  it('returns a paginated ratings list with aggregate for a valid tmdbId + mediaType', async () => {
    (mockedPrisma.rating.findMany as jest.Mock).mockResolvedValue([
      {
        id: 7,
        score: 4.5,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 1, username: 'alice', displayName: 'Alice' },
      },
    ]);
    (mockedPrisma.rating.count as jest.Mock).mockResolvedValue(1);
    (mockedPrisma.rating.aggregate as jest.Mock).mockResolvedValue({
      _avg: { score: 4.5 },
      _count: { score: 1 },
    });
 
    const res = await request(app).get('/ratings/550?mediaType=movie');
 
    expect(res.status).toBe(200);
    expect(res.body.tmdbId).toBe(550);
    expect(res.body.mediaType).toBe('movie');
    expect(res.body.averageScore).toBe(4.5);
    expect(res.body.totalRatings).toBe(1);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].user.username).toBe('alice');
  });
 
  it('returns averageScore: null when there are no ratings', async () => {
    (mockedPrisma.rating.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.rating.count as jest.Mock).mockResolvedValue(0);
    (mockedPrisma.rating.aggregate as jest.Mock).mockResolvedValue({
      _avg: { score: null },
      _count: { score: 0 },
    });
 
    const res = await request(app).get('/ratings/999?mediaType=tv');
 
    expect(res.status).toBe(200);
    expect(res.body.averageScore).toBeNull();
    expect(res.body.results).toHaveLength(0);
  });
 
  it('returns 400 when mediaType query param is missing', async () => {
    const res = await request(app).get('/ratings/550');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
  });
 
  it('returns 400 when mediaType is invalid', async () => {
    const res = await request(app).get('/ratings/550?mediaType=anime');
    expect(res.status).toBe(400);
  });
 
  it('returns 400 when tmdbId is not a number', async () => {
    const res = await request(app).get('/ratings/abc?mediaType=movie');
    expect(res.status).toBe(400);
  });
 
  it('paginates correctly using page and limit params', async () => {
    (mockedPrisma.rating.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.rating.count as jest.Mock).mockResolvedValue(50);
    (mockedPrisma.rating.aggregate as jest.Mock).mockResolvedValue({
      _avg: { score: 3.0 },
      _count: { score: 50 },
    });
 
    const res = await request(app).get('/ratings/550?mediaType=movie&page=3&limit=10');
 
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(3);
    expect(res.body.totalPages).toBe(5);
  });
});
 
// ── POST /ratings ─────────────────────────────────────────────────────────────
 
describe('POST /ratings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: user exists
    (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
  });
 
  it('creates a rating and returns 200', async () => {
    (mockedPrisma.rating.upsert as jest.Mock).mockResolvedValue(sampleRating);
 
    const res = await request(app)
      .post('/ratings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ tmdbId: 550, mediaType: 'movie', score: 4.5 });
 
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(4.5);
    expect(res.body.tmdbId).toBe(550);
  });
 
  it('upserts (updates) an existing rating for the same content', async () => {
    (mockedPrisma.rating.upsert as jest.Mock).mockResolvedValue({ ...sampleRating, score: 3.0 });
 
    const res = await request(app)
      .post('/ratings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ tmdbId: 550, mediaType: 'movie', score: 3.0 });
 
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(3.0);
  });
 
  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .post('/ratings')
      .send({ tmdbId: 550, mediaType: 'movie', score: 4.5 });
 
    expect(res.status).toBe(401);
  });
 
  it('returns 400 when tmdbId is missing', async () => {
    const res = await request(app)
      .post('/ratings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ mediaType: 'movie', score: 4.5 });
 
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
  });
 
  it('returns 400 when mediaType is invalid', async () => {
    const res = await request(app)
      .post('/ratings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ tmdbId: 550, mediaType: 'book', score: 4.5 });
 
    expect(res.status).toBe(400);
  });
 
  it('returns 400 when score is out of range (> 5.0)', async () => {
    const res = await request(app)
      .post('/ratings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ tmdbId: 550, mediaType: 'movie', score: 6.0 });
 
    expect(res.status).toBe(400);
  });
 
  it('returns 400 when score is out of range (< 0.5)', async () => {
    const res = await request(app)
      .post('/ratings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ tmdbId: 550, mediaType: 'movie', score: 0 });
 
    expect(res.status).toBe(400);
  });
 
  it('returns 400 when score is not a half-star increment', async () => {
    const res = await request(app)
      .post('/ratings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ tmdbId: 550, mediaType: 'movie', score: 3.3 });
 
    expect(res.status).toBe(400);
  });
});
 
// ── PUT /ratings/:id ──────────────────────────────────────────────────────────
 
describe('PUT /ratings/:id', () => {
  beforeEach(() => jest.clearAllMocks());
 
  it('updates a rating score the user owns', async () => {
    (mockedPrisma.rating.findUnique as jest.Mock).mockResolvedValue(sampleRating); // userId: 1
    (mockedPrisma.rating.update as jest.Mock).mockResolvedValue({ ...sampleRating, score: 3.0 });
 
    const res = await request(app)
      .put('/ratings/7')
      .set('Authorization', `Bearer ${userToken}`) // sub: 1 — matches sampleRating.userId
      .send({ score: 3.0 });
 
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(3.0);
  });
 
  it('returns 403 when a user tries to update someone else\'s rating', async () => {
    (mockedPrisma.rating.findUnique as jest.Mock).mockResolvedValue(sampleRating); // userId: 1
    // otherToken has sub: 2
 
    const res = await request(app)
      .put('/ratings/7')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ score: 3.0 });
 
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });
 
  it('returns 404 when rating does not exist', async () => {
    (mockedPrisma.rating.findUnique as jest.Mock).mockResolvedValue(null);
 
    const res = await request(app)
      .put('/ratings/9999')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ score: 3.0 });
 
    expect(res.status).toBe(404);
  });
 
  it('returns 400 when score is invalid', async () => {
    const res = await request(app)
      .put('/ratings/7')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ score: 99 });
 
    expect(res.status).toBe(400);
  });
 
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).put('/ratings/7').send({ score: 3.0 });
    expect(res.status).toBe(401);
  });
});
 
// ── DELETE /ratings/:id ───────────────────────────────────────────────────────
 
describe('DELETE /ratings/:id', () => {
  beforeEach(() => jest.clearAllMocks());
 
  it('deletes a rating the user owns', async () => {
    (mockedPrisma.rating.findUnique as jest.Mock).mockResolvedValue(sampleRating); // userId: 1
    (mockedPrisma.rating.delete as jest.Mock).mockResolvedValue(sampleRating);
 
    const res = await request(app)
      .delete('/ratings/7')
      .set('Authorization', `Bearer ${userToken}`); // sub: 1 — matches
 
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
 
  it('allows an admin to delete any rating', async () => {
    (mockedPrisma.rating.findUnique as jest.Mock).mockResolvedValue(sampleRating); // userId: 1
    (mockedPrisma.rating.delete as jest.Mock).mockResolvedValue(sampleRating);
 
    const res = await request(app)
      .delete('/ratings/7')
      .set('Authorization', `Bearer ${adminToken}`); // role: admin
 
    expect(res.status).toBe(200);
  });
 
  it('returns 403 when a regular user tries to delete someone else\'s rating', async () => {
    (mockedPrisma.rating.findUnique as jest.Mock).mockResolvedValue(sampleRating); // userId: 1
    // otherToken has sub: 2, role: user
 
    const res = await request(app)
      .delete('/ratings/7')
      .set('Authorization', `Bearer ${otherToken}`);
 
    expect(res.status).toBe(403);
  });
 
  it('returns 404 when rating does not exist', async () => {
    (mockedPrisma.rating.findUnique as jest.Mock).mockResolvedValue(null);
 
    const res = await request(app)
      .delete('/ratings/9999')
      .set('Authorization', `Bearer ${userToken}`);
 
    expect(res.status).toBe(404);
  });
 
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).delete('/ratings/7');
    expect(res.status).toBe(401);
  });
});