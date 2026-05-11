import { Request, Response } from 'express';
import type { User, Rating } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { resolveLocalUser, bearerToken } from '../../lib/resolveLocalUser';
import { RatingBody, PatchRatingBody } from '../../middleware/validationZod';

type RatingWithUser = Rating & { user: User };

function makeAuthor(user: User) {
  const name =
    user.displayName ??
    (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : null) ??
    user.username;
  return { id: user.subjectId, username: name };
}

function shapeRating(rating: RatingWithUser) {
  const { user, ...rest } = rating;
  return { ...rest, author: makeAuthor(user) };
}

/**
 * POST /ratings
 * Upserts a rating for the authenticated user.
 * One rating per user per (tmdbId, mediaType) — re-rating updates the score.
 */
export const createOrUpdateRating = async (request: Request, response: Response): Promise<void> => {
  const { tmdbId, mediaType, score } = request.body as RatingBody;

  const localUser = await resolveLocalUser(bearerToken(request), request.user!);

  const rating = await prisma.rating.upsert({
    where: { userId_tmdbId_mediaType: { userId: localUser.id, tmdbId, mediaType } },
    update: { score },
    create: { userId: localUser.id, tmdbId, mediaType, score },
    include: { user: true },
  });

  response.status(200).json(shapeRating(rating));
};

/**
 * GET /ratings/:tmdbId?mediaType=movie|tv
 * Public — returns paginated ratings + aggregate stats for a title.
 */
export const getRatingsByTmdbId = async (request: Request, response: Response): Promise<void> => {
  const tmdbId = Number(request.params.tmdbId);
  const mediaType = request.query.mediaType as string;
  const page = Math.max(1, Number(request.query.page) || 1);
  const pageSize = 20;

  if (!mediaType || (mediaType !== 'movie' && mediaType !== 'tv')) {
    response
      .status(400)
      .json({ error: 'Bad Request', message: 'mediaType must be "movie" or "tv"' });
    return;
  }

  const where = { tmdbId, mediaType: mediaType as 'movie' | 'tv' };

  const [ratings, totalRatings, aggregate] = await Promise.all([
    prisma.rating.findMany({
      where,
      include: { user: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.rating.count({ where }),
    prisma.rating.aggregate({ where, _avg: { score: true } }),
  ]);

  response.json({
    tmdbId,
    mediaType,
    averageScore: aggregate._avg.score ?? null,
    totalRatings,
    page,
    totalPages: Math.ceil(totalRatings / pageSize),
    results: ratings.map(shapeRating),
  });
};

/**
 * GET /ratings/me
 * Authenticated — returns paginated ratings submitted by the calling user.
 * Identity is read from request.user.sub; a userId query param is never trusted.
 */
export const getMyRatings = async (request: Request, response: Response): Promise<void> => {
  const page = Math.max(1, Number(request.query.page) || 1);
  const pageSize = 20;
  const where = { user: { subjectId: request.user!.sub } };

  const [ratings, totalRatings] = await Promise.all([
    prisma.rating.findMany({
      where,
      include: { user: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.rating.count({ where }),
  ]);

  response.json({
    totalRatings,
    page,
    totalPages: Math.ceil(totalRatings / pageSize),
    results: ratings.map(shapeRating),
  });
};

/**
 * PUT /ratings/:id
 * Updates a rating score. User must own the rating (Admins and above bypass ownership check).
 */
export const updateRating = async (request: Request, response: Response): Promise<void> => {
  const id = Number(request.params.id);
  const { score } = request.body as PatchRatingBody;

  const localUser = await resolveLocalUser(bearerToken(request), request.user!);
  const { role } = request.user!;

  const existing = await prisma.rating.findUnique({ where: { id } });
  if (!existing) {
    response.status(404).json({ error: 'Not Found', message: `No rating found with id ${id}.` });
    return;
  }

  if (existing.userId !== localUser.id && role !== 'Admin') {
    response
      .status(403)
      .json({ error: 'Forbidden', message: 'You do not have permission to modify this resource.' });
    return;
  }

  const updated = await prisma.rating.update({
    where: { id },
    data: { score },
    include: { user: true },
  });

  response.json(shapeRating(updated));
};

/**
 * DELETE /ratings/:id
 * Deletes a rating. User must own the rating (Admins and above bypass ownership check).
 */
export const deleteRating = async (request: Request, response: Response): Promise<void> => {
  const id = Number(request.params.id);

  const localUser = await resolveLocalUser(bearerToken(request), request.user!);
  const { role } = request.user!;

  const existing = await prisma.rating.findUnique({ where: { id } });
  if (!existing) {
    response.status(404).json({ error: 'Not Found', message: `No rating found with id ${id}.` });
    return;
  }

  if (existing.userId !== localUser.id && role !== 'Admin') {
    response
      .status(403)
      .json({ error: 'Forbidden', message: 'You do not have permission to modify this resource.' });
    return;
  }

  await prisma.rating.delete({ where: { id } });
  response.status(204).send();
};
