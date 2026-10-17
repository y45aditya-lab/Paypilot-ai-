import crypto from 'crypto';
import RefreshToken from '../models/RefreshToken.js';

export const REFRESH_COOKIE = 'refresh_token';
const TTL_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 7);
const isProd = process.env.NODE_ENV === 'production';

export const cookieOptions = {
  httpOnly: true,                      // JavaScript can't read it
  secure: isProd,                      // HTTPS only in production
  sameSite: isProd ? 'none' : 'lax',   // 'none' is needed when Vercel and Render are different sites
  path: '/api/auth',                   // the browser only sends it to auth routes
  maxAge: TTL_DAYS * 24 * 60 * 60 * 1000,
};
const { maxAge: _maxAge, ...clearCookieOptions } = cookieOptions; // clearing must not carry maxAge
export { clearCookieOptions };

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export async function issueRefreshToken(userId, family = crypto.randomUUID()) {
  const token = crypto.randomBytes(48).toString('base64url'); // 384 bits of randomness
  await RefreshToken.create({
    user: userId,
    tokenHash: sha256(token),
    family,
    expiresAt: new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  return { token, family };
}

// Returns { userId, token } for a valid token, or null for anything else.
export async function rotateRefreshToken(token) {
  const doc = await RefreshToken.findOne({ tokenHash: sha256(token) });
  if (!doc) return null;

  if (doc.revokedAt) {
    // An already-used token came back: it was copied. Kill the whole family.
    await RefreshToken.updateMany({ family: doc.family, revokedAt: null }, { revokedAt: new Date() });
    return null;
  }
  if (doc.expiresAt < new Date()) return null;

  // Atomic claim: if two requests race, only one can flip revokedAt from null
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: doc._id, revokedAt: null },
    { revokedAt: new Date() },
  );
  if (!claimed) return null;

  const next = await issueRefreshToken(doc.user, doc.family);
  return { userId: doc.user, token: next.token };
}

export async function revokeRefreshToken(token) {
  const doc = await RefreshToken.findOne({ tokenHash: sha256(token) });
  if (doc) {
    await RefreshToken.updateMany({ family: doc.family, revokedAt: null }, { revokedAt: new Date() });
  }
}