import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { loadGuestAuthContext, loadStaffAuthContext } from '../middleware/auth';
import { registerRealtimeClient } from '../services/realtime.service';

function getQueryToken(req: Request): string | null {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  return token || null;
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim() || null;
}

function getStreamToken(req: Request): string | null {
  return getBearerToken(req) || getQueryToken(req);
}

export async function streamGuestEntry(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getStreamToken(req);
    if (!token) {
      throw new AppError('Guest session missing', 401, 'UNAUTHORIZED');
    }

    const guest = await loadGuestAuthContext(token);
    if (guest.queueEntryId !== req.params.entryId) {
      throw new AppError('Guest session does not match this queue entry', 403, 'GUEST_SESSION_MISMATCH');
    }

    const close = registerRealtimeClient(`entry:${guest.queueEntryId}`, res);
    req.on('close', close);
  } catch (error) {
    next(error);
  }
}

export async function streamStaffQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getStreamToken(req);
    if (!token) {
      throw new AppError('Staff session missing', 401, 'UNAUTHORIZED');
    }

    const { venue } = await loadStaffAuthContext(token);
    const close = registerRealtimeClient(`venue:${venue.id}`, res);
    req.on('close', close);
  } catch (error) {
    next(error);
  }
}
