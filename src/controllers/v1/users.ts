import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

// ─── PUT /users/me ────────────────────────────────────────────────────────────

/**
 * Update the authenticated user's own profile.
 *
 * Body (all fields optional — send only what you want to change):
 *   { displayName?: string }
 *
 * The userId always comes from req.user.sub — never from the body.
 * Returns the updated user (without sensitive fields).
 */
export const updateMyProfile = async (request: Request, response: Response) => {
  const userId = request.user!.sub;
  const { displayName } = request.body;

  // Validate displayName if provided
  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      response.status(400).json({
        error: 'Bad Request',
        message: '"displayName" must be a non-empty string',
      });
      return;
    }
    if (displayName.trim().length > 50) {
      response.status(400).json({
        error: 'Bad Request',
        message: '"displayName" must be 50 characters or fewer',
      });
      return;
    }
  }

  // Build only the fields that were actually sent
  const data: { displayName?: string } = {};
  if (displayName !== undefined) data.displayName = displayName.trim();

  if (Object.keys(data).length === 0) {
    response.status(400).json({
      error: 'Bad Request',
      message: 'No updatable fields provided. Send at least one of: displayName',
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      response.status(404).json({ error: 'Not Found', message: 'User not found' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    });

    response.status(200).json(updated);
  } catch {
    response.status(500).json({ error: 'Internal Server Error', message: 'Failed to update profile' });
  }
};

// ─── GET /users/me ────────────────────────────────────────────────────────────

/**
 * Returns the authenticated user's own profile.
 */
export const getMyProfile = async (request: Request, response: Response) => {
  const userId = request.user!.sub;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      response.status(404).json({ error: 'Not Found', message: 'User not found' });
      return;
    }

    response.status(200).json(user);
  } catch {
    response.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch profile' });
  }
};