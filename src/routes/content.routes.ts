import { Router } from 'express';
import * as Content from '../controllers/content.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { operatorReadLimiter, operatorWriteLimiter } from '../middleware/rateLimiter';
import { requireVenueFeature } from '../middleware/venueFeature';

const router = Router();

router.get('/admin/current', requireAuth, requireRole('OWNER', 'MANAGER'), requireVenueFeature('adminConsole'), operatorReadLimiter, Content.getAdminCurrent);
router.patch('/:slot', requireAuth, requireRole('OWNER', 'MANAGER'), requireVenueFeature('adminConsole'), operatorWriteLimiter, Content.patchContentBlock);

export default router;
