import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { logger } from './config/logger';
import router from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiSafetyLimiter, legacyApiLimiter, publicVenueReadLimiter } from './middleware/rateLimiter';
import { incrementCounter } from './config/metrics';

const app = express();

// ── Security ──────────────────────────────────────────────────────
if (env.isProd()) {
  // Render and similar hosts sit behind one trusted proxy hop.
  app.set('trust proxy', 1);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'data:', 'https:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      connectSrc: [
        "'self'",
        'https://api.razorpay.com',
        'https://checkout.razorpay.com',
        'https://lumberjack.razorpay.com',
      ],
      frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
    },
  },
}));
app.use(cors({
  origin:      env.isProd() ? env.APP_ALLOWED_ORIGINS : true,
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────
if (env.isProd()) {
  app.use(`/api/${env.API_VERSION}`, publicVenueReadLimiter);
  if (env.RATE_LIMIT_STRATEGY_VERSION >= 2) {
    app.use(`/api/${env.API_VERSION}`, apiSafetyLimiter);
  } else {
    app.use(`/api/${env.API_VERSION}`, legacyApiLimiter);
  }
}

// ── Lightweight HTTP counters ─────────────────────────────────────
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 500) {
      incrementCounter('http_5xx_total', {
        route: req.path,
        method: req.method,
        status: String(res.statusCode),
      });
      logger.warn('http_5xx_observed', {
        route: req.path,
        method: req.method,
        statusCode: res.statusCode,
      });
    }
  });
  next();
});

// ── Parsing ───────────────────────────────────────────────────────
// Raw body for Razorpay webhook signature verification
app.use(`/api/${env.API_VERSION}/payments/webhook/razorpay`, express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────────────
app.use(morgan(env.isProd() ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ── Routes ────────────────────────────────────────────────────────
app.use(`/api/${env.API_VERSION}`, router);

// ── Static web app ────────────────────────────────────────────────
const webDir = path.join(process.cwd(), 'web');
if (fs.existsSync(webDir)) {
  app.use(express.static(webDir));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(webDir, 'index.html'));
  });
}

// ── Error handlers ────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
