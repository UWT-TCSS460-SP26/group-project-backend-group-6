import { Router } from 'express';
import { searchTV, getTVDetails, getPopularTV } from '../../../controllers/v1/media/tv';
import { getEnrichedTvDetail } from '../../../controllers/v1/media/enriched';
import {
  requireEnvVar,
  requireSearchQuery,
  validateNumericId,
} from '../../../middleware/validation';
import { optionalAuth } from '../../../middleware/requireAuth';

export const tvRouter = Router();

// All TMDB routes require the API key to be configured
tvRouter.use(requireEnvVar('TMDB_API_KEY'));

// TV Shows
tvRouter.get('/tv', requireSearchQuery, searchTV);
tvRouter.get('/tv/popular', getPopularTV);
tvRouter.get('/tv/:id/enriched', validateNumericId, optionalAuth, getEnrichedTvDetail);
tvRouter.get('/tv/:id', validateNumericId, getTVDetails);
