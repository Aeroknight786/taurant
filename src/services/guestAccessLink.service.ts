import crypto from 'crypto';
import { GuestAccessLinkChannel, GuestAccessLinkMessageKind, QueueEntryStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { GuestAccessMode } from '../types';
import { signGuestToken } from '../utils/jwt';

type QueueEntryAccessShape = {
  status: QueueEntryStatus;
  completedAt: Date | null;
  updatedAt: Date;
};

const READ_ONLY_SESSION_SECONDS = 60 * 60 * 24;
const READ_ONLY_SESSION_WINDOW_MS = READ_ONLY_SESSION_SECONDS * 1000;

function hashOpaqueToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('base64url');
}

function createOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function getClosedAt(entry: QueueEntryAccessShape): Date {
  if (entry.status === QueueEntryStatus.COMPLETED) {
    return entry.completedAt ?? entry.updatedAt;
  }

  return entry.updatedAt;
}

export function resolveGuestAccessModeFromQueueEntry(entry: QueueEntryAccessShape): GuestAccessMode | null {
  switch (entry.status) {
    case QueueEntryStatus.WAITING:
    case QueueEntryStatus.NOTIFIED:
    case QueueEntryStatus.SEATED:
      return 'ACTIVE';
    case QueueEntryStatus.COMPLETED:
    case QueueEntryStatus.CANCELLED:
    case QueueEntryStatus.NO_SHOW: {
      const closedAt = getClosedAt(entry);
      return (Date.now() - closedAt.getTime()) <= READ_ONLY_SESSION_WINDOW_MS ? 'READ_ONLY' : null;
    }
    default:
      return null;
  }
}

export function assertGuestSessionCanMutate(entry: QueueEntryAccessShape): void {
  const accessMode = resolveGuestAccessModeFromQueueEntry(entry);
  if (accessMode !== 'ACTIVE') {
    throw new AppError('Guest session is read-only', 403, 'GUEST_SESSION_READ_ONLY');
  }
}

export function getGuestReadOnlySessionExpiresInSeconds(entry: QueueEntryAccessShape): number | null {
  const accessMode = resolveGuestAccessModeFromQueueEntry(entry);
  if (accessMode !== 'READ_ONLY') {
    return null;
  }

  const remainingMs = (getClosedAt(entry).getTime() + READ_ONLY_SESSION_WINDOW_MS) - Date.now();
  return remainingMs > 0 ? Math.max(1, Math.floor(remainingMs / 1000)) : null;
}

function buildGuestStatusLink(venueSlug: string, queueEntryId: string, token: string): string {
  const baseUrl = env.APP_PUBLIC_URL.replace(/\/+$/, '');
  return `${baseUrl}/v/${encodeURIComponent(venueSlug)}/e/${encodeURIComponent(queueEntryId)}?access=${encodeURIComponent(token)}`;
}

export async function issueQueueAccessLink(params: {
  venueId: string;
  queueEntryId: string;
  venueSlug?: string;
  channel?: GuestAccessLinkChannel;
  messageKind: GuestAccessLinkMessageKind;
}): Promise<{ token: string; tokenHash: string; issuedAt: Date; statusLink: string }> {
  const entry = await prisma.queueEntry.findFirst({
    where: { id: params.queueEntryId, venueId: params.venueId },
    select: {
      id: true,
      venueId: true,
      venue: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!entry) {
    throw new AppError('Queue entry not found', 404);
  }

  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const issuedAt = new Date();
  const venueSlug = params.venueSlug ?? entry.venue?.slug;

  if (!venueSlug) {
    throw new AppError('Venue slug unavailable for guest access link', 500, 'VENUE_SLUG_UNAVAILABLE');
  }

  await prisma.guestAccessLink.create({
    data: {
      queueEntryId: params.queueEntryId,
      venueId: params.venueId,
      tokenHash,
      channel: params.channel ?? GuestAccessLinkChannel.WHATSAPP,
      messageKind: params.messageKind,
      issuedAt,
    },
  });

  return {
    token,
    tokenHash,
    issuedAt,
    statusLink: buildGuestStatusLink(venueSlug, params.queueEntryId, token),
  };
}

export async function redeemQueueAccessLink(params: {
  queueEntryId: string;
  token: string;
}): Promise<{
  queueEntryId: string;
  venueId: string;
  accessMode: GuestAccessMode;
  guestToken: string;
  queueEntryStatus: QueueEntryStatus;
}> {
  const tokenHash = hashOpaqueToken(params.token);
  const link = await prisma.guestAccessLink.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      queueEntryId: true,
      venueId: true,
      invalidatedAt: true,
      queueEntry: {
        select: {
          id: true,
          venueId: true,
          guestPhone: true,
          status: true,
          completedAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!link || link.invalidatedAt || link.queueEntryId !== params.queueEntryId) {
    throw new AppError('Access link is invalid or expired', 404, 'ACCESS_LINK_INVALID');
  }

  const entry = link.queueEntry;

  if (!entry) {
    throw new AppError('Queue entry not found', 404);
  }

  const accessMode = resolveGuestAccessModeFromQueueEntry(entry);
  if (!accessMode) {
    throw new AppError('Guest session is no longer available', 410, 'GUEST_SESSION_EXPIRED');
  }

  await prisma.guestAccessLink.update({
    where: { id: link.id },
    data: { lastUsedAt: new Date() },
  });

  const expiresIn = getGuestReadOnlySessionExpiresInSeconds(entry) ?? undefined;

  return {
    queueEntryId: entry.id,
    venueId: entry.venueId,
    accessMode,
    guestToken: signGuestToken({
      kind: 'guest',
      queueEntryId: entry.id,
      venueId: entry.venueId,
      guestPhone: entry.guestPhone,
    }, expiresIn ? { expiresIn } : {}),
    queueEntryStatus: entry.status,
  };
}
