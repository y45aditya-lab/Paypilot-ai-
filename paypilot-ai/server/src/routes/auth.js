import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import OrganizationInvite from '../models/OrganizationInvite.js';
import crypto from 'node:crypto';
import Vendor from '../models/Vendor.js';
import VendorOffer from '../models/VendorOffer.js';
import { provisionOrganizationVendors } from '../Service/provisionOrganization.js';
import { signAccessToken } from '../Utils/Token.js';
import {
  issueRefreshToken, rotateRefreshToken, revokeRefreshToken,
  REFRESH_COOKIE, cookieOptions, clearCookieOptions,
} from '../Service/refreshtoken.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAllowedOrigin } from '../middleware/requireAllowedOrigin.js';
import { loginLimiter, refreshLimiter } from '../middleware/authlimiter.js';
import { signupSchema, loginSchema } from '../validation/Schemas.js';

const router = Router();
const COST = 12;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  department: u.department,
  organization: String(u.organization?._id ?? u.organization),
  organizationName: u.organization?.name,
  notificationPreferences: u.notificationPreferences,
});

// New login = new token family. The refresh token travels ONLY in the cookie.
async function startSession(res, user, status = 200) {
  const { token } = await issueRefreshToken(user._id);
  res.cookie(REFRESH_COOKIE, token, cookieOptions);
  return res.status(status).json({ accessToken: signAccessToken(user._id), user: publicUser(user) });
}

router.post('/signup', loginLimiter, validate(signupSchema), async (req, res, next) => {
  try {
    const { name, email, password, organizationName } = req.body;
    if (await User.exists({ email })) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const passwordHash = await bcrypt.hash(password, COST);
    const organization = await Organization.create({ name: organizationName || `${name.trim()}'s workspace` });
    let user;
    try {
      await provisionOrganizationVendors(organization._id);
      user = await User.create({
        name, email, passwordHash, organization: organization._id, role: 'admin', department: 'General',
      });
    } catch (error) {
      await VendorOffer.deleteMany({ organization: organization._id });
      await Vendor.deleteMany({ organization: organization._id });
      await Organization.deleteOne({ _id: organization._id });
      throw error;
    }
    await startSession(res, await user.populate('organization', 'name'), 201);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    next(err);
  }
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash').populate('organization', 'name');
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) return res.status(401).json({ error: 'Invalid email or password' });
    await startSession(res, user);
  } catch (err) {
    next(err);
  }
});

// Called on page load and whenever the access token expires.
router.post('/refresh', refreshLimiter, requireAllowedOrigin, async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) return res.status(401).json({ error: 'No session' });

    const rotated = await rotateRefreshToken(token);
    if (!rotated) {
      res.clearCookie(REFRESH_COOKIE, clearCookieOptions);
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }

    const user = await User.findById(rotated.userId).populate('organization', 'name');
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });

    res.cookie(REFRESH_COOKIE, rotated.token, cookieOptions); // the NEW token replaces the old one
    res.json({ accessToken: signAccessToken(user._id), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAllowedOrigin, async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token); // kills the whole family server-side
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('organization', 'name');
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.patch('/preferences', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      payment: z.boolean().optional(),
      approvals: z.boolean().optional(),
      budget: z.boolean().optional(),
      risk: z.boolean().optional(),
      email: z.boolean().optional(),
    }).strict().refine((value) => Object.keys(value).length > 0);
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Provide at least one valid notification preference.' });
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, organization: req.user.organizationId },
      { $set: Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [`notificationPreferences.${key}`, value])) },
      { new: true },
    );
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    res.json({ notificationPreferences: user.notificationPreferences });
  } catch (error) { next(error); }
});

router.post('/accept-invite', loginLimiter, async (req, res, next) => {
  try {
    const { name, email: rawEmail, password, inviteToken } = req.body ?? {};
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 60
      || typeof password !== 'string' || password.length < 8 || password.length > 72
      || typeof inviteToken !== 'string' || inviteToken.length < 32 || inviteToken.length > 200
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid name, email, password, and invitation token.' });
    }
    if (await User.exists({ email })) return res.status(409).json({ error: 'An account with this email already exists.' });
    const tokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
    const invite = await OrganizationInvite.findOneAndUpdate(
      { tokenHash, email, usedAt: null, expiresAt: { $gt: new Date() } },
      { usedAt: new Date() },
      { new: true },
    );
    if (!invite) return res.status(400).json({ error: 'This invitation is invalid, expired, or already used.' });
    try {
      const user = await User.create({
        name: name.trim(),
        email,
        passwordHash: await bcrypt.hash(password, COST),
        organization: invite.organization,
        role: invite.role,
        department: invite.department,
      });
      await startSession(res, await user.populate('organization', 'name'), 201);
    } catch (error) {
      await OrganizationInvite.updateOne({ _id: invite._id, usedAt: { $ne: null } }, { $unset: { usedAt: 1 } });
      if (error.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
      throw error;
    }
  } catch (err) {
    next(err);
  }
});

export default router;