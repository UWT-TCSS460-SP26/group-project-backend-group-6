import express from 'express';
import request from 'supertest';
import { attachUser, handleAuthError, requireAuth } from '../../../src/middleware/requireAuth';

describe('attachUser', () => {
  it('copies req.auth to req.user when auth payload exists', async () => {
    const app = express();
    app.use((req: any, _res, next) => {
      req.auth = { sub: 'user-123', role: 'Admin' };
      next();
    });
    app.use(attachUser as any);
    app.get('/test', (req: any, res: any) => res.json(req.user ?? null));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sub: 'user-123', role: 'Admin' });
  });

  it('leaves req.user undefined when req.auth is absent', async () => {
    const app = express();
    app.use(attachUser as any);
    app.get('/test', (req: any, res: any) => res.json({ hasUser: req.user !== undefined }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasUser: false });
  });
});

describe('handleAuthError', () => {
  it('returns 401 JSON for UnauthorizedError', async () => {
    const app = express();
    app.use((_req, _res, next) => {
      const err: any = new Error('jwt expired');
      err.name = 'UnauthorizedError';
      next(err);
    });
    app.use(handleAuthError as any);

    const res = await request(app).get('/');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or missing token' });
  });

  it('passes non-auth errors to the next error handler', async () => {
    const app = express();
    app.use((_req, _res, next) => {
      next(new Error('database error'));
    });
    app.use(handleAuthError as any);
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(500).json({ error: err.message });
    });

    const res = await request(app).get('/');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'database error' });
  });
});

describe('requireAuth', () => {
  it('exports an array of three middleware handlers', () => {
    expect(Array.isArray(requireAuth)).toBe(true);
    expect(requireAuth).toHaveLength(3);
    requireAuth.forEach((handler) => expect(typeof handler).toBe('function'));
  });
});
