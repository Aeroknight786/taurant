import { Router } from 'express';
import * as Auth from '../controllers/auth.controller';
import { otpSendLimiter, otpVerifyLimiter } from '../middleware/rateLimiter';
const router = Router();
router.post('/guest/otp/send',   otpSendLimiter, Auth.sendGuestOtp);
router.post('/staff/otp/send',   otpSendLimiter, Auth.sendStaffOtp);
router.post('/staff/otp/verify', otpVerifyLimiter, Auth.verifyStaffOtp);
export default router;
