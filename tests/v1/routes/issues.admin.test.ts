/// <reference types="jest" />
import request from 'supertest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/lib/prisma';

jest.mock('../../../src/middleware/requireAuth', () => {
  const HIERARCHY = ['User', 'Moderator', 'Admin', 'SuperAdmin', 'Owner'];

  return {
    requireAuth: [
      (req: any, res: any, next: any) => {
        const header = req.headers['x-test-user'];
        if (!header) {
          res.status(401).json({ error: 'Invalid or missing token' });
          return;
        }
        req.user = JSON.parse(header);
        next();
      },
    ],
    requireRoleAtLeast: (minRole: string) => (req: any, res: any, next: any) => {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const userIdx = HIERARCHY.indexOf(req.user.role);
      const minIdx = HIERARCHY.indexOf(minRole);
      if (userIdx < 0 || userIdx < minIdx) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      next();
    },
    requireRole: (role: string) => (req: any, res: any, next: any) => {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      if (req.user.role !== role) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      next();
    },
    optionalAuth: [(_req: any, _res: any, next: any) => next()],
    attachUser: (_req: any, _res: any, next: any) => next(),
    handleAuthError: (err: any, _req: any, res: any, next: any) => {
      if (err?.name === 'UnauthorizedError') {
        res.status(401).json({ error: 'Invalid or missing token' });
        return;
      }
      next(err);
    },
    hasRoleAtLeast: (role: string | undefined, minRole: string) => {
      if (!role) return false;
      const HIER = ['User', 'Moderator', 'Admin', 'SuperAdmin', 'Owner'];
      return HIER.indexOf(role) >= HIER.indexOf(minRole);
    },
    ROLE_HIERARCHY: ['User', 'Moderator', 'Admin', 'SuperAdmin', 'Owner'],
  };
});

const asUser = (claims: { sub: string; role: string }) => ({
  'x-test-user': JSON.stringify(claims),
});

const seedIssue = (overrides: Record<string, unknown> = {}) =>
  prisma.issue.create({
    data: {
      title: 'Test issue',
      description: 'Something broke',
      status: 'Open',
      ...overrides,
    },
  });

