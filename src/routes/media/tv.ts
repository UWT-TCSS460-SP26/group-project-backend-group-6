import { Router } from 'express';
import { searchTV, getTVDetails, getPopularTV } from '../../controllers/tv';
import { requireEnvVar, requireSearchQuery, validateNumericId } from '../../middleware/validation';

export const tvRouter = Router();

// All TMDB routes require the API key to be configured
tvRouter.use(requireEnvVar('TMDB_API_KEY'));

// TV Shows
tvRouter.get('/tv', requireSearchQuery, searchTV);
tvRouter.get('/tv/popular', getPopularTV);
tvRouter.get('/tv/:id', validateNumericId, getTVDetails);
