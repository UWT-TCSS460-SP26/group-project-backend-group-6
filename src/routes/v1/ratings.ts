import { Router } from 'express';
import {
  createOrUpdateRating,
  getRatingsByTmdbId,
  updateRating,
  deleteRating,
} from '../../controllers/v1/ratings';
import { requireAuth } from '../../middleware/requireAuth';
import {
  validateTmdbParam,
  validateNumericId,
  validateRatingBody,
  validatePatchRatingBody,
} from '../../middleware/validationZod';

export const ratingsRouter = Router();

ratingsRouter.post('/', requireAuth, validateRatingBody, createOrUpdateRating);
ratingsRouter.get('/:tmdbId', validateTmdbParam, getRatingsByTmdbId);
ratingsRouter.put('/:id', requireAuth, validateNumericId, validatePatchRatingBody, updateRating);
ratingsRouter.delete('/:id', requireAuth, validateNumericId, deleteRating);
