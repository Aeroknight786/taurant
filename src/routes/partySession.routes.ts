import { Router } from 'express';
import * as PartySession from '../controllers/partySession.controller';
import { requireGuestAuth } from '../middleware/auth';
import { guestMutationLimiter, guestPollReadLimiter, partyJoinLimiter } from '../middleware/rateLimiter';
import { requireVenueFeature, resolveVenueIdFromPartyJoinToken } from '../middleware/venueFeature';

const router = Router();

router.post('/join/:joinToken', partyJoinLimiter, requireVenueFeature('partyShare', resolveVenueIdFromPartyJoinToken()), PartySession.joinPartySession);
router.get('/:sessionId/realtime', requireGuestAuth, requireVenueFeature('partyShare'), guestPollReadLimiter, PartySession.getPartySessionRealtime);
router.get('/:sessionId', requireGuestAuth, requireVenueFeature('partyShare'), guestPollReadLimiter, PartySession.getPartySessionSummary);
router.get('/:sessionId/participants', requireGuestAuth, requireVenueFeature('partyShare'), guestPollReadLimiter, PartySession.getPartyParticipants);
router.get('/:sessionId/bucket', requireGuestAuth, requireVenueFeature('partyShare'), guestPollReadLimiter, PartySession.getPartyBucket);
router.put('/:sessionId/bucket', requireGuestAuth, requireVenueFeature('partyShare'), guestMutationLimiter, PartySession.updatePartyBucket);

export default router;
