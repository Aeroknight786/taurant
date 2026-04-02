import { prisma } from '../config/database';
import { redis, PubSubChannels } from '../config/redis';
import { Notify } from '../integrations/notifications';
import { AppError } from '../middleware/errorHandler';
import { NotificationStatus, NotificationType, QueueEntryStatus, TableStatus } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { logFlowEvent, OrderFlowEventType } from './orderFlowEvent.service';
import { isManualQueueDispatchConfig, resolveVenueConfig, shouldUseVenueTables } from './venueConfig.service';

// ── Get tables for venue ──────────────────────────────────────────

export async function getVenueTables(venueId: string) {
  return prisma.table.findMany({
    where: { venueId },
    orderBy: [{ section: 'asc' }, { label: 'asc' }],
    include: {
      _count: { select: { queueEntries: { where: { status: 'SEATED' } } } },
    },
  });
}

export async function getRecentVenueTableEvents(venueId: string) {
  const events = await prisma.tableEvent.findMany({
    where: { table: { venueId } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      table: {
        select: { id: true, label: true },
      },
    },
  });

  return events.map((event) => ({
    id: event.id,
    tableId: event.tableId,
    tableLabel: event.table.label,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    triggeredBy: event.triggeredBy,
    note: event.note,
    createdAt: event.createdAt,
  }));
}

// ── Update table status (manual floor management) ─────────────────

export async function updateTableStatus(params: {
  tableId:    string;
  venueId:    string;
  status:     TableStatus;
  triggeredBy?: string;
}) {
  const table = await prisma.table.findFirst({ where: { id: params.tableId, venueId: params.venueId } });
  if (!table) throw new AppError('Table not found', 404);

  const oldStatus = table.status;
  const venue = await prisma.venue.findUnique({
    where: { id: params.venueId },
    select: {
      id: true,
      name: true,
      slug: true,
      tableReadyWindowMin: true,
      brandConfig: true,
      featureConfig: true,
      uiConfig: true,
      opsConfig: true,
    },
  });
  const venueConfig = venue ? resolveVenueConfig(venue) : null;
  if (venueConfig && !shouldUseVenueTables(venueConfig)) {
    throw new AppError('Table management is disabled for this venue', 403, 'VENUE_FEATURE_DISABLED');
  }
  const manualDispatch = venueConfig ? isManualQueueDispatchConfig(venueConfig) : false;
  const shouldCompleteQueuedGuests = params.status === TableStatus.CLEARING || (params.status === TableStatus.FREE && !manualDispatch);

  await prisma.$transaction(async (tx) => {
    await tx.table.update({
      where: { id: params.tableId },
      data: {
        status: params.status,
        occupiedSince:   params.status === TableStatus.OCCUPIED ? new Date() : null,
        estimatedFreeAt: null,
      },
    });
    await tx.tableEvent.create({
      data: { tableId: params.tableId, fromStatus: oldStatus, toStatus: params.status, triggeredBy: params.triggeredBy ?? 'STAFF' },
    });

    // When a table is clearing/freeing, close out any seated entries bound to it.
    if (shouldCompleteQueuedGuests) {
      await tx.queueEntry.updateMany({
        where: { tableId: params.tableId, status: QueueEntryStatus.SEATED },
        data:  { status: QueueEntryStatus.COMPLETED, completedAt: new Date(), tableReadyDeadlineAt: null },
      });
    }
  });

  await redis.publish(PubSubChannels.tableUpdate(params.venueId), JSON.stringify({
    type: 'TABLE_STATUS_CHANGED', tableId: params.tableId, from: oldStatus, to: params.status,
  }));

  if (shouldCompleteQueuedGuests) {
    await recompactQueuePositions(params.venueId);
  }

  // If table just became free, try to advance queue for non-manual venues only.
  if (params.status === TableStatus.FREE) {
    await tryAdvanceQueue(params.venueId, params.tableId);
  }
}

// ── Bulk reset ───────────────────────────────────────────────────

