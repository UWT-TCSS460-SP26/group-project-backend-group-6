import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { MediaType } from '../../generated/prisma';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Validates that a value is a valid MediaType enum member ("movie" | "tv"). */
const parseMediaType = (value: unknown): MediaType | null => {
  if (value === 'movie' || value === 'tv') return value as MediaType;
  return null;
};

/**
 * Validates a half-star score on a 0.5–5.0 scale.
 * Valid values: 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0
 * Rejects anything outside that range or that isn't a 0.5 increment.
 */
const parseScore = (value: unknown): number | null => {
  const n = Number(value);
  if (isNaN(n)) return null;
  if (n < 0.5 || n > 5.0) return null;
  // Must be a multiple of 0.5 — multiply by 2 and check it's a whole number
  if (!Number.isInteger(Math.round(n * 2))) return null;
  return n;
};

// ─── POST /ratings ────────────────────────────────────────────────────────────

/**
 * Create or update the authenticated user's rating for a piece of content.
 *
 * Body: { tmdbId: number, mediaType: "movie"|"tv", score: number (0.5–5.0, half steps) }
 *
 * Uses upsert so a user can re-rate the same content without a unique-constraint
 * error. userId is always taken from req.user — never trusted from the body.
 */
export const createOrUpdateRating = async (request: Request, response: Response) => {
  const userId = request.user!.sub;
  const { tmdbId, mediaType: rawMediaType, score: rawScore } = request.body;

  const tmdbIdNum = Number(tmdbId);
  if (!Number.isInteger(tmdbIdNum) || tmdbIdNum <= 0) {
    response.status(400).json({ error: 'Bad Request', message: '"tmdbId" must be a positive integer' });
    return;
  }

  const mediaType = parseMediaType(rawMediaType);
  if (!mediaType) {
    response.status(400).json({ error: 'Bad Request', message: '"mediaType" must be "movie" or "tv"' });
    return;
  }

  const score = parseScore(rawScore);
  if (score === null) {
    response.status(400).json({
      error: 'Bad Request',
      message: '"score" must be a multiple of 0.5 between 0.5 and 5.0',
    });
    return;
  }

  // Ensure the user record exists in our DB (dev-login creates users on demand,
  // but a race condition or direct-JWT usage could arrive here before that happens)
  const userExists = await prisma.user.findUnique({ where: { id: userId } });
  if (!userExists) {
    response.status(401).json({ error: 'Unauthorized', message: 'User not found — please log in again' });
    return;
  }

  try {
    const rating = await prisma.rating.upsert({
      where: {
        userId_tmdbId_mediaType: { userId, tmdbId: tmdbIdNum, mediaType },
      },
      update: { score },
      create: { userId, tmdbId: tmdbIdNum, mediaType, score },
    });

    response.status(200).json(rating);
  } catch {
    response.status(500).json({ error: 'Internal Server Error', message: 'Failed to save rating' });
  }
};

// ─── GET /ratings/:tmdbId ─────────────────────────────────────────────────────

/**
 * Returns all ratings for a given TMDB ID, with an aggregate summary.
 *
 * Query params:
 *   mediaType  "movie" | "tv"   (required)
 *   page       integer ≥ 1      (default 1)
 *   limit      integer 1–100    (default 20)
 *
 * No auth required — public endpoint.
 * Each result includes the user's displayName so the frontend can show it
 * next to the star rating without a separate user lookup.
 */
export const getRatingsByTmdbId = async (request: Request, response: Response) => {
  const tmdbId = Number(request.params.tmdbId);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    response.status(400).json({ error: 'Bad Request', message: '"tmdbId" must be a positive integer' });
    return;
  }

  const mediaType = parseMediaType(request.query.mediaType);
  if (!mediaType) {
    response.status(400).json({ error: 'Bad Request', message: 'Query param "mediaType" must be "movie" or "tv"' });
    return;
  }

  const page  = Math.max(1, Number(request.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
  const skip  = (page - 1) * limit;

  try {
    const [ratings, totalResults, aggregate] = await Promise.all([
      prisma.rating.findMany({
        where: { tmdbId, mediaType },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          score: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, username: true, displayName: true } },
        },
      }),
      prisma.rating.count({ where: { tmdbId, mediaType } }),
      prisma.rating.aggregate({
        where: { tmdbId, mediaType },
        _avg: { score: true },
        _count: { score: true },
      }),
    ]);

    response.status(200).json({
      tmdbId,
      mediaType,
      // Round average to nearest half-star so it's consistent with the input scale
      averageScore: aggregate._avg.score !== null
        ? Math.round(aggregate._avg.score * 2) / 2
        : null,
      totalRatings: aggregate._count.score,
      page,
      totalPages: Math.ceil(totalResults / limit),
      totalResults,
      results: ratings,
    });
  } catch {
    response.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch ratings' });
  }
};

// ─── PUT /ratings/:id ─────────────────────────────────────────────────────────

/**
 * Replace the score on a rating the authenticated user owns.
 *
 * Body: { score: number (0.5–5.0, half steps) }
 *
 * Returns 403 if the rating belongs to a different user.
 * Returns 404 if the rating doesn't exist.
 */
export const updateRating = async (request: Request, response: Response) => {
  const userId   = request.user!.sub;
  const ratingId = Number(request.params.id);

  const score = parseScore(request.body.score);
  if (score === null) {
    response.status(400).json({
      error: 'Bad Request',
      message: '"score" must be a multiple of 0.5 between 0.5 and 5.0',
    });
    return;
  }

  try {
    const existing = await prisma.rating.findUnique({ where: { id: ratingId } });

    if (!existing) {
      response.status(404).json({ error: 'Not Found', message: `No rating found with id ${ratingId}` });
      return;
    }

    if (existing.userId !== userId) {
      response.status(403).json({ error: 'Forbidden', message: 'You do not own this rating' });
      return;
    }

    const updated = await prisma.rating.update({
      where: { id: ratingId },
      data:  { score },
    });

    response.status(200).json(updated);
  } catch {
    response.status(500).json({ error: 'Internal Server Error', message: 'Failed to update rating' });
  }
};

// ─── DELETE /ratings/:id ──────────────────────────────────────────────────────

/**
 * Delete a rating.
 *
 * Regular users can only delete their own ratings.
 * Admin users can delete any rating.
 *
 * Returns 403 if a non-admin tries to delete someone else's rating.
 * Returns 404 if the rating doesn't exist.
 */
export const deleteRating = async (request: Request, response: Response) => {
  const { sub: userId, role } = request.user!;
  const ratingId = Number(request.params.id);

  try {
    const existing = await prisma.rating.findUnique({ where: { id: ratingId } });

    if (!existing) {
      response.status(404).json({ error: 'Not Found', message: `No rating found with id ${ratingId}` });
      return;
    }

    if (role !== 'admin' && existing.userId !== userId) {
      response.status(403).json({ error: 'Forbidden', message: 'You do not own this rating' });
      return;
    }

    await prisma.rating.delete({ where: { id: ratingId } });

    response.status(200).json({ message: 'Rating deleted successfully' });
  } catch {
    response.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete rating' });
  }
};