import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { AuthUser } from '../types/zignals.ts';

const RUNTIME_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  return configured && configured.length >= 16 ? configured : RUNTIME_FALLBACK_SECRET;
}

export interface JwtPayload {
  userId: number;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAuthToken(user: AuthUser): string {
  return jwt.sign(
    { userId: user.id, email: user.email } satisfies JwtPayload,
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

export function verifyAuthToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    if (!decoded || typeof decoded.userId !== 'number' || typeof decoded.email !== 'string') {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

export function requireAuthMiddleware(
  loadUserById: (id: number) => Promise<AuthUser | null>
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }
    const payload = verifyAuthToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }
    const user = await loadUserById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'User account not found.' });
      return;
    }
    req.authUser = user;
    next();
  };
}
