import rateLimit from 'express-rate-limit';

function isPublicVenueRead(path: string, method: string): boolean {
  return method === 'GET' && /^\/venues\/[^/]+$/.test(path);
}

// General API rate limit
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  skip: (req) => isPublicVenueRead(req.path, req.method),
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public guest bootstrap reads need a looser limit than authenticated ops endpoints.
export const publicVenueReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many venue requests, please try again shortly' } },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isPublicVenueRead(req.path, req.method),
});

// Strict limit for OTP endpoints (prevent brute force)
export const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many OTP requests, please wait 1 minute' } },
  skipSuccessfulRequests: false,
});

// Payment endpoints
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many payment requests' } },
});
