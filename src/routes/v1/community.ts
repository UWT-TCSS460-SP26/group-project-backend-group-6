import { Router } from 'express';
import { getTopRated, getMostReviewed } from '../../controllers/v1/community';
import { requireEnvVar } from '../../middleware/validation';

export const communityRouter = Router();

communityRouter.use(requireEnvVar('TMDB_API_KEY'));

communityRouter.get('/top-rated', getTopRated);
communityRouter.get('/most-reviewed', getMostReviewed);
