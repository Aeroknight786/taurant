import dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const defaultProdOrigins = 'https://app.flock.in,https://flock.in';
const port = parseInt(process.env.PORT ?? '3000', 10);
const defaultAppPublicUrl = nodeEnv === 'production' ? 'https://app.flock.in' : `http://localhost:${port}`;

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export const env = {
  NODE_ENV:   optional('NODE_ENV', nodeEnv),
  PORT:       port,
  API_VERSION: optional('API_VERSION', 'v1'),
  APP_PUBLIC_URL: optional('APP_PUBLIC_URL', defaultAppPublicUrl),
  APP_ALLOWED_ORIGINS: optional('APP_ALLOWED_ORIGINS', nodeEnv === 'production' ? defaultProdOrigins : '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL:    optional('REDIS_URL'),

  JWT_SECRET:     required('JWT_SECRET'),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '7d'),
  GUEST_JWT_EXPIRES_IN: optional('GUEST_JWT_EXPIRES_IN', '6h'),
  ONBOARDING_TOKEN: optional('ONBOARDING_TOKEN'),
  OTP_EXPIRES_SECONDS: parseInt(optional('OTP_EXPIRES_SECONDS', '300'), 10),
  EXPOSE_MOCK_OTP_IN_API: optional('EXPOSE_MOCK_OTP_IN_API', 'true') === 'true',
  RATE_LIMIT_STRATEGY_VERSION: parseInt(optional('RATE_LIMIT_STRATEGY_VERSION', '2'), 10),
  RATE_LIMIT_OPERATOR_READ_MAX: parseInt(optional('RATE_LIMIT_OPERATOR_READ_MAX', '800'), 10),
  RATE_LIMIT_OPERATOR_WRITE_MAX: parseInt(optional('RATE_LIMIT_OPERATOR_WRITE_MAX', '240'), 10),
  RATE_LIMIT_GUEST_POLL_MAX: parseInt(optional('RATE_LIMIT_GUEST_POLL_MAX', '1500'), 10),
  RATE_LIMIT_OTP_SEND_MAX: parseInt(optional('RATE_LIMIT_OTP_SEND_MAX', '8'), 10),
  RATE_LIMIT_OTP_VERIFY_MAX: parseInt(optional('RATE_LIMIT_OTP_VERIFY_MAX', '12'), 10),

  RAZORPAY_KEY_ID:       optional('RAZORPAY_KEY_ID'),
  RAZORPAY_KEY_SECRET:   optional('RAZORPAY_KEY_SECRET'),
  RAZORPAY_WEBHOOK_SECRET: optional('RAZORPAY_WEBHOOK_SECRET'),

  GUPSHUP_API_KEY:       optional('GUPSHUP_API_KEY'),
  GUPSHUP_APP_NAME:      optional('GUPSHUP_APP_NAME', 'FlockApp'),
  GUPSHUP_SOURCE_NUMBER: optional('GUPSHUP_SOURCE_NUMBER'),
  GUPSHUP_TEMPLATE_QUEUE_JOIN_NAME: optional('GUPSHUP_TEMPLATE_QUEUE_JOIN_NAME', 'queue_join'),
  GUPSHUP_TEMPLATE_QUEUE_JOIN_ID: optional('GUPSHUP_TEMPLATE_QUEUE_JOIN_ID', 'b5362b76-8215-497d-889d-6e32d013fb8a'),
  GUPSHUP_TEMPLATE_TABLE_READY_NAME: optional('GUPSHUP_TEMPLATE_TABLE_READY_NAME', 'table_ready_v6'),
  GUPSHUP_TEMPLATE_TABLE_READY_ID: optional('GUPSHUP_TEMPLATE_TABLE_READY_ID', '9b5bd379-904c-4936-b7d8-1a08cfd02a74'),

  MSG91_AUTH_KEY:          optional('MSG91_AUTH_KEY'),
  MSG91_SENDER_ID:         optional('MSG91_SENDER_ID', 'FLOCK'),
  MSG91_TEMPLATE_ID_OTP:   optional('MSG91_TEMPLATE_ID_OTP'),
  MSG91_TEMPLATE_ID_QUEUE: optional('MSG91_TEMPLATE_ID_QUEUE'),
  MSG91_TEMPLATE_ID_TABLE_READY: optional('MSG91_TEMPLATE_ID_TABLE_READY'),

  IVR_PROVIDER:            optional('IVR_PROVIDER'),
  IVR_API_KEY:             optional('IVR_API_KEY'),
  IVR_API_SECRET:          optional('IVR_API_SECRET'),
  IVR_BASE_URL:            optional('IVR_BASE_URL'),
  IVR_CALLER_ID:           optional('IVR_CALLER_ID'),
  IVR_ENABLED_VENUE_SLUGS: optional('IVR_ENABLED_VENUE_SLUGS'),
  IVR_QUEUE_READY_REMINDER_ENABLED: optional('IVR_QUEUE_READY_REMINDER_ENABLED', 'false') === 'true',
  IVR_QUEUE_EXPIRED_ENABLED: optional('IVR_QUEUE_EXPIRED_ENABLED', 'false') === 'true',
  IVR_QUEUE_NO_SHOW_ENABLED: optional('IVR_QUEUE_NO_SHOW_ENABLED', 'false') === 'true',

  CLEARTAX_API_KEY:  optional('CLEARTAX_API_KEY'),
  CLEARTAX_BASE_URL: optional('CLEARTAX_BASE_URL', 'https://api.cleartax.in/v1'),

  URBANPIPER_USERNAME: optional('URBANPIPER_USERNAME'),
  URBANPIPER_API_KEY:  optional('URBANPIPER_API_KEY'),
  URBANPIPER_BASE_URL: optional('URBANPIPER_BASE_URL', 'https://api.urbanpiper.com/v1'),

  // Feature flags — default to mock in dev
  USE_MOCK_PAYMENTS:      optional('USE_MOCK_PAYMENTS', 'true') === 'true',
  USE_MOCK_NOTIFICATIONS: optional('USE_MOCK_NOTIFICATIONS', 'true') === 'true',
  USE_MOCK_AUTH_OTP_NOTIFICATIONS: optional('USE_MOCK_AUTH_OTP_NOTIFICATIONS', optional('USE_MOCK_NOTIFICATIONS', 'true')) === 'true',
  USE_MOCK_GST:           optional('USE_MOCK_GST', 'true') === 'true',
  USE_MOCK_POS:           optional('USE_MOCK_POS', 'true') === 'true',

  TMS_POLL_INTERVAL_MS:       parseInt(optional('TMS_POLL_INTERVAL_MS', '4000'), 10),
  TABLE_READY_WINDOW_MINUTES: parseInt(optional('TABLE_READY_WINDOW_MINUTES', '10'), 10),
  DISABLE_TMS_POLLER: optional('DISABLE_TMS_POLLER', 'false') === 'true',

  isProd: () => process.env.NODE_ENV === 'production',
  isDev:  () => process.env.NODE_ENV !== 'production',
  isTest: () => process.env.NODE_ENV === 'test',
};
