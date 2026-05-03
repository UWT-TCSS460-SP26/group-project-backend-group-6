import request from 'supertest';
import { app } from '../../../src/app';
import { prisma } from '../../../src/lib/prisma';

jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    issue: {
      create: jest.fn(),
    },
  },
}));

describe('POST /v1/issues', () => {
  it('creates an issue with valid input', async () => {
    (prisma.issue.create as jest.Mock).mockResolvedValue({
      id: 1,
      title: 'Bug report',
      description: 'Something broke',
      reporterContact: 'user@test.com',
      status: 'InProgress',
      createdAt: new Date(),
    });

    const res = await request(app).post('/v1/issues').send({
      title: 'Bug report',
      description: 'Something broke',
      reporterContact: 'user@test.com',
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('returns 400 when title missing', async () => {
    const res = await request(app).post('/v1/issues').send({
      description: 'Missing title',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when description missing', async () => {
    const res = await request(app).post('/v1/issues').send({
      title: 'Missing description',
    });

    expect(res.status).toBe(400);
  });
});