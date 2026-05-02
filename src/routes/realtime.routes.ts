import { Router } from 'express';
import * as Realtime from '../controllers/realtime.controller';

const router = Router();

router.get('/guest/:entryId', Realtime.streamGuestEntry);
router.get('/staff/queue', Realtime.streamStaffQueue);

export default router;
