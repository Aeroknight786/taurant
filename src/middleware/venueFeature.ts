import { NextFunction, Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from './errorHandler';
import { AuthenticatedRequest } from '../types';
import { assertVenueFeatureEnabled, type VenueFeatureKey } from '../services/venueConfig.service';

type VenueIdResolver = (req: AuthenticatedRequest) => Promise<string | null> | string | null;

function resolveVenueIdFromRequest(req: AuthenticatedRequest): string | null {
  if (req.venue?.id) {
    return req.venue.id;
  }

  if (req.guest?.venueId) {
    return req.guest.venueId;
  }

  if (typeof req.body?.venueId === 'string' && req.body.venueId.trim()) {
    return req.body.venueId.trim();
  }

  if (typeof req.params?.venueId === 'string' && req.params.venueId.trim()) {
    return req.params.venueId.trim();
  }

  return null;
}

export function resolveVenueIdFromQueueEntryParam(paramName = 'entryId'): VenueIdResolver {
  return async (req) => {
    const entryId = typeof req.params?.[paramName] === 'string' ? req.params[paramName].trim() : '';
    if (!entryId) {
      return null;
    }

    const entry = await prisma.queueEntry.findUnique({
      where: { id: entryId },
      select: { venueId: true },
    });

    return entry?.venueId ?? null;
  };
}

export function resolveVenueIdFromPartyJoinToken(paramName = 'joinToken'): VenueIdResolver {
  return async (req) => {
    const joinToken = typeof req.params?.[paramName] === 'string' ? req.params[paramName].trim() : '';
    if (!joinToken) {
      return null;
    }

    const session = await prisma.partySession.findFirst({
      where: { joinToken },
      select: { venueId: true },
    });

    return session?.venueId ?? null;
  };
}

export function requireVenueFeature(feature: VenueFeatureKey, resolveVenueId: VenueIdResolver = resolveVenueIdFromRequest) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const venueId = await resolveVenueId(req);
      if (!venueId) {
        throw new AppError('Venue context unavailable for this request', 400, 'VENUE_CONTEXT_REQUIRED');
      }

      await assertVenueFeatureEnabled(venueId, feature);
      next();
    } catch (error) {
      next(error);
    }
  };
}
