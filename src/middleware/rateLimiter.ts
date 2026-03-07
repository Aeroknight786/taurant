import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { incrementCounter } from '../config/metrics';
import { AuthenticatedRequest } from '../types';

export type RateLimitBucketType =
  | 'legacy_api'
  | 'api_safety'
  | 'public_venue_read'
  | 'guest_poll_read'
  | 'guest_mutation'
  | 'operator_read'
  | 'operator_write'
  | 'otp_send'
  | 'otp_verify'
  | 'party_join'
  | 'payment';

function isPublicVenueRead(path: string, method: string): boolean {
  return method === 'GET' && /^\/venues\/[^/]+$/.test(path);
}

function extractPhone(req: Request): string {
  const raw = (req.body && typeof req.body.phone === 'string') ? req.body.phone : '';
  return raw.replace(/\D/g, '').slice(-10);
}

function resolveActorKey(req: Request): string {
  const authReq = req as AuthenticatedRequest;

  if (authReq.staff) {
    return `staff:${authReq.staff.id}:${authReq.staff.venueId}`;
  }

  if (authReq.guest) {
    return `guest:${authReq.guest.queueEntryId}:${authReq.guest.venueId}`;
  }

  const phone = extractPhone(req);
  if (phone) {
    return `phone:${phone}`;
  }

  return `ip:${req.ip}`;
}

function bucketMessage(message: string) {
  return { success: false, error: { code: 'RATE_LIMITED', message } };
}

function createLimiter(params: {
  bucket: RateLimitBucketType;
  windowMs: number;
  max: number;
  message: string;
  skip?: (req: Request) => boolean;
}) {
  return rateLimit({
    windowMs: params.windowMs,
    max: params.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: params.skip,
    keyGenerator: (req) => `${params.bucket}:${resolveActorKey(req)}`,
    message: bucketMessage(params.message),
    handler: (req: Request, res: Response) => {
      incrementCounter('http_429_total', {
        bucket: params.bucket,
        route: req.path,
        method: req.method,
      });
      logger.warn('rate_limit_exceeded', {
        bucket: params.bucket,
        route: req.path,
        method: req.method,
        actor: resolveActorKey(req),
      });
      res.status(429).json(bucketMessage(params.message));
    },
  });
}

// Kept for rollback safety when RATE_LIMIT_STRATEGY_VERSION=1.
export const legacyApiLimiter = createLimiter({
  bucket: 'legacy_api',
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests, please try again later',
  skip: (req) => isPublicVenueRead(req.path, req.method),
});

// Global safety net in v2 so unknown paths are still bounded without starving core routes.
export const apiSafetyLimiter = createLimiter({
  bucket: 'api_safety',
  windowMs: 15 * 60 * 1000,
  max: 4000,
  message: 'Too many requests, please try again later',
});

export const publicVenueReadLimiter = createLimiter({
  bucket: 'public_venue_read',
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: 'Too many venue requests, please retry shortly',
  skip: (req) => !isPublicVenueRead(req.path, req.method),
});

export const guestPollReadLimiter = createLimiter({
  bucket: 'guest_poll_read',
  windowMs: 15 * 60 * 1000,
  max: env.RATE_LIMIT_GUEST_POLL_MAX,
  message: 'Too many live updates. Please retry in a few seconds',
});

export const guestMutationLimiter = createLimiter({
  bucket: 'guest_mutation',
  windowMs: 15 * 60 * 1000,
  max: Math.max(120, Math.floor(env.RATE_LIMIT_GUEST_POLL_MAX / 4)),
  message: 'Too many guest actions. Please retry shortly',
});

export const operatorReadLimiter = createLimiter({
  bucket: 'operator_read',
  windowMs: 15 * 60 * 1000,
  max: env.RATE_LIMIT_OPERATOR_READ_MAX,
  message: 'Operator reads are temporarily throttled. Please retry shortly',
});

export const operatorWriteLimiter = createLimiter({
  bucket: 'operator_write',
  windowMs: 15 * 60 * 1000,
  max: env.RATE_LIMIT_OPERATOR_WRITE_MAX,
  message: 'Too many operator actions. Please retry shortly',
});

export const otpSendLimiter = createLimiter({
  bucket: 'otp_send',
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_OTP_SEND_MAX,
  message: 'Too many OTP send requests. Please wait 1 minute',
});

export const otpVerifyLimiter = createLimiter({
  bucket: 'otp_verify',
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_OTP_VERIFY_MAX,
  message: 'Too many OTP verification attempts. Please wait 30 seconds and retry',
});

export const partyJoinLimiter = createLimiter({
  bucket: 'party_join',
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many invite join attempts. Please retry shortly',
});

export const paymentLimiter = createLimiter({
  bucket: 'payment',
  windowMs: 60 * 1000,
  max: 12,
  message: 'Too many payment requests',
});

