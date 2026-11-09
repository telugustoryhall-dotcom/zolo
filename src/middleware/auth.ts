import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getSessionWithUser } from '../db/repository.ts';
import type { DbSession, DbUser } from '../db/schema.ts';

export const SESSION_COOKIE_NAME = 'zolo_session';

export interface AuthenticatedRequest extends Request {
  authUser?: DbUser;
  authSession?: DbSession;
  firebaseUser?: DecodedIdToken;
}

export function extractSessionToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
    return cookieToken.trim();
  }

  const headerToken = req.headers['x-session-token'];
  if (typeof headerToken === 'string' && headerToken.trim().length > 0) {
    return headerToken.trim();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Session ')) {
    return authHeader.slice('Session '.length).trim();
  }

  return null;
}

export const requireSessionAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const rawToken = extractSessionToken(req);
    if (!rawToken) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        error: 'Authentication required. Please log in with your mobile number.',
      });
      return;
    }

    const active = await getSessionWithUser(rawToken);
    if (!active) {
      res.status(401).json({
        code: 'SESSION_EXPIRED',
        error: 'Your session has expired or was signed out. Please log in again.',
      });
      return;
    }

    req.authUser = active.user;
    req.authSession = active.session;
    next();
  } catch (error) {
    console.error('Session authentication error:', error);
    res.status(500).json({
      code: 'AUTH_CHECK_FAILED',
      error: 'Unable to verify session right now.',
    });
  }
};

export async function verifyOptionalFirebaseIdToken(idToken?: string): Promise<DecodedIdToken | null> {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch (error) {
    console.error('Firebase ID token verification failed:', error);
    return null;
  }
}
