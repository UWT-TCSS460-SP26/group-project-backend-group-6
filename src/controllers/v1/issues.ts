import { Request, Response } from 'express';
import { IssueStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const createIssue = async (req: Request, res: Response) => {
  const { title, description, reporterContact } = req.body;

  if (!title || !description) {
    return res.status(400).json({
      error: 'title and description are required',
    });
  }

  const issue = await prisma.issue.create({
    data: {
      title,
      description,
      reporterContact,
    },
  });

  res.status(201).json(issue);
};

// ─── GET /issues ─────────────────────────────────────────────────────────────

export const listIssues = async (request: Request, response: Response): Promise<void> => {
  const query = request.query as Record<string, unknown>;
  const pageNum = Math.max(1, Number(query.page ?? 1));
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit ?? DEFAULT_LIMIT)));
  const status = query.status as string | undefined;
  const sort = (query.sort as string | undefined) ?? 'newest';
  const skip = (pageNum - 1) * limitNum;

  const statusFilter = status ? status.split(',').map((s) => s.trim() as IssueStatus) : undefined;

  const where: Prisma.IssueWhereInput = statusFilter?.length
    ? { status: { in: statusFilter } }
    : {};

  const orderBy: Prisma.IssueOrderByWithRelationInput =
    sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

  try {
    const issues = await prisma.issue.findMany({ where, orderBy, skip, take: limitNum });
    const total = await prisma.issue.count({ where });

    response.json({
      data: issues,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[listIssues]', error);
    response.status(500).json({ error: 'Failed to retrieve issues' });
  }
};

// ─── GET /issues/:id ──────────────────────────────────────────────────────────

export const getIssue = async (request: Request, response: Response): Promise<void> => {
  const id = parseInt(request.params.id as string, 10);
  if (isNaN(id)) {
    response.status(400).json({ error: 'id must be a positive integer' });
    return;
  }

  try {
    const issue = await prisma.issue.findUnique({ where: { id } });

    if (!issue) {
      response.status(404).json({ error: `Issue ${id} not found` });
      return;
    }

    response.json({ data: issue });
  } catch (error) {
    console.error('[getIssue]', error);
    response.status(500).json({ error: 'Failed to retrieve issue' });
  }
};

// ─── PATCH /issues/:id ────────────────────────────────────────────────────────

export const patchIssue = async (request: Request, response: Response): Promise<void> => {
  const id = parseInt(request.params.id as string, 10);
  if (isNaN(id)) {
    response.status(400).json({ error: 'id must be a positive integer' });
    return;
  }
  const { status } = request.body as { status?: IssueStatus };

  const data: Prisma.IssueUpdateInput = {
    ...(status !== undefined && { status }),
  };

  try {
    const updated = await prisma.issue.update({ where: { id }, data });
    response.json({ data: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      response.status(404).json({ error: `Issue ${id} not found` });
      return;
    }
    console.error('[patchIssue]', error);
    response.status(500).json({ error: 'Failed to update issue' });
  }
};

// ─── DELETE /issues/:id ───────────────────────────────────────────────────────

export const deleteIssue = async (request: Request, response: Response): Promise<void> => {
  const id = parseInt(request.params.id as string, 10);
  if (isNaN(id)) {
    response.status(400).json({ error: 'id must be a positive integer' });
    return;
  }
  try {
    const deleted = await prisma.issue.delete({ where: { id } });
    response.json({ data: deleted });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      response.status(404).json({ error: `Issue ${id} not found` });
      return;
    }
    console.error('[deleteIssue]', error);
    response.status(500).json({ error: 'Failed to delete issue' });
  }
};
