const configuredClientOrigin = () =>
  process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173';

export function isAllowedOrigin(origin) {
  if (!origin || origin === configuredClientOrigin()) return true;
  return process.env.NODE_ENV !== 'production'
    && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

export function requireAllowedOrigin(req, res, next) {
  const { origin } = req.headers;
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  next();
}