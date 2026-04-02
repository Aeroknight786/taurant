import { NextFunction, Response, Router } from 'express';
import * as Content from '../controllers/content.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { operatorReadLimiter, operatorWriteLimiter } from '../middleware/rateLimiter';
import { requireVenueFeature } from '../middleware/venueFeature';
import { resolveVenueConfig, shouldUseVenueContent } from '../services/venueConfig.service';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';

const router = Router();

function requireVenueContentEnabled(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  try {
    const venue = req.venue;
    if (!venue) {
      throw new AppError('Venue context unavailable for this request', 400, 'VENUE_CONTEXT_REQUIRED');
    }

    if (!shouldUseVenueContent(resolveVenueConfig(venue))) {
      throw new AppError('Guest content is disabled for this venue', 403, 'VENUE_FEATURE_DISABLED');
    }

    next();
  } catch (error) {
    next(error);
  }
}

router.get('/admin/current', requireAuth, requireRole('OWNER', 'MANAGER'), requireVenueFeature('adminConsole'), requireVenueContentEnabled, operatorReadLimiter, Content.getAdminCurrent);
router.patch('/:slot', requireAuth, requireRole('OWNER', 'MANAGER'), requireVenueFeature('adminConsole'), requireVenueContentEnabled, operatorWriteLimiter, Content.patchContentBlock);

export default router;
