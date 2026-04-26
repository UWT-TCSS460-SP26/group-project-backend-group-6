import { Router } from 'express';
import {
  createOrUpdateRating,
  getRatingsByTmdbId,
  updateRating,
  deleteRating,
} from '../../controllers/v1/ratings';
import { validateNumericId } from '../../middleware/validation';
import { requireAuth } from '../../middleware/requireAuth';

export const ratingsRouter = Router();

// ── Public ────────────────────────────────────────────────────────────────────

// GET /ratings/:tmdbId?mediaType=movie|tv&page=1&limit=20
ratingsRouter.get('/:tmdbId', getRatingsByTmdbId);

// ── Authenticated ─────────────────────────────────────────────────────────────

// POST /ratings  — create or upsert a rating
ratingsRouter.post('/', requireAuth, createOrUpdateRating);

// PUT /ratings/:id  — update score on your own rating
ratingsRouter.put('/:id', requireAuth, validateNumericId, updateRating);

// DELETE /ratings/:id  — delete your own rating (admins can delete any)
ratingsRouter.delete('/:id', requireAuth, validateNumericId, deleteRating);