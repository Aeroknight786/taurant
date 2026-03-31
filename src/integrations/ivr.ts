import { env } from '../config/env';
import { logger } from '../config/logger';

export interface SendIvrCallParams {
  venueId: string;
  venueSlug?: string | null;
  queueEntryId?: string;
  to: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export type QueueIvrMessageKind =
  | 'TABLE_READY'
  | 'QUEUE_READY_REMINDER'
  | 'QUEUE_EXPIRED'
  | 'QUEUE_NO_SHOW';

function buildMockRef(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

function parseEnabledVenues(raw: string | undefined): Set<string> {
  return new Set(
    (raw || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isIvrEnabledForVenueSlug(venueSlug?: string | null): boolean {
  if (!venueSlug) return false;
  return parseEnabledVenues(env.IVR_ENABLED_VENUE_SLUGS).has(venueSlug);
}

export function isQueueIvrMessageEnabled(kind: QueueIvrMessageKind): boolean {
  switch (kind) {
    case 'QUEUE_READY_REMINDER':
      return env.IVR_QUEUE_READY_REMINDER_ENABLED;
    case 'QUEUE_EXPIRED':
      return env.IVR_QUEUE_EXPIRED_ENABLED;
    case 'QUEUE_NO_SHOW':
      return env.IVR_QUEUE_NO_SHOW_ENABLED;
    case 'TABLE_READY':
    default:
      return true;
  }
}

export async function sendIvrCall(params: SendIvrCallParams): Promise<string> {
  if (env.USE_MOCK_NOTIFICATIONS) {
    logger.debug(`[MOCK IVR → ${params.to}]: ${params.message}`);
    return buildMockRef('mock_ivr');
  }

  if (!env.IVR_PROVIDER) {
    logger.warn('IVR provider not configured; skipping IVR dispatch', {
      venueId: params.venueId,
      queueEntryId: params.queueEntryId,
      to: params.to,
    });
    return buildMockRef('ivr_skipped');
  }

  const provider = env.IVR_PROVIDER.trim().toLowerCase();
  if (provider === 'mock') {
    logger.debug(`[MOCK IVR:${provider} → ${params.to}]: ${params.message}`);
    return buildMockRef('mock_ivr');
  }

  throw new Error(
    `IVR provider "${env.IVR_PROVIDER}" is not wired yet. Configure src/integrations/ivr.ts before enabling it.`,
  );
}

async function sendQueueStatusIvr(kind: QueueIvrMessageKind, params: SendIvrCallParams): Promise<string> {
  if (!params.venueSlug || !isIvrEnabledForVenueSlug(params.venueSlug)) {
    logger.debug('IVR skipped because venue is not allowlisted', {
      venueId: params.venueId,
      venueSlug: params.venueSlug,
      queueEntryId: params.queueEntryId,
      to: params.to,
      kind,
    });
    return buildMockRef(`ivr_skipped_${kind.toLowerCase()}`);
  }

  if (!isQueueIvrMessageEnabled(kind)) {
    logger.warn('IVR queue message type disabled', {
      venueId: params.venueId,
      venueSlug: params.venueSlug,
      queueEntryId: params.queueEntryId,
      to: params.to,
      kind,
    });
    return buildMockRef(`ivr_disabled_${kind.toLowerCase()}`);
  }

  return sendIvrCall({
    ...params,
    metadata: {
      ...(params.metadata || {}),
      venueSlug: params.venueSlug,
      queueMessageKind: kind,
      channel: 'IVR',
    },
  });
}

export function sendIvrQueueTableReady(params: SendIvrCallParams): Promise<string> {
  return sendQueueStatusIvr('TABLE_READY', params);
}

export function sendIvrQueueReadyReminder(params: SendIvrCallParams): Promise<string> {
  return sendQueueStatusIvr('QUEUE_READY_REMINDER', params);
}

export function sendIvrQueueExpired(params: SendIvrCallParams): Promise<string> {
  return sendQueueStatusIvr('QUEUE_EXPIRED', params);
}

export function sendIvrQueueNoShow(params: SendIvrCallParams): Promise<string> {
  return sendQueueStatusIvr('QUEUE_NO_SHOW', params);
}
