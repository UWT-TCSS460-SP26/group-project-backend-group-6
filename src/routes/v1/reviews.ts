import { Router } from 'express';
import {
  createReview,
  getReviewsByTmdbId,
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

reviewsRouter.post('/', requireAuth, validateReviewBody, createReview);
reviewsRouter.get('/:tmdbId', validateTmdbParam, getReviewsByTmdbId);
reviewsRouter.put('/:id', requireAuth, validateNumericId, validatePatchReviewBody, updateReview);
reviewsRouter.delete('/:id', requireAuth, validateNumericId, deleteReview);
