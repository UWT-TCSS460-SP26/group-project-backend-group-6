import { Router } from 'express';
import {
  createIssue,
  listIssues,
  getIssue,
  patchIssue,
  deleteIssue,
} from '../../controllers/v1/issues';
import { requireAuth, requireRoleAtLeast } from '../../middleware/requireAuth';
import {
  validateNumericId,
  validateIssueListQuery,
  validatePatchIssueBody,
} from '../../middleware/validationZod';

export const issuesRouter = Router();

/**
 * Story 1: Public Submission (Sprint 3)
 */
issuesRouter.post('/', createIssue);

/**
 * Story 2: Admin Triage & Management (Sprint 4)
 * These require a valid token and Admin-level privileges.
 */

// List issues with filtering (e.g., ?status=Open,InProgress)
issuesRouter.get('/', requireAuth, requireRoleAtLeast('Admin'), validateIssueListQuery, listIssues);

// View a single issue
issuesRouter.get('/:id', requireAuth, requireRoleAtLeast('Admin'), validateNumericId, getIssue);

// Update issue status (Triage)
issuesRouter.patch(
  '/:id',
  requireAuth,
  requireRoleAtLeast('Admin'),
  validateNumericId,
  validatePatchIssueBody,
  patchIssue
);

// Remove an issue
issuesRouter.delete(
  '/:id',
  requireAuth,
  requireRoleAtLeast('Admin'),
  validateNumericId,
  deleteIssue
);
