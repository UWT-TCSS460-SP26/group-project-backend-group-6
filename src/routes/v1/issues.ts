import { Router } from 'express';
import { createIssue } from '../../controllers/v1/issues';

export const issuesRouter = Router();

issuesRouter.post('/', createIssue);
