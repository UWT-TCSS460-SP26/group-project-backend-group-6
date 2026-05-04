import { Router } from 'express';
import {
  searchMovies,
  getMovieDetails,
  getPopularMovies,
} from '../../../controllers/v1/media/movies';
import { getEnrichedMovieDetail } from '../../../controllers/v1/media/enriched';
import {
  requireEnvVar,
  requireSearchQuery,
  validateNumericId,
} from '../../../middleware/validation';
import { optionalAuth } from '../../../middleware/requireAuth';

export const moviesRouter = Router();

// All movie routes require the TMDB API key to be configured
moviesRouter.use(requireEnvVar('TMDB_API_KEY'));

moviesRouter.get('/', requireSearchQuery, searchMovies);
moviesRouter.get('/popular', getPopularMovies);
moviesRouter.get('/:id/enriched', validateNumericId, optionalAuth, getEnrichedMovieDetail);
moviesRouter.get('/:id', validateNumericId, getMovieDetails);
