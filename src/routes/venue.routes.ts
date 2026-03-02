import { Router } from 'express';
import * as Venue from '../controllers/venue.controller';
import { requireAuth, requireRole } from '../middleware/auth';
const router = Router();
router.post ('/',            Venue.createVenue);        // onboarding — no auth required
router.get  ('/:slug',       Venue.getVenueBySlug);     // guest-facing — no auth
router.patch('/config',      requireAuth, requireRole('OWNER', 'MANAGER'), Venue.updateVenueConfig);
router.get  ('/stats/today', requireAuth, Venue.getVenueStats);
export default router;
