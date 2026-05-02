import { prisma } from './prisma';
import type { AuthenticatedUser } from '../middleware/requireAuth';
import type { User } from '../generated/prisma';

// Shape of the Auth² userinfo response we care about.
// Fields are optional — Auth² may omit any of them depending on the user's
// profile completeness and the scopes on the token.
interface UserInfoResponse {
  sub?: string;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  name?: string; // full name fallback
}

/**
 * Returns the local User row for the authenticated caller, creating it on the
 * first request by fetching enriched profile data from Auth²'s userinfo endpoint.
 *
 * Call pattern:
 *   - Fast path  : subjectId already in DB → one SELECT, zero network calls.
 *   - Cache miss : fetch userinfo, upsert row, return it.
 *
 * Only call this from route handlers that need a local user row (protected
 * routes that write data). Public GETs should skip this entirely — no DB
 * write on a request that doesn't need one.
 *
 * @param token    The raw Bearer token from the Authorization header.
 *                 Pass `req.headers.authorization?.split(' ')[1]` — or use
 *                 the helper below.
 * @param authUser The decoded payload already on req.user (from requireAuth).
 */
export async function resolveLocalUser(token: string, authUser: AuthenticatedUser): Promise<User> {
  // ── Fast path ────────────────────────────────────────────────────────────
  const existing = await prisma.user.findUnique({
    where: { subjectId: authUser.sub },
  });
  if (existing) return existing;

  // ── Cache miss: enrich from Auth² userinfo ───────────────────────────────
  const issuer = process.env.AUTH_ISSUER;
  if (!issuer) throw new Error('AUTH_ISSUER is not set');

  let info: UserInfoResponse = {};
  try {
    const res = await fetch(`${issuer}/v2/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      info = (await res.json()) as UserInfoResponse;
    } else {
      // Log the failure but don't block the request — fall back to token claims.
      console.error(`[resolveLocalUser] userinfo ${res.status} for sub=${authUser.sub}`);
    }
  } catch (err) {
    // Network error — proceed with token-only data rather than failing the request.
    console.error('[resolveLocalUser] userinfo fetch threw:', err);
  }

  // Derive best-available values with sensible fallbacks.
  // Auth² may omit fields for incomplete profiles — we never store undefined.
  const subjectId = authUser.sub;
  const email = info.email ?? authUser.email ?? `${subjectId}@unknown.local`;
  const username = info.preferred_username ?? subjectId;
  const firstName = info.given_name ?? null;
  const lastName = info.family_name ?? null;

  // ── Upsert ───────────────────────────────────────────────────────────────
  // `upsert` is safe under concurrent first requests — the unique constraint on
  // subjectId means only one INSERT wins; the rest become no-op updates.
  const user = await prisma.user.upsert({
    where: { subjectId },
    update: {
      // Don't overwrite profile fields on a race-condition hit — the winner's
      // data is fine. If you want to sync profile changes on every login,
      // move these fields to the `update` block instead.
    },
    create: {
      subjectId,
      email,
      username,
      firstName,
      lastName,
      role: authUser.role, // mirror the token role into the local row
    },
  });

  return user;
}

/**
 * Convenience helper — extracts the raw token string from the Authorization
 * header so callers don't have to split it themselves.
 *
 * Usage in a route handler:
 *   const user = await resolveLocalUser(bearerToken(req), req.user!);
 */
export function bearerToken(req: { headers: { authorization?: string } }): string {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (!token) throw new Error('Authorization header is missing or malformed');
  return token;
}