export async function resetAllTables(venueId: string): Promise<{ reset: number }> {
  const nonFree = await prisma.table.findMany({
    where: { venueId, status: { not: TableStatus.FREE } },
    select: { id: true },
  });
  if (!nonFree.length) return { reset: 0 };

  await prisma.table.updateMany({
    where: { venueId },
    data: { status: TableStatus.FREE, occupiedSince: null, estimatedFreeAt: null },
  });

  return { reset: nonFree.length };
}

// ── Core auto-advance logic ───────────────────────────────────────

export async function tryAdvanceQueue(venueId: string, tableId: string): Promise<void> {
  const table = await prisma.table.findUnique({ where: { id: tableId } });
  if (!table || table.status !== TableStatus.FREE) return;
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      slug: true,
      tableReadyWindowMin: true,
      brandConfig: true,
      featureConfig: true,
      uiConfig: true,
      opsConfig: true,
    },
  });
  if (venue) {
    const venueConfig = resolveVenueConfig(venue);
    if (!shouldUseVenueTables(venueConfig)) {
      logger.debug(`Queue auto-advance skipped for tableless venue ${venueId}`);
      return;
    }
    if (isManualQueueDispatchConfig(venueConfig)) {
      logger.debug(`Queue auto-advance skipped for manual-dispatch venue ${venueId}`);
      return;
    }
  }
  const tableReadyWindowMin = venue?.tableReadyWindowMin ?? env.TABLE_READY_WINDOW_MINUTES;

  // Find the first waiting group that fits this table
  const nextEntry = await prisma.queueEntry.findFirst({
    where:   { venueId, status: QueueEntryStatus.WAITING, partySize: { lte: table.capacity } },
    orderBy: { position: 'asc' },
  });

  if (!nextEntry) {
    logger.debug(`Table ${table.label} is free but no matching waiting guests`);
    return;
  }

  // Mark as RESERVED to prevent race conditions
  await prisma.$transaction(async (tx) => {
    await tx.table.update({ where: { id: tableId }, data: { status: TableStatus.RESERVED } });
    await tx.queueEntry.update({
      where: { id: nextEntry.id },
      data: {
        status: QueueEntryStatus.NOTIFIED,
        notifiedAt: new Date(),
        tableId,
        tableReadyDeadlineAt: new Date(Date.now() + tableReadyWindowMin * 60 * 1000),
        tableReadyExpiredAt: null,
      },
    });
    await tx.tableEvent.create({
      data: { tableId, fromStatus: TableStatus.FREE, toStatus: TableStatus.RESERVED, triggeredBy: 'AUTO_ADVANCE' },
    });
  });

  if (venue) {
    await Notify.tableReady(venueId, nextEntry.id, nextEntry.guestPhone, nextEntry.guestName, table.label, venue.name, venue.tableReadyWindowMin);
  }

  await redis.publish(PubSubChannels.queueUpdate(venueId), JSON.stringify({
    type: 'TABLE_ASSIGNED', entryId: nextEntry.id, tableId, tableLabel: table.label,
  }));

  await logFlowEvent({
    queueEntryId: nextEntry.id,
    venueId,
    type: OrderFlowEventType.TABLE_NOTIFIED,
    snapshot: { tableId, tableLabel: table.label },
  });

  logger.info(`Table ${table.label} assigned to ${nextEntry.guestName} (${nextEntry.id})`);
}

