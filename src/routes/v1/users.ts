import { Router } from 'express';
import { getMyRatings } from '../../controllers/v1/users';
import { requireAuth } from '../../middleware/requireAuth';
import { requireEnvVar } from '../../middleware/validation';

export const usersRouter = Router();

usersRouter.get('/me/ratings', requireAuth, requireEnvVar('TMDB_API_KEY'), getMyRatings);
