import { Router } from 'express';
import * as Order from '../controllers/order.controller';
import { requireAuth, requireGuestAuth } from '../middleware/auth';
const router = Router();
router.post('/preorder',     Order.createPreOrder);       // guest — no auth required
router.post('/table/guest',  requireGuestAuth, Order.createGuestTableOrder);
router.post('/table',        requireAuth, Order.createTableOrder);
router.get ('/bill/:queueEntryId', Order.getGuestBill);   // guest polls this
export default router;
