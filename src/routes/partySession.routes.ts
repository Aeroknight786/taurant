import { Router } from 'express';
import * as PartySession from '../controllers/partySession.controller';
import { requireGuestAuth } from '../middleware/auth';
import { guestMutationLimiter, guestPollReadLimiter, partyJoinLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/join/:joinToken', partyJoinLimiter, PartySession.joinPartySession);
router.get('/:sessionId/realtime', requireGuestAuth, guestPollReadLimiter, PartySession.getPartySessionRealtime);
router.get('/:sessionId', requireGuestAuth, guestPollReadLimiter, PartySession.getPartySessionSummary);
router.get('/:sessionId/participants', requireGuestAuth, guestPollReadLimiter, PartySession.getPartyParticipants);
router.get('/:sessionId/bucket', requireGuestAuth, guestPollReadLimiter, PartySession.getPartyBucket);
router.put('/:sessionId/bucket', requireGuestAuth, guestMutationLimiter, PartySession.updatePartyBucket);

export default router;
