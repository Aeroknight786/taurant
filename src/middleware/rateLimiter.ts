import rateLimit from 'express-rate-limit';

// General API rate limit
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
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
