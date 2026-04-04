import { Router } from 'express';
import * as Payment from '../controllers/payment.controller';
import { requireAuth, requireGuestAuth, requireGuestMutationAccess, requireRole } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimiter';
import { requireVenueFeature } from '../middleware/venueFeature';
const router = Router();
// Guest flows
router.post('/deposit/initiate',        requireGuestAuth, requireGuestMutationAccess, requireVenueFeature('preOrder'), paymentLimiter, Payment.initiateDeposit);
router.post('/deposit/capture',         paymentLimiter, Payment.captureDeposit);
router.post('/final/initiate',          requireGuestAuth, requireGuestMutationAccess, requireVenueFeature('finalPayment'), paymentLimiter, Payment.initiateFinalPayment);
router.post('/final/capture',           paymentLimiter, Payment.captureFinalPayment);
router.post('/final/settle-offline',    requireAuth, requireRole('OWNER','MANAGER','STAFF'), requireVenueFeature('offlineSettle'), paymentLimiter, Payment.settleFinalOffline);
// Staff flows
router.post('/refund',                  requireAuth, requireRole('OWNER','MANAGER'), requireVenueFeature('refunds'), paymentLimiter, Payment.refundDeposit);
// Razorpay webhook — no auth, signature verified inside handler
router.post('/webhook/razorpay',        Payment.razorpayWebhook);
export default router;
