import { NextFunction, Response, Router } from 'express';
import * as Table from '../controllers/table.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { operatorReadLimiter, operatorWriteLimiter } from '../middleware/rateLimiter';
import { requireVenueFeature } from '../middleware/venueFeature';
import { AppError } from '../middleware/errorHandler';
import { resolveVenueConfig } from '../services/venueConfig.service';
import { AuthenticatedRequest } from '../types';
const router = Router();

function requireTableSourceEnabled(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  try {
    const venue = req.venue;
    if (!venue) {
      throw new AppError('Venue context unavailable for this request', 400, 'VENUE_CONTEXT_REQUIRED');
    }

    const venueConfig = resolveVenueConfig(venue);
    if (venueConfig.opsConfig.tableSourceMode === 'DISABLED') {
      throw new AppError('Table management is disabled for this venue', 403, 'VENUE_FEATURE_DISABLED');
    }

    next();
  } catch (error) {
    next(error);
  }
}

router.get  ('/',                  requireAuth, requireVenueFeature('staffConsole'), requireTableSourceEnabled, operatorReadLimiter, Table.getTables);
router.post ('/',                  requireAuth, requireRole('OWNER','MANAGER'), requireVenueFeature('staffConsole'), requireTableSourceEnabled, operatorWriteLimiter, Table.createTable);
router.get  ('/events/recent',     requireAuth, requireVenueFeature('staffConsole'), requireTableSourceEnabled, operatorReadLimiter, Table.getRecentTableEvents);
router.patch('/:tableId/status',   requireAuth, requireVenueFeature('staffConsole'), requireTableSourceEnabled, operatorWriteLimiter, Table.updateTableStatus);
router.get  ('/:tableId/events',   requireAuth, requireVenueFeature('staffConsole'), requireTableSourceEnabled, operatorReadLimiter, Table.getTableEvents);
router.post ('/reset-all',         requireAuth, requireRole('OWNER','MANAGER'), requireVenueFeature('staffConsole'), requireTableSourceEnabled, operatorWriteLimiter, Table.resetAllTables);
export default router;
