import jwt from 'jsonwebtoken';

// Short-lived and stateless: the server doesn't store these
export function signAccessToken(userId) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: String(userId),
    expiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
    algorithm: 'HS256',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}