export async function sweepExpiredTableReadyEntries(): Promise<void> {
  const expiredEntries = await prisma.queueEntry.findMany({
    where: {
      status: QueueEntryStatus.NOTIFIED,
      tableReadyDeadlineAt: { lte: new Date() },
    },
    include: {
      table: true,
    },
    orderBy: { tableReadyDeadlineAt: 'asc' },
  });

  for (const entry of expiredEntries) {
    logger.warn(`Guest ${entry.id} did not arrive within window — marking as NO_SHOW`);

    const releasedTableId = entry.table && entry.table.status === TableStatus.RESERVED ? entry.table.id : null;
    const venue = await prisma.venue.findUnique({
      where: { id: entry.venueId },
      select: {
        id: true,
        name: true,
        slug: true,
        brandConfig: true,
        featureConfig: true,
        uiConfig: true,
        opsConfig: true,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.queueEntry.update({
        where: { id: entry.id },
        data: {
          status: QueueEntryStatus.NO_SHOW,
          tableId: null,
          tableReadyExpiredAt: new Date(),
          tableReadyDeadlineAt: null,
        },
      });

      if (releasedTableId && entry.table) {
        await tx.table.update({
          where: { id: releasedTableId },
          data: { status: TableStatus.FREE },
        });
        await tx.tableEvent.create({
          data: {
            tableId: releasedTableId,
            fromStatus: TableStatus.RESERVED,
            toStatus: TableStatus.FREE,
            triggeredBy: 'NO_SHOW_TIMEOUT',
          },
        });
      }
    });

    if (venue && resolveVenueConfig(venue).opsConfig.expiryNotificationEnabled) {
      await Notify.queueNoShow(entry.venueId, entry.id, entry.guestPhone, entry.guestName, venue.name);
    }

    await recompactQueuePositions(entry.venueId);

    if (releasedTableId) {
      await tryAdvanceQueue(entry.venueId, releasedTableId);
    }
  }
}

export async function sweepReadyReminderEntries(now = new Date()): Promise<void> {
  const notifiedEntries = await prisma.queueEntry.findMany({
    where: {
      status: QueueEntryStatus.NOTIFIED,
      tableReadyDeadlineAt: { gt: now },
    },
    orderBy: { tableReadyDeadlineAt: 'asc' },
  });

  if (!notifiedEntries.length) {
    return;
  }

  const venueIds = Array.from(new Set(notifiedEntries.map((entry) => entry.venueId)));
  const venues = await prisma.venue.findMany({
    where: { id: { in: venueIds } },
    select: {
      id: true,
      name: true,
      slug: true,
      brandConfig: true,
      featureConfig: true,
      uiConfig: true,
      opsConfig: true,
    },
  });
  const venuesById = new Map(venues.map((venue) => [venue.id, venue]));

  for (const entry of notifiedEntries) {
    if (!entry.tableReadyDeadlineAt) {
      continue;
    }

    const venue = venuesById.get(entry.venueId);
    if (!venue) {
      continue;
    }

    const venueConfig = resolveVenueConfig(venue);
    if (!venueConfig.opsConfig.readyReminderEnabled) {
      continue;
    }

    const reminderThreshold = new Date(
      entry.tableReadyDeadlineAt.getTime() - (venueConfig.opsConfig.readyReminderOffsetMin * 60 * 1000),
    );
    if (now < reminderThreshold) {
      continue;
    }

    const existingReminders = await prisma.notification.findMany({
      where: {
        queueEntryId: entry.id,
        type: NotificationType.TABLE_READY,
        status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT] },
      },
      select: {
        payload: true,
      },
    });

    const reminderAlreadySent = existingReminders.some((notification) => {
      if (!notification.payload || typeof notification.payload !== 'object' || Array.isArray(notification.payload)) {
        return false;
      }
      return (notification.payload as Record<string, unknown>).kind === 'QUEUE_READY_REMINDER';
    });

    if (reminderAlreadySent) {
      continue;
    }

    await Notify.queueReadyReminder(
      entry.venueId,
      entry.id,
      entry.guestPhone,
      entry.guestName,
      entry.position,
      entry.estimatedWaitMin ?? 0,
      venue.name,
    );
  }
}

async function recompactQueuePositions(venueId: string): Promise<void> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      slug: true,
      brandConfig: true,
      featureConfig: true,
      uiConfig: true,
      opsConfig: true,
    },
  });
  const venueConfig = venue ? resolveVenueConfig(venue) : null;

  const activeEntries = await prisma.queueEntry.findMany({
    where: {
      venueId,
      status: { in: [QueueEntryStatus.WAITING, QueueEntryStatus.NOTIFIED] },
    },
    orderBy: { joinedAt: 'asc' },
  });

  await Promise.all(activeEntries.map((entry, index) =>
    prisma.queueEntry.update({
      where: { id: entry.id },
      data: {
        position: index + 1,
        estimatedWaitMin: venueConfig?.opsConfig.guestWaitFormula === 'SUBKO_FIXED_V1'
          ? Math.max(3, Math.min(8 + (3 * index), 30))
          : Math.ceil((index + 1) * 55 * 0.7),
      },
    })
  ));
}
