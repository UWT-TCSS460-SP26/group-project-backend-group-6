import { Router } from 'express';
import { getMyProfile, updateMyProfile } from '../../controllers/v1/users';
import { requireAuth } from '../../middleware/requireAuth';
 
export const usersRouter = Router();
 
// GET /users/me  — view your own profile
usersRouter.get('/me', requireAuth, getMyProfile);
 
// PUT /users/me  — update displayName
usersRouter.put('/me', requireAuth, updateMyProfile);
 