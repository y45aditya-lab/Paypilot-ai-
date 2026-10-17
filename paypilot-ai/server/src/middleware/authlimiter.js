import rateLimit from 'express-rate-limit';

// Stops password guessing: 20 auth attempts per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});
export const loginLimiter = authLimiter;

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many refresh attempts. Try again later.' },
});

// Stops anyone from burning your OpenAI credits: 10 AI requests per minute per USER.
// Must run AFTER requireAuth so req.user exists.
export const recommendationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user.id,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a minute.' },
});

export const procurementLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user.id,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many procurement actions. Please wait a minute.' },
});