afterEach(async () => {
  await prisma.issue.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ===========================================================================
// GET /issues
// ===========================================================================

describe('GET /issues', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/v1/issues');
    expect(res.status).toBe(401);
  });

  it('returns 403 for a User-role token', async () => {
    const res = await request(app)
      .get('/v1/issues')
      .set(asUser({ sub: 'u1', role: 'User' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for a Moderator-role token', async () => {
    const res = await request(app)
      .get('/v1/issues')
      .set(asUser({ sub: 'u1', role: 'Moderator' }));
    expect(res.status).toBe(403);
  });

  it('returns 200 with paginated data for Admin', async () => {
    await seedIssue({ title: 'Bug A' });
    await seedIssue({ title: 'Bug B' });

    const res = await request(app)
      .get('/v1/issues')
      .set(asUser({ sub: 'admin1', role: 'Admin' }));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, total: 2, totalPages: 1 });
  });

  it('also allows SuperAdmin and Owner (hierarchy gate)', async () => {
    await seedIssue();

    const sa = await request(app)
      .get('/v1/issues')
      .set(asUser({ sub: 'sa', role: 'SuperAdmin' }));
    expect(sa.status).toBe(200);

    const ow = await request(app)
      .get('/v1/issues')
      .set(asUser({ sub: 'ow', role: 'Owner' }));
    expect(ow.status).toBe(200);
  });

  it('paginates correctly', async () => {
    for (let i = 0; i < 5; i++) {
      await seedIssue({ title: `Bug ${i}` });
    }

    const res = await request(app)
      .get('/v1/issues?page=2&limit=2')
      .set(asUser({ sub: 'admin1', role: 'Admin' }));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 });
  });

  it('filters by a single status', async () => {
    await seedIssue({ status: 'Open' });
    await seedIssue({ status: 'Resolved' });

    const res = await request(app)
      .get('/v1/issues?status=Open')
      .set(asUser({ sub: 'admin1', role: 'Admin' }));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('Open');
  });

  it('filters by comma-separated statuses', async () => {
    await seedIssue({ status: 'Open' });
    await seedIssue({ status: 'Closed' });
    await seedIssue({ status: 'Resolved' });

    const res = await request(app)
      .get('/v1/issues?status=Open,Closed')
      .set(asUser({ sub: 'admin1', role: 'Admin' }));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns 400 for an invalid status value', async () => {
    const res = await request(app)
      .get('/v1/issues?status=banana')
      .set(asUser({ sub: 'admin1', role: 'Admin' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid sort value', async () => {
    const res = await request(app)
      .get('/v1/issues?sort=random')
      .set(asUser({ sub: 'admin1', role: 'Admin' }));
    expect(res.status).toBe(400);
  });

  it('sorts oldest first when ?sort=oldest', async () => {
    const first = await seedIssue({ title: 'First' });
    await seedIssue({ title: 'Second' });

    const res = await request(app)
      .get('/v1/issues?sort=oldest')
      .set(asUser({ sub: 'admin1', role: 'Admin' }));

    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe(first.id);
  });

  it('returns empty data array when no issues exist', async () => {
    const res = await request(app)
      .get('/v1/issues')
      .set(asUser({ sub: 'admin1', role: 'Admin' }));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });
});

// ===========================================================================
// GET /issues/:id
// ===========================================================================

describe('GET /issues/:id', () => {
  it('returns 401 with no token', async () => {
    const issue = await seedIssue();
    const res = await request(app).get(`/v1/issues/${issue.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin', async () => {
    const issue = await seedIssue();
    const res = await request(app)
      .get(`/v1/issues/${issue.id}`)
      .set(asUser({ sub: 'u1', role: 'User' }));
    expect(res.status).toBe(403);
  });

  it('returns the issue for Admin', async () => {
    const issue = await seedIssue({ title: 'Specific bug', description: 'Details here' });

    const res = await request(app)
      .get(`/v1/issues/${issue.id}`)
      .set(asUser({ sub: 'admin1', role: 'Admin' }));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: issue.id, title: 'Specific bug', status: 'Open' });
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await request(app)
      .get('/v1/issues/99999')
      .set(asUser({ sub: 'admin1', role: 'Admin' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app)
      .get('/v1/issues/not-a-number')
      .set(asUser({ sub: 'admin1', role: 'Admin' }));
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// PATCH /issues/:id
// ===========================================================================

describe('PATCH /issues/:id', () => {
  it('returns 401 with no token', async () => {
    const issue = await seedIssue();
    const res = await request(app).patch(`/v1/issues/${issue.id}`).send({ status: 'Resolved' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin', async () => {
    const issue = await seedIssue();
    const res = await request(app)
      .patch(`/v1/issues/${issue.id}`)
      .set(asUser({ sub: 'u1', role: 'User' }))
      .send({ status: 'Resolved' });
    expect(res.status).toBe(403);
  });

  it('updates the status for Admin', async () => {
    const issue = await seedIssue({ status: 'Open' });

    const res = await request(app)
      .patch(`/v1/issues/${issue.id}`)
      .set(asUser({ sub: 'admin1', role: 'Admin' }))
      .send({ status: 'InProgress' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('InProgress');
  });

  it('walks the full status workflow', async () => {
    const issue = await seedIssue({ status: 'Open' });
    const admin = asUser({ sub: 'admin1', role: 'Admin' });
    const statuses = ['InProgress', 'Resolved', 'Closed', 'Wontfix'] as const;

    for (const status of statuses) {
      const res = await request(app).patch(`/v1/issues/${issue.id}`).set(admin).send({ status });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(status);
    }
  });

  it('returns 400 for an unknown status string', async () => {
    const issue = await seedIssue();
    const res = await request(app)
      .patch(`/v1/issues/${issue.id}`)
      .set(asUser({ sub: 'admin1', role: 'Admin' }))
      .send({ status: 'not-a-real-status' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown body keys', async () => {
    const issue = await seedIssue();
    const res = await request(app)
      .patch(`/v1/issues/${issue.id}`)
      .set(asUser({ sub: 'admin1', role: 'Admin' }))
      .send({ title: 'Trying to overwrite reporter content' });
    expect(res.status).toBe(400);
  });

  it('accepts an empty body without error (no-op)', async () => {
    const issue = await seedIssue({ status: 'Open' });
    const res = await request(app)
      .patch(`/v1/issues/${issue.id}`)
      .set(asUser({ sub: 'admin1', role: 'Admin' }))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Open');
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await request(app)
      .patch('/v1/issues/99999')
      .set(asUser({ sub: 'admin1', role: 'Admin' }))
      .send({ status: 'Resolved' });
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// DELETE /issues/:id
// ===========================================================================

describe('DELETE /issues/:id', () => {
  it('returns 401 with no token', async () => {
    const issue = await seedIssue();
    const res = await request(app).delete(`/v1/issues/${issue.id}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin', async () => {
    const issue = await seedIssue();
    const res = await request(app)
      .delete(`/v1/issues/${issue.id}`)
      .set(asUser({ sub: 'u1', role: 'User' }));
    expect(res.status).toBe(403);
  });

  it('deletes the issue and returns it for Admin', async () => {
    const issue = await seedIssue({ title: 'To be deleted' });

    const res = await request(app)
      .delete(`/v1/issues/${issue.id}`)
      .set(asUser({ sub: 'admin1', role: 'Admin' }));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(issue.id);

    const gone = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(gone).toBeNull();
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await request(app)
      .delete('/v1/issues/99999')
      .set(asUser({ sub: 'admin1', role: 'Admin' }));
    expect(res.status).toBe(404);
  });
});
