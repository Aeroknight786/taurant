import { Router } from 'express';
import * as Queue from '../controllers/queue.controller';
import * as GuestAccess from '../controllers/guestAccessLink.controller';
import { requireAuth, requireGuestAuth, requireGuestMutationAccess, requireRole } from '../middleware/auth';
import { guestMutationLimiter, guestPollReadLimiter, operatorReadLimiter, operatorWriteLimiter, otpVerifyLimiter } from '../middleware/rateLimiter';
import { requireVenueFeature, resolveVenueIdFromQueueEntryParam } from '../middleware/venueFeature';
const router = Router();

const resolveQueueEntryVenue = resolveVenueIdFromQueueEntryParam();
const requireGuestQueueAccess = requireVenueFeature('guestAccess');
const requireGuestQueueEntryAccess = requireVenueFeature('guestAccess', resolveQueueEntryVenue);

router.post('/',                     guestMutationLimiter, requireVenueFeature('guestQueue'), requireGuestQueueAccess, Queue.joinQueue); // guest — rate limited, no auth
router.get ('/live',                 requireAuth, requireVenueFeature('guestQueue'), operatorReadLimiter, Queue.getVenueQueue);
router.get ('/live-snapshot',        requireAuth, requireVenueFeature('guestQueue'), operatorReadLimiter, Queue.getVenueQueueSnapshot);
router.post('/:entryId/session',     otpVerifyLimiter, requireVenueFeature('guestQueue', resolveQueueEntryVenue), requireGuestQueueEntryAccess, Queue.reissueGuestSession);
router.get ('/:entryId/status',      requireGuestAuth, requireVenueFeature('guestQueue'), requireGuestQueueAccess, guestPollReadLimiter, Queue.getQueueEntryStatus);
router.get ('/:entryId',             requireGuestAuth, requireVenueFeature('guestQueue'), requireGuestQueueAccess, guestPollReadLimiter, Queue.getQueueEntry);
router.post('/:entryId/access-link/redeem', guestMutationLimiter, requireVenueFeature('guestQueue', resolveQueueEntryVenue), requireGuestQueueEntryAccess, GuestAccess.redeemAccessLink);
router.delete('/:entryId/leave',     guestMutationLimiter, requireGuestAuth, requireGuestMutationAccess, requireVenueFeature('guestQueue'), requireGuestQueueAccess, Queue.leaveEntry);
router.post('/:entryId/notify',      requireAuth, requireRole('OWNER','MANAGER','STAFF'), requireVenueFeature('guestQueue'), operatorWriteLimiter, Queue.notifyEntry);
router.post('/:entryId/nudge',       requireAuth, requireRole('OWNER','MANAGER','STAFF'), requireVenueFeature('guestQueue'), operatorWriteLimiter, Queue.nudgeEntry);
router.post('/:entryId/no-show',     requireAuth, requireRole('OWNER','MANAGER','STAFF'), requireVenueFeature('guestQueue'), operatorWriteLimiter, Queue.markNoShowEntry);
router.post('/:entryId/reorder',     requireAuth, requireRole('OWNER','MANAGER','STAFF'), requireVenueFeature('guestQueue'), operatorWriteLimiter, Queue.reorderEntry);
router.post('/:entryId/prioritize',  requireAuth, requireRole('OWNER','MANAGER','STAFF'), requireVenueFeature('guestQueue'), operatorWriteLimiter, Queue.prioritizeEntry);
router.post('/clear-active',         requireAuth, requireRole('OWNER','MANAGER','STAFF'), requireVenueFeature('guestQueue'), operatorWriteLimiter, Queue.clearActiveEntries);
router.post('/seat',                 requireAuth, requireVenueFeature('guestQueue'), operatorWriteLimiter, Queue.seatGuest);
router.delete('/:entryId',           requireAuth, requireRole('OWNER','MANAGER','STAFF'), requireVenueFeature('guestQueue'), operatorWriteLimiter, Queue.cancelEntry);
router.post  ('/:entryId/checkout',  requireAuth, requireRole('OWNER','MANAGER','STAFF'), requireVenueFeature('guestQueue'), operatorWriteLimiter, Queue.checkoutEntry);
router.get   ('/history/recent',     requireAuth, requireRole('OWNER','MANAGER','STAFF'), requireVenueFeature('historyTab'), operatorReadLimiter, Queue.getRecentHistory);
router.post  ('/clear-all',          requireAuth, requireRole('OWNER','MANAGER'), requireVenueFeature('bulkClear'), operatorWriteLimiter, Queue.clearAllEntries);
router.get   ('/:entryId/activity',  requireAuth, requireRole('OWNER','MANAGER','STAFF'), requireVenueFeature('staffConsole'), operatorReadLimiter, Queue.getEntryActivityEvents);
router.get   ('/:entryId/flow',      requireAuth, requireRole('OWNER','MANAGER'), requireVenueFeature('flowLog'), operatorReadLimiter, Queue.getEntryFlowEvents);
export default router;
