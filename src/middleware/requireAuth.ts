import { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import { expressjwt, type Request as JwtRequest } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import { prisma } from '../lib/prisma';

export const ROLE_HIERARCHY = ['User', 'Moderator', 'Admin', 'SuperAdmin', 'Owner'] as const;
export type Role = (typeof ROLE_HIERARCHY)[number];

export interface AuthenticatedUser {
  sub: string;
  email?: string;
  role: Role;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express type augmentation
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const issuer = process.env.AUTH_ISSUER;
const audience = process.env.API_AUDIENCE;

if (!issuer || !audience) {
  // Fail fast at boot — middleware would surface this as 500 on every request otherwise.
  throw new Error(
    'AUTH_ISSUER and API_AUDIENCE must be set. See .env.example for the auth-squared integration.'
  );
}

const jwksSecret = jwksRsa.expressJwtSecret({
  jwksUri: `${issuer}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

const verifyJwt = expressjwt({
  secret: jwksSecret,
  audience,
  issuer,
  algorithms: ['RS256'],
});

const verifyJwtOptional = expressjwt({
  secret: jwksSecret,
  audience,
  issuer,
  algorithms: ['RS256'],
  credentialsRequired: false,
});

export const attachUser = (request: JwtRequest, _response: Response, next: NextFunction): void => {
  if (request.auth) {
    (request as Request).user = request.auth as AuthenticatedUser;
  }
  next();
};

export const handleAuthError: ErrorRequestHandler = (error, _request, response, next) => {
  if (error && (error as { name?: string }).name === 'UnauthorizedError') {
    response.status(401).json({ error: 'Invalid or missing token' });
    return;
  }
  next(error);
};

/**
 * Overwrites req.user.role with the role stored in the local database.
 * This decouples authorization (your DB) from authentication (the token playground).
 * The token's `sub` identifies who the user is; your DB determines what they can do.
 * Falls back to the token role if the user has no local row yet (first request).
 */
export const resolveDbRole: RequestHandler = async (
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> => {
  if (!request.user) {
    next();
    return;
  }
  try {
    const dbUser = await prisma.user.findUnique({
      where: { subjectId: request.user.sub },
      select: { role: true },
    });
    if (dbUser) {
      request.user.role = dbUser.role as Role;
    }
  } catch {
    // DB unreachable — fall back to token role rather than blocking the request.
  }
  next();
};

export const requireAuth: Array<RequestHandler | ErrorRequestHandler> = [
  verifyJwt,
  attachUser,
  handleAuthError,
  resolveDbRole,
];

export const optionalAuth: Array<RequestHandler | ErrorRequestHandler> = [
  verifyJwtOptional,
  attachUser,
  handleAuthError,
  resolveDbRole,
];

/**
 * Exact-match role gate. Use after requireAuth:
 *
 *   router.delete('/messages/:id', requireAuth, requireRole('Admin'), handler);
 */
export const requireRole = (role: Role): RequestHandler => {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.user) {
      response.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (request.user.role !== role) {
      response.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
};

/**
 * Minimum-role gate using the 5-tier auth-squared hierarchy:
 * User < Moderator < Admin < SuperAdmin < Owner
 *
 *   router.delete('/messages/:id', requireAuth, requireRoleAtLeast('Admin'), handler);
 */
export const requireRoleAtLeast = (minRole: Role): RequestHandler => {
  const minIdx = ROLE_HIERARCHY.indexOf(minRole);
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.user) {
      response.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const userIdx = ROLE_HIERARCHY.indexOf(request.user.role);
    if (userIdx < 0 || userIdx < minIdx) {
      response.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
};

/**
 * Returns true when the authenticated user's role is at least `minRole` in
 * the 5-tier hierarchy. For use in controllers where policy is "owner OR
 * privileged," which can't be expressed as a single middleware gate.
 */
export const hasRoleAtLeast = (role: Role | undefined, minRole: Role): boolean => {
  if (!role) return false;
  const userIdx = ROLE_HIERARCHY.indexOf(role);
  const minIdx = ROLE_HIERARCHY.indexOf(minRole);
  return userIdx >= 0 && userIdx >= minIdx;
};
