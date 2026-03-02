import { Router } from 'express';
import * as Auth from '../controllers/auth.controller';
const router = Router();
router.post('/guest/otp/send',   Auth.sendGuestOtp);
router.post('/staff/otp/send',   Auth.sendStaffOtp);
router.post('/staff/otp/verify', Auth.verifyStaffOtp);
export default router;
