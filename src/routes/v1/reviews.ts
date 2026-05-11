import { Router } from 'express';
import {
  createReview,
  getReviewsByTmdbId,
  getMyReviews,
  updateReview,
  deleteReview,
} from '../../controllers/v1/reviews';
import { requireAuth } from '../../middleware/requireAuth';
import {
  validateTmdbParam,
  validateNumericId,
  validateReviewBody,
  validatePatchReviewBody,
} from '../../middleware/validationZod';

export const reviewsRouter = Router();

// /me must be registered before /:tmdbId so Express matches the literal first.
reviewsRouter.get('/me', requireAuth, getMyReviews);

reviewsRouter.post('/', requireAuth, validateReviewBody, createReview);
reviewsRouter.get('/:tmdbId', validateTmdbParam, getReviewsByTmdbId);
reviewsRouter.put('/:id', requireAuth, validateNumericId, validatePatchReviewBody, updateReview);
reviewsRouter.delete('/:id', requireAuth, validateNumericId, deleteReview);
