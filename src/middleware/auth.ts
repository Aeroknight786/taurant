import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../config/database';
import { unauthorized, forbidden } from '../utils/response';
import { StaffRole } from '@prisma/client';
import { AppError } from './errorHandler';
import { resolveGuestAccessModeFromQueueEntry } from '../services/guestAccessLink.service';

function getBearerToken(req: AuthenticatedRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

async function loadGuestAuthContext(token: string) {
  const payload = verifyToken(token);
  if (payload.kind !== 'guest') {
    throw new AppError('Invalid token kind', 401, 'UNAUTHORIZED');
  }

  const entry = await prisma.queueEntry.findUnique({
    where: { id: payload.queueEntryId },
    select: {
      id: true,
      venueId: true,
      guestPhone: true,
      status: true,
      completedAt: true,
      updatedAt: true,
    },
  });

  if (!entry || entry.venueId !== payload.venueId || entry.guestPhone !== payload.guestPhone) {
    throw new AppError('Guest session invalid', 401, 'UNAUTHORIZED');
  }

  const accessMode = resolveGuestAccessModeFromQueueEntry(entry);
  if (!accessMode) {
    throw new AppError('Guest session expired', 401, 'UNAUTHORIZED');
  }

  if (accessMode === 'ACTIVE' && payload.partySessionId && payload.participantId) {
    const participant = await prisma.partyParticipant.findFirst({
      where: {
        id: payload.participantId,
        partySessionId: payload.partySessionId,
        isActive: true,
        partySession: {
          queueEntryId: entry.id,
          venueId: entry.venueId,
          status: { in: ['ACTIVE', 'LOCKED'] },
        },
      },
      select: { id: true },
    });

    if (!participant) {
      throw new AppError('Guest participant invalid', 401, 'UNAUTHORIZED');
    }
  }

  return {
    queueEntryId: entry.id,
    venueId: entry.venueId,
    guestPhone: entry.guestPhone,
    partySessionId: payload.partySessionId,
    participantId: payload.participantId,
    accessMode,
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    unauthorized(res);
    return;
  }
  try {
    const payload = verifyToken(token);
    if (payload.kind !== 'staff') {
      unauthorized(res, 'Invalid token kind');
      return;
    }
    const staff = await prisma.staff.findFirst({
      where: { id: payload.staffId, venueId: payload.venueId, isActive: true },
      include: { venue: true },
    });
    if (!staff) { unauthorized(res); return; }
    req.staff = staff;
    req.venue = staff.venue;
    next();
  } catch {
    unauthorized(res, 'Invalid or expired token');
  }
}

export async function requireGuestAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    unauthorized(res);
    return;
  }

  try {
    req.guest = await loadGuestAuthContext(token);

    next();
  } catch {
    unauthorized(res, 'Invalid or expired token');
  }
}

export async function requireGuestOrStaffAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    unauthorized(res);
    return;
  }

  try {
    const payload = verifyToken(token);

    if (payload.kind === 'staff') {
      const staff = await prisma.staff.findFirst({
        where: { id: payload.staffId, venueId: payload.venueId, isActive: true },
        include: { venue: true },
      });
      if (!staff) {
        unauthorized(res);
        return;
      }
      req.staff = staff;
      req.venue = staff.venue;
      next();
      return;
    }

    req.guest = await loadGuestAuthContext(token);
    next();
  } catch {
    unauthorized(res, 'Invalid or expired token');
  }
}

export function requireGuestMutationAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.guest) {
    unauthorized(res, 'Guest session required');
    return;
  }

  if ((req.guest.accessMode ?? 'ACTIVE') !== 'ACTIVE') {
    next(new AppError('Guest session is read-only', 403, 'GUEST_SESSION_READ_ONLY'));
    return;
  }

  next();
}

export function requireRole(...roles: StaffRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.staff || !roles.includes(req.staff.role)) {
      forbidden(res, `Requires role: ${roles.join(' or ')}`);
      return;
    }
    next();
  };
}
