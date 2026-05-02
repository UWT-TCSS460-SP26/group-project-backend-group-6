import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { resolveLocalUser, bearerToken } from '../../lib/resolveLocalUser';
import { ReviewBody, PatchReviewBody } from '../../middleware/validationZod';

/**
 * POST /reviews
 * Creates a review for the authenticated user.
 * Multiple reviews per user per title are allowed.
 */
export const createReview = async (request: Request, response: Response): Promise<void> => {
  const { tmdbId, mediaType, title, body } = request.body as ReviewBody;

  // resolveLocalUser gives us the integer PK we can use as a FK.
  // Auth²'s sub is a string like "auth2|abc123" — never parseInt it directly.
  const localUser = await resolveLocalUser(bearerToken(request), request.user!);

  const review = await prisma.review.create({
    data: { userId: localUser.id, tmdbId, mediaType, title, body },
  });

  response.status(201).json(review);
};

/**
 * GET /reviews/:tmdbId?mediaType=movie|tv
 * Public — returns paginated reviews for a title, sorted most recent first.
 */
export const getReviewsByTmdbId = async (request: Request, response: Response): Promise<void> => {
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

  const [reviews, totalReviews] = await Promise.all([
    prisma.review.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.review.count({ where }),
  ]);

  response.json({
    tmdbId,
    mediaType,
    totalReviews,
    page,
    totalPages: Math.ceil(totalReviews / pageSize),
    results: reviews,
  });
};

/**
 * PUT /reviews/:id
 * Updates a review. User must own the review (Admins and above bypass ownership check).
 * At least one of title or body must be provided (enforced by Zod).
 */
export const updateReview = async (request: Request, response: Response): Promise<void> => {
  const id = Number(request.params.id);
  const { title, body } = request.body as PatchReviewBody;

  const localUser = await resolveLocalUser(bearerToken(request), request.user!);
  const { role } = request.user!;

  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) {
    response.status(404).json({ error: 'Not Found', message: `No review found with id ${id}.` });
    return;
  }

  if (existing.userId !== localUser.id && role !== 'Admin') {
    response
      .status(403)
      .json({ error: 'Forbidden', message: 'You do not have permission to modify this resource.' });
    return;
  }

  const updated = await prisma.review.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(body !== undefined && { body }),
    },
  });

  response.json(updated);
};

/**
 * DELETE /reviews/:id
 * Deletes a review. User must own the review (Admins and above bypass ownership check).
 */
export const deleteReview = async (request: Request, response: Response): Promise<void> => {
  const id = Number(request.params.id);

  const localUser = await resolveLocalUser(bearerToken(request), request.user!);
  const { role } = request.user!;

  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) {
    response.status(404).json({ error: 'Not Found', message: `No review found with id ${id}.` });
    return;
  }

  if (existing.userId !== localUser.id && role !== 'Admin') {
    response
      .status(403)
      .json({ error: 'Forbidden', message: 'You do not have permission to modify this resource.' });
    return;
  }

  await prisma.review.delete({ where: { id } });
  response.status(204).send();
};
