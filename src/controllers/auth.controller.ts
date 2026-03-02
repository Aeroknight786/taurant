import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as AuthService from '../services/auth.service';
import { ok, created } from '../utils/response';

const SendOtpSchema   = z.object({ phone: z.string().regex(/^[6-9]\d{9}$/), venueId: z.string().min(1) });
const VerifyOtpSchema = z.object({ phone: z.string(), code: z.string().length(6), venueId: z.string().min(1) });

export async function sendGuestOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone, venueId } = SendOtpSchema.parse(req.body);
    await AuthService.sendGuestOtp(phone, venueId);
    ok(res, { message: 'OTP sent' });
  } catch (e) { next(e); }
}

export async function sendStaffOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone, venueId } = SendOtpSchema.parse(req.body);
    await AuthService.sendStaffOtp(phone, venueId);
    ok(res, { message: 'OTP sent' });
  } catch (e) { next(e); }
}

export async function verifyStaffOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { phone, code, venueId } = VerifyOtpSchema.parse(req.body);
    const result = await AuthService.verifyStaffOtp(phone, code, venueId);
    ok(res, result);
  } catch (e) { next(e); }
}
