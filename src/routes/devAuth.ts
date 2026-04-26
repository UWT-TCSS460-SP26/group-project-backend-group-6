import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * POST /auth/dev-login
 *
 * Local-development only. Accepts { username, displayName } in the body,
 * find-or-creates a user, and returns a signed JWT.
 *
 * - If the user already exists, displayName is updated if a new one is provided.
 * - Do NOT deploy this endpoint to a public URL. It is replaced by real
 *   Auth-Squared integration in Sprint 3.
 *
 * Body: { username: string, displayName?: string }
 */
router.post('/dev-login', async (request: Request, response: Response) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    response.status(500).json({ error: 'JWT_SECRET is not configured' });
    return;
  }

  const { username, displayName } = request.body;

  if (!username || typeof username !== 'string') {
    response.status(400).json({ error: 'Bad Request', message: '"username" is required' });
    return;
  }

  // displayName falls back to username if not provided, since the field is required
  const resolvedDisplayName: string =
    typeof displayName === 'string' && displayName.trim() ? displayName.trim() : username;

  try {
    const user = await prisma.user.upsert({
      where: { username },
      update: {
        // Update displayName if caller explicitly provided one
        ...(typeof displayName === 'string' && displayName.trim()
          ? { displayName: displayName.trim() }
          : {}),
      },
      create: {
        username,
        email: `${username}@dev.local`,
        displayName: resolvedDisplayName,
        // role defaults to "user" per schema
      },
    });

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: '8h' }
    );

    response.status(200).json({ token, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
  } catch {
    response.status(500).json({ error: 'Internal Server Error', message: 'Failed to create or find user' });
  }
});

export default router;