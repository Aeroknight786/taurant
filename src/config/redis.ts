import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

type RedisLike = {
  status: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  quit: () => Promise<unknown>;
  on: (event: string, listener: (...args: unknown[]) => void) => RedisLike;
  set: (...args: unknown[]) => Promise<unknown>;
  publish: (...args: unknown[]) => Promise<number>;
  del: (...args: unknown[]) => Promise<number>;
};

function createDisabledRedis(): RedisLike {
  const disabled: RedisLike = {
    status: 'disabled',
    async connect() { return; },
    disconnect() { return; },
    async quit() { return 'OK'; },
    on() { return disabled; },
    async set() { return 'OK'; },
    async publish() { return 0; },
    async del() { return 0; },
  };
  return disabled;
}

export const redis = (env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 100, 3000);
      },
      enableOfflineQueue: false,
      lazyConnect: true,
    })
  : createDisabledRedis()) as unknown as RedisLike;

if (env.REDIS_URL) {
  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('ready',   () => logger.info('Redis ready'));
  redis.on('error',   (err) => logger.error('Redis error', { err: String(err) }));
  redis.on('close',   () => logger.warn('Redis connection closed'));
} else {
  logger.warn('REDIS_URL not configured, continuing without cache/pubsub');
}

// ── Queue state keys ──────────────────────────────────
export const RedisKeys = {
  venueQueue:    (venueId: string) => `flock:queue:${venueId}`,
  tableStatus:   (tableId: string) => `flock:table:${tableId}`,
  queueEntry:    (entryId: string) => `flock:entry:${entryId}`,
  otpCode:       (phone: string, purpose: string) => `flock:otp:${phone}:${purpose}`,
  sessionToken:  (staffId: string) => `flock:session:${staffId}`,
  rateLimit:     (ip: string) => `flock:rate:${ip}`,
};

// ── Pub/Sub channels ──────────────────────────────────
export const PubSubChannels = {
  tableUpdate:  (venueId: string) => `flock:tables:${venueId}`,
  queueUpdate:  (venueId: string) => `flock:queue-update:${venueId}`,
  entryUpdate:  (entryId: string) => `flock:entry-update:${entryId}`,
};

export function isRedisReady(): boolean {
  return redis.status === 'ready';
}

export async function connectRedis(): Promise<boolean> {
  if (!env.REDIS_URL) {
    return false;
  }

  try {
    await redis.connect();
    return true;
  } catch (err) {
    logger.warn('Redis unavailable, continuing without cache/pubsub', { err: String(err) });
    redis.disconnect();
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (!env.REDIS_URL) {
    return;
  }

  if (redis.status !== 'ready' && redis.status !== 'connect') {
    redis.disconnect();
    return;
  }

  try {
    await redis.quit();
  } catch (err) {
    logger.warn('Redis quit failed, forcing disconnect', { err: String(err) });
    redis.disconnect();
  }
}
