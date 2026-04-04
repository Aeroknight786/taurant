import { QueueEntryStatus, QueueSeatingPreference, TableStatus } from '@prisma/client';
import { AppError } from '../../src/middleware/errorHandler';
import { createPrismaMock } from '../helpers/mock-prisma';

const prismaMock = createPrismaMock();
const redisMock = {
  set: vi.fn(),
  publish: vi.fn(),
  del: vi.fn(),
};
const notifyMock = {
  queueJoined: vi.fn(),
  tableReady: vi.fn(),
  queueReadyReminder: vi.fn(),
  queueNoShow: vi.fn(),
};
const isRedisReadyMock = vi.fn(() => false);
const ensurePartySessionForQueueEntryMock = vi.fn();
const syncPendingPreOrderForSeatingMock = vi.fn();
const signGuestTokenMock = vi.fn(() => 'guest-token');
const initiateRefundMock = vi.fn();
const logFlowEventMock = vi.fn();
const guestAccessLinkMock = {
  issueQueueAccessLink: vi.fn(),
  resolveGuestAccessModeFromQueueEntry: vi.fn(),
  getGuestReadOnlySessionExpiresInSeconds: vi.fn(),
};

vi.mock('../../src/config/database', () => ({
  prisma: prismaMock,
}));

vi.mock('../../src/config/redis', () => ({
  redis: redisMock,
  RedisKeys: {
    queueEntry: (entryId: string) => `queue:${entryId}`,
  },
  PubSubChannels: {
    queueUpdate: (venueId: string) => `queue:${venueId}`,
    tableUpdate: (venueId: string) => `table:${venueId}`,
  },
  isRedisReady: isRedisReadyMock,
}));

vi.mock('../../src/integrations/notifications', () => ({
  Notify: notifyMock,
}));

vi.mock('../../src/services/partySession.service', () => ({
  ensurePartySessionForQueueEntry: ensurePartySessionForQueueEntryMock,
}));

vi.mock('../../src/services/order.service', () => ({
  syncPendingPreOrderForSeating: syncPendingPreOrderForSeatingMock,
}));

vi.mock('../../src/utils/jwt', () => ({
  signGuestToken: signGuestTokenMock,
}));

vi.mock('../../src/services/guestAccessLink.service', () => ({
  issueQueueAccessLink: guestAccessLinkMock.issueQueueAccessLink,
  resolveGuestAccessModeFromQueueEntry: guestAccessLinkMock.resolveGuestAccessModeFromQueueEntry,
  getGuestReadOnlySessionExpiresInSeconds: guestAccessLinkMock.getGuestReadOnlySessionExpiresInSeconds,
}));

vi.mock('../../src/integrations/razorpay', async () => {
  const actual = await vi.importActual<typeof import('../../src/integrations/razorpay')>('../../src/integrations/razorpay');
  return {
    ...actual,
    initiateRefund: initiateRefundMock,
  };
});

vi.mock('../../src/services/orderFlowEvent.service', () => ({
  OrderFlowEventType: {
    QUEUE_JOINED: 'QUEUE_JOINED',
    QUEUE_PRIORITIZED: 'QUEUE_PRIORITIZED',
    TABLE_NOTIFIED: 'TABLE_NOTIFIED',
    GUEST_SEATED: 'GUEST_SEATED',
    ENTRY_CANCELLED: 'ENTRY_CANCELLED',
    ENTRY_COMPLETED: 'ENTRY_COMPLETED',
  },
  logFlowEvent: logFlowEventMock,
}));

describe('queue service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRedisReadyMock.mockReturnValue(false);
    ensurePartySessionForQueueEntryMock.mockResolvedValue({
      session: { id: 'session_1' },
      hostParticipant: { id: 'participant_1' },
    });
    syncPendingPreOrderForSeatingMock.mockResolvedValue({
      attempted: false,
      status: 'no_preorder',
    });
    guestAccessLinkMock.issueQueueAccessLink.mockResolvedValue({
      token: 'opaque-token',
      tokenHash: 'hashed-token',
      issuedAt: new Date(),
      statusLink: 'https://taurant.onrender.com/v/the-craftery-koramangala/e/entry_1?access=opaque-token',
    });
    guestAccessLinkMock.resolveGuestAccessModeFromQueueEntry.mockImplementation((entry) => {
      if (['WAITING', 'NOTIFIED', 'SEATED'].includes(entry.status)) {
        return 'ACTIVE';
      }
      if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(entry.status)) {
        return 'READ_ONLY';
      }
      return null;
    });
    guestAccessLinkMock.getGuestReadOnlySessionExpiresInSeconds.mockReturnValue(3600);
  });

  it('joins the queue, assigns position, and issues a guest token', async () => {
    const { joinQueue } = await import('../../src/services/queue.service');

    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_1',
      name: 'Flock',
      slug: 'the-barrel-room-koramangala',
      isQueueOpen: true,
      maxQueueSize: 200,
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: null,
    });
    prismaMock.queueEntry.count.mockResolvedValue(2);
    prismaMock.queueEntry.findFirst.mockResolvedValue(null);
    prismaMock.queueEntry.create.mockResolvedValue({
      id: 'entry_1',
      venueId: 'venue_1',
      guestName: 'Neha',
      guestPhone: '9876543210',
    });

    const result = await joinQueue({
      venueId: 'venue_1',
      guestName: 'Neha',
      guestPhone: '9876543210',
      partySize: 3,
      seatingPreference: QueueSeatingPreference.OUTDOOR,
      guestNotes: 'Near the patio if possible',
    });

    expect(result).toEqual(expect.objectContaining({
      id: 'entry_1',
      position: 3,
      estimatedWaitMin: 116,
      guestToken: 'guest-token',
    }));
    expect(prismaMock.queueEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        position: 3,
        partySize: 3,
        seatingPreference: QueueSeatingPreference.OUTDOOR,
        guestNotes: 'Near the patio if possible',
        displayRef: expect.stringMatching(/^FLK-/),
      }),
    }));
    expect(notifyMock.queueJoined).toHaveBeenCalled();
    expect(guestAccessLinkMock.issueQueueAccessLink).toHaveBeenCalledWith(expect.objectContaining({
      venueId: 'venue_1',
      queueEntryId: 'entry_1',
      messageKind: 'JOIN',
    }));
  });

  it('uses the Subko fixed ETA formula for venues configured with SUBKO_FIXED_V1', async () => {
    const { joinQueue } = await import('../../src/services/queue.service');

    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_subko',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      isQueueOpen: true,
      maxQueueSize: 200,
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        joinConfirmationMode: 'WEB_ONLY',
        guestWaitFormula: 'SUBKO_FIXED_V1',
      },
    });
    prismaMock.queueEntry.count.mockResolvedValue(2);
    prismaMock.queueEntry.findFirst.mockResolvedValue(null);
    prismaMock.queueEntry.create.mockResolvedValue({
      id: 'entry_subko_1',
      venueId: 'venue_subko',
      guestName: 'Aarav',
      guestPhone: '9876543210',
    });

    const result = await joinQueue({
      venueId: 'venue_subko',
      guestName: 'Aarav',
      guestPhone: '9876543210',
      partySize: 2,
      seatingPreference: QueueSeatingPreference.FIRST_AVAILABLE,
    });

    expect(result).toEqual(expect.objectContaining({
      id: 'entry_subko_1',
      position: 3,
      estimatedWaitMin: 14,
    }));
    expect(notifyMock.queueJoined).not.toHaveBeenCalled();
    expect(guestAccessLinkMock.issueQueueAccessLink).not.toHaveBeenCalled();
  });

  it('rejects duplicate active phones in the queue', async () => {
    const { joinQueue } = await import('../../src/services/queue.service');

    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_1',
      name: 'Flock',
      slug: 'the-barrel-room-koramangala',
      isQueueOpen: true,
      maxQueueSize: 200,
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: null,
    });
    prismaMock.queueEntry.count.mockResolvedValue(1);
    prismaMock.queueEntry.findFirst.mockResolvedValue({ id: 'entry_existing' });

    await expect(joinQueue({
      venueId: 'venue_1',
      guestName: 'Neha',
      guestPhone: '9876543210',
      partySize: 2,
      seatingPreference: QueueSeatingPreference.FIRST_AVAILABLE,
    })).rejects.toMatchObject<AppError>({ code: 'ALREADY_IN_QUEUE' });
  });

  it('seats a guest, re-compacts the queue, and syncs preorder state', async () => {
    const { seatGuest } = await import('../../src/services/queue.service');

    prismaMock.queueEntry.findFirst.mockResolvedValue({
      id: 'entry_1',
      guestName: 'Neha',
      venueId: 'venue_1',
      status: QueueEntryStatus.WAITING,
    });
    prismaMock.table.findFirst.mockResolvedValue({
      id: 'table_1',
      label: 'T1',
      status: TableStatus.FREE,
    });
    prismaMock.queueEntry.findMany.mockResolvedValue([
      { id: 'entry_2', joinedAt: new Date('2026-03-09T10:00:00.000Z') },
      { id: 'entry_3', joinedAt: new Date('2026-03-09T10:05:00.000Z') },
    ]);
    syncPendingPreOrderForSeatingMock.mockResolvedValue({
      attempted: true,
      status: 'manual_fallback',
    });

    const result = await seatGuest({
      venueId: 'venue_1',
      otp: '123456',
      tableId: 'table_1',
    });

    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_1' },
      data: expect.objectContaining({ status: QueueEntryStatus.SEATED, tableId: 'table_1' }),
    }));
    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_2' },
      data: expect.objectContaining({ position: 1, estimatedWaitMin: 39 }),
    }));
    expect(syncPendingPreOrderForSeatingMock).toHaveBeenCalledWith({
      venueId: 'venue_1',
      queueEntryId: 'entry_1',
      tableId: 'T1',
    });
    expect(result.preOrderSync.status).toBe('manual_fallback');
  });

  it('recomputes ETA with the Subko fixed formula when positions are compacted', async () => {
    const { seatGuest } = await import('../../src/services/queue.service');

    prismaMock.queueEntry.findFirst.mockResolvedValue({
      id: 'entry_1',
      guestName: 'Neha',
      venueId: 'venue_subko',
      status: QueueEntryStatus.WAITING,
    });
    prismaMock.table.findFirst.mockResolvedValue({
      id: 'table_1',
      label: 'P1',
      status: TableStatus.FREE,
    });
    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_subko',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        guestWaitFormula: 'SUBKO_FIXED_V1',
      },
    });
    prismaMock.queueEntry.findMany.mockResolvedValue([
      { id: 'entry_2', joinedAt: new Date('2026-03-09T10:00:00.000Z') },
      { id: 'entry_3', joinedAt: new Date('2026-03-09T10:05:00.000Z') },
    ]);

    await seatGuest({
      venueId: 'venue_subko',
      otp: '123456',
      tableId: 'table_1',
    });

    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_2' },
      data: expect.objectContaining({ position: 1, estimatedWaitMin: 8 }),
    }));
    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_3' },
      data: expect.objectContaining({ position: 2, estimatedWaitMin: 11 }),
    }));
  });

  it('completes a queue-only entry without requiring a table assignment', async () => {
    const { seatGuest } = await import('../../src/services/queue.service');

    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_subko',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      tableReadyWindowMin: 15,
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        tableSourceMode: 'DISABLED',
        arrivalCompletionMode: 'QUEUE_COMPLETE',
        joinConfirmationMode: 'WEB_ONLY',
      },
    });
    prismaMock.queueEntry.findFirst.mockResolvedValue({
      id: 'entry_1',
      guestName: 'Neha',
      venueId: 'venue_subko',
      status: QueueEntryStatus.NOTIFIED,
    });
    prismaMock.queueEntry.findMany.mockResolvedValue([]);

    const result = await seatGuest({
      venueId: 'venue_subko',
      entryId: 'entry_1',
      otp: '123456',
    });

    expect(prismaMock.queueEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'entry_1',
        otp: '123456',
        venueId: 'venue_subko',
      }),
    }));
    expect(prismaMock.table.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_1' },
      data: expect.objectContaining({
        status: QueueEntryStatus.COMPLETED,
        tableId: null,
        seatedAt: expect.any(Date),
        completedAt: expect.any(Date),
        tableReadyDeadlineAt: null,
      }),
    }));
    expect(result.preOrderSync).toEqual({ attempted: false, status: 'no_preorder' });
  });

  it('notifies a waiting entry in manual-dispatch mode with the default 3 minute window', async () => {
    const { notifyQueueEntry } = await import('../../src/services/queue.service');

    prismaMock.queueEntry.findFirst.mockResolvedValue({
      id: 'entry_1',
      venueId: 'venue_1',
      status: QueueEntryStatus.WAITING,
      tableId: null,
      guestName: 'Neha',
      guestPhone: '9876543210',
    });
    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_1',
      name: 'The Craftery by Subko',
      tableReadyWindowMin: 15,
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        joinConfirmationMode: 'WEB_ONLY',
        readyNotificationChannels: ['WHATSAPP', 'IVR'],
      },
    });

    const result = await notifyQueueEntry('entry_1', 'venue_1');

    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_1' },
      data: expect.objectContaining({
        status: QueueEntryStatus.NOTIFIED,
        tableReadyExpiredAt: null,
      }),
    }));
    expect(notifyMock.tableReady).toHaveBeenCalledWith(
      'venue_1',
      'entry_1',
      '9876543210',
      'Neha',
      'Host desk',
      'The Craftery by Subko',
      3,
      expect.objectContaining({
        statusLink: expect.stringContaining('/v/'),
      }),
    );
    expect(guestAccessLinkMock.issueQueueAccessLink).toHaveBeenCalledWith(expect.objectContaining({
      queueEntryId: 'entry_1',
      messageKind: 'NOTIFY',
    }));
    expect(result.status).toBe(QueueEntryStatus.NOTIFIED);
    expect(result.windowMin).toBe(3);
  });

  it('notifies a waiting entry with an explicit custom response window', async () => {
    const { notifyQueueEntry } = await import('../../src/services/queue.service');

    prismaMock.queueEntry.findFirst.mockResolvedValue({
      id: 'entry_1',
      venueId: 'venue_1',
      status: QueueEntryStatus.WAITING,
      tableId: null,
      guestName: 'Neha',
      guestPhone: '9876543210',
    });
    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_1',
      name: 'The Craftery by Subko',
      tableReadyWindowMin: 15,
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        joinConfirmationMode: 'WEB_ONLY',
        readyNotificationChannels: ['WHATSAPP', 'IVR'],
      },
    });

    const result = await notifyQueueEntry('entry_1', 'venue_1', 10);

    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_1' },
      data: expect.objectContaining({
        status: QueueEntryStatus.NOTIFIED,
      }),
    }));
    expect(notifyMock.tableReady).toHaveBeenCalledWith(
      'venue_1',
      'entry_1',
      '9876543210',
      'Neha',
      'Host desk',
      'The Craftery by Subko',
      10,
      expect.objectContaining({
        statusLink: expect.stringContaining('/v/'),
      }),
    );
    expect(result.windowMin).toBe(10);
  });

  it('nudges an already-notified entry without changing the deadline', async () => {
    const { nudgeQueueEntry } = await import('../../src/services/queue.service');

    prismaMock.queueEntry.findFirst.mockResolvedValue({
      id: 'entry_1',
      venueId: 'venue_1',
      status: QueueEntryStatus.NOTIFIED,
      tableId: null,
      guestName: 'Neha',
      guestPhone: '9876543210',
      position: 2,
      estimatedWaitMin: 11,
      notifiedAt: new Date('2026-03-31T10:00:00.000Z'),
      tableReadyDeadlineAt: new Date('2026-03-31T10:15:00.000Z'),
    });
    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_1',
      name: 'The Craftery by Subko',
      tableReadyWindowMin: 15,
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        joinConfirmationMode: 'WEB_ONLY',
        readyNotificationChannels: ['WHATSAPP', 'IVR'],
      },
    });

    const result = await nudgeQueueEntry('entry_1', 'venue_1');

    expect(prismaMock.queueEntry.update).not.toHaveBeenCalled();
    expect(notifyMock.queueReadyReminder).toHaveBeenCalledWith(
      'venue_1',
      'entry_1',
      '9876543210',
      'Neha',
      2,
      11,
      'The Craftery by Subko',
    );
    expect(result).toEqual(expect.objectContaining({
      entryId: 'entry_1',
      status: QueueEntryStatus.NOTIFIED,
    }));
  });

  it('reorders a waiting entry one slot at a time without moving ahead of notified entries', async () => {
    const { reorderQueueEntry } = await import('../../src/services/queue.service');

    prismaMock.queueEntry.findFirst.mockResolvedValue({
      id: 'entry_target',
      venueId: 'venue_subko',
      status: QueueEntryStatus.WAITING,
      position: 3,
      estimatedWaitMin: 14,
      guestName: 'Neha',
    });
    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_subko',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        guestWaitFormula: 'SUBKO_FIXED_V1',
      },
    });
    prismaMock.queueEntry.findMany.mockResolvedValue([
      { id: 'entry_notified', position: 1, status: QueueEntryStatus.NOTIFIED, estimatedWaitMin: 8 },
      { id: 'entry_other_1', position: 2, status: QueueEntryStatus.WAITING, estimatedWaitMin: 11 },
      { id: 'entry_target', position: 3, status: QueueEntryStatus.WAITING, estimatedWaitMin: 14 },
      { id: 'entry_other_2', position: 4, status: QueueEntryStatus.WAITING, estimatedWaitMin: 17 },
    ]);

    const result = await reorderQueueEntry('entry_target', 'venue_subko', 'UP', 'staff_priority');

    expect(result).toEqual(expect.objectContaining({
      entryId: 'entry_target',
      status: QueueEntryStatus.WAITING,
      position: 2,
      estimatedWaitMin: 11,
    }));
    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_notified' },
      data: expect.objectContaining({ position: 1, estimatedWaitMin: 8 }),
    }));
    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_target' },
      data: expect.objectContaining({ position: 2, estimatedWaitMin: 11 }),
    }));
    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_other_1' },
      data: expect.objectContaining({ position: 3, estimatedWaitMin: 14 }),
    }));
    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_other_2' },
      data: expect.objectContaining({ position: 4, estimatedWaitMin: 17 }),
    }));
  });

  it('rejects table lifecycle updates for waitlist-only venues', async () => {
    const { updateTableStatus } = await import('../../src/services/table.service');

    prismaMock.table.findFirst.mockResolvedValue({
      id: 'table_1',
      venueId: 'venue_subko',
      status: TableStatus.OCCUPIED,
      occupiedSince: new Date('2026-03-31T10:00:00.000Z'),
    });
    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_subko',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      tableReadyWindowMin: 15,
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        tableSourceMode: 'DISABLED',
        arrivalCompletionMode: 'QUEUE_COMPLETE',
      },
    });

    await expect(updateTableStatus({
      tableId: 'table_1',
      venueId: 'venue_subko',
      status: TableStatus.CLEARING,
      triggeredBy: 'STAFF',
    })).rejects.toMatchObject({ code: 'VENUE_FEATURE_DISABLED', statusCode: 403 });

    vi.clearAllMocks();
    prismaMock.table.findFirst.mockResolvedValue({
      id: 'table_1',
      venueId: 'venue_subko',
      status: TableStatus.CLEARING,
      occupiedSince: null,
    });
    prismaMock.table.findUnique.mockResolvedValue({
      id: 'table_1',
      venueId: 'venue_subko',
      status: TableStatus.FREE,
      label: 'P1',
      capacity: 4,
    });
    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_subko',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      tableReadyWindowMin: 15,
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        tableSourceMode: 'DISABLED',
        arrivalCompletionMode: 'QUEUE_COMPLETE',
      },
    });

    await expect(updateTableStatus({
      tableId: 'table_1',
      venueId: 'venue_subko',
      status: TableStatus.FREE,
      triggeredBy: 'STAFF',
    })).rejects.toMatchObject({ code: 'VENUE_FEATURE_DISABLED', statusCode: 403 });
  });

  it('prioritizes a waiting entry to the front of the waiting cohort and audits the action', async () => {
    const { prioritizeQueueEntry } = await import('../../src/services/queue.service');

    prismaMock.queueEntry.findFirst.mockResolvedValue({
      id: 'entry_target',
      venueId: 'venue_subko',
      status: QueueEntryStatus.WAITING,
      position: 3,
      guestName: 'Neha',
    });
    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_subko',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        guestWaitFormula: 'SUBKO_FIXED_V1',
      },
    });
    prismaMock.queueEntry.findMany.mockResolvedValue([
      { id: 'entry_notified', position: 1, status: QueueEntryStatus.NOTIFIED, joinedAt: new Date('2026-03-31T08:58:00.000Z') },
      { id: 'entry_other_1', position: 2, status: QueueEntryStatus.WAITING, joinedAt: new Date('2026-03-31T09:00:00.000Z') },
      { id: 'entry_target', position: 3, status: QueueEntryStatus.WAITING, joinedAt: new Date('2026-03-31T09:05:00.000Z') },
      { id: 'entry_other_2', position: 4, status: QueueEntryStatus.WAITING, joinedAt: new Date('2026-03-31T09:10:00.000Z') },
    ]);

    const result = await prioritizeQueueEntry('entry_target', 'venue_subko', 'staff_priority');

    expect(result).toEqual(expect.objectContaining({
      entryId: 'entry_target',
      status: QueueEntryStatus.WAITING,
      position: 2,
      estimatedWaitMin: 11,
    }));
    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_notified' },
      data: expect.objectContaining({ position: 1, estimatedWaitMin: 8 }),
    }));
    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_target' },
      data: expect.objectContaining({ position: 2, estimatedWaitMin: 11 }),
    }));
    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_other_1' },
      data: expect.objectContaining({ position: 3, estimatedWaitMin: 14 }),
    }));
    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_other_2' },
      data: expect.objectContaining({ position: 4, estimatedWaitMin: 17 }),
    }));
    expect(logFlowEventMock).toHaveBeenCalledWith(expect.objectContaining({
      queueEntryId: 'entry_target',
      type: 'QUEUE_PRIORITIZED',
      snapshot: expect.objectContaining({
        previousPosition: 3,
        newPosition: 2,
        estimatedWaitMin: 11,
        staffId: 'staff_priority',
      }),
    }));
  });

  it('rejects prioritizing non-waiting queue entries', async () => {
    const { prioritizeQueueEntry } = await import('../../src/services/queue.service');

    prismaMock.queueEntry.findFirst.mockResolvedValue({
      id: 'entry_target',
      venueId: 'venue_subko',
      status: QueueEntryStatus.NOTIFIED,
      position: 1,
    });
    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_subko',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
      },
    });

    await expect(prioritizeQueueEntry('entry_target', 'venue_subko')).rejects.toMatchObject<AppError>({
      code: 'ENTRY_NOT_WAITING',
    });
  });

  it('cancels waiting entries and attempts an auto-refund when a deposit exists', async () => {
    const { cancelQueueEntry } = await import('../../src/services/queue.service');

    prismaMock.queueEntry.findFirst.mockResolvedValue({
      id: 'entry_1',
      venueId: 'venue_1',
      status: QueueEntryStatus.WAITING,
      tableId: 'table_1',
    });
    prismaMock.payment.findFirst
      .mockResolvedValueOnce({
        id: 'payment_1',
        amount: 10_000,
        razorpayPaymentId: 'rzp_payment_1',
      })
      .mockResolvedValueOnce(null);
    prismaMock.table.findUnique.mockResolvedValue({
      id: 'table_1',
      status: TableStatus.RESERVED,
    });
    prismaMock.queueEntry.findMany.mockResolvedValue([]);
    initiateRefundMock.mockResolvedValue({ id: 'refund_1' });

    const result = await cancelQueueEntry('entry_1', 'venue_1');

    expect(result).toEqual(expect.objectContaining({
      queueCancelled: true,
      refundStatus: 'refunded',
      refundedPaymentId: 'payment_1',
      refundId: 'refund_1',
    }));
    expect(prismaMock.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'payment_1' },
      data: expect.objectContaining({ status: 'REFUNDED', refundAmount: 10_000 }),
    }));
  });

  it('lets a guest leave their own waiting queue entry and reuses cancellation semantics', async () => {
    const { leaveQueueEntry } = await import('../../src/services/queue.service');

    prismaMock.queueEntry.findFirst
      .mockResolvedValueOnce({
        id: 'entry_1',
        venueId: 'venue_1',
        status: QueueEntryStatus.WAITING,
      })
      .mockResolvedValueOnce({
        id: 'entry_1',
        venueId: 'venue_1',
        status: QueueEntryStatus.WAITING,
        tableId: null,
      });
    prismaMock.payment.findFirst.mockResolvedValue(null);
    prismaMock.queueEntry.findMany.mockResolvedValue([]);

    const result = await leaveQueueEntry('entry_1', 'venue_1', '9876543210');

    expect(result).toEqual(expect.objectContaining({
      queueCancelled: true,
      refundStatus: 'not_needed',
    }));
    expect(logFlowEventMock).toHaveBeenCalledWith(expect.objectContaining({
      queueEntryId: 'entry_1',
      type: 'ENTRY_CANCELLED',
    }));
  });

  it('rejects guest leave attempts for non-leavable queue entries', async () => {
    const { leaveQueueEntry } = await import('../../src/services/queue.service');

    prismaMock.queueEntry.findFirst.mockResolvedValue({
      id: 'entry_1',
      venueId: 'venue_1',
      status: QueueEntryStatus.SEATED,
    });

    await expect(leaveQueueEntry('entry_1', 'venue_1', '9876543210')).rejects.toMatchObject<AppError>({
      code: 'ENTRY_NOT_LEAVABLE',
    });
  });

  it('skips auto-advance for manual-dispatch venues when a table becomes free', async () => {
    const { tryAdvanceQueue } = await import('../../src/services/table.service');

    prismaMock.table.findUnique.mockResolvedValue({
      id: 'table_1',
      venueId: 'venue_1',
      label: 'P1',
      status: TableStatus.FREE,
      capacity: 4,
    });
    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_1',
      name: 'The Craftery by Subko',
      tableReadyWindowMin: 15,
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: { queueDispatchMode: 'MANUAL_NOTIFY' },
    });

    await tryAdvanceQueue('venue_1', 'table_1');

    expect(prismaMock.queueEntry.findFirst).not.toHaveBeenCalled();
    expect(notifyMock.tableReady).not.toHaveBeenCalled();
  });

  it('sends a no-show notification when expiry notifications are enabled', async () => {
    const { sweepExpiredTableReadyEntries } = await import('../../src/services/table.service');

    prismaMock.queueEntry.findMany
      .mockResolvedValueOnce([
        {
          id: 'entry_expired',
          venueId: 'venue_subko',
          status: QueueEntryStatus.NOTIFIED,
          guestName: 'Neha',
          guestPhone: '9876543210',
          tableReadyDeadlineAt: new Date('2026-03-31T10:15:00.000Z'),
          table: null,
        },
      ])
      .mockResolvedValueOnce([]);

    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_subko',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        expiryNotificationEnabled: true,
        guestWaitFormula: 'SUBKO_FIXED_V1',
      },
    });

    await sweepExpiredTableReadyEntries();

    expect(prismaMock.queueEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'entry_expired' },
      data: expect.objectContaining({
        status: QueueEntryStatus.NO_SHOW,
        tableReadyDeadlineAt: null,
      }),
    }));
    expect(notifyMock.queueNoShow).toHaveBeenCalledWith(
      'venue_subko',
      'entry_expired',
      '9876543210',
      'Neha',
      'The Craftery by Subko',
    );
  });

  it('sends one ready reminder when the venue config enables reminder sweeps near expiry', async () => {
    const { sweepReadyReminderEntries } = await import('../../src/services/table.service');

    prismaMock.queueEntry.findMany.mockResolvedValue([
      {
        id: 'entry_reminder',
        venueId: 'venue_subko',
        guestName: 'Neha',
        guestPhone: '9876543210',
        position: 2,
        estimatedWaitMin: 11,
        tableReadyDeadlineAt: new Date('2026-03-31T10:02:00.000Z'),
      },
    ]);
    prismaMock.venue.findMany.mockResolvedValue([
      {
        id: 'venue_subko',
        name: 'The Craftery by Subko',
        slug: 'the-craftery-koramangala',
        brandConfig: null,
        featureConfig: null,
        uiConfig: null,
        opsConfig: {
          queueDispatchMode: 'MANUAL_NOTIFY',
          readyReminderEnabled: true,
          readyReminderOffsetMin: 1,
        },
      },
    ]);
    prismaMock.notification.findMany.mockResolvedValue([]);

    await sweepReadyReminderEntries(new Date('2026-03-31T10:01:30.000Z'));

    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        queueEntryId: 'entry_reminder',
      }),
    }));
    expect(notifyMock.queueReadyReminder).toHaveBeenCalledWith(
      'venue_subko',
      'entry_reminder',
      '9876543210',
      'Neha',
      2,
      11,
      'The Craftery by Subko',
    );
  });

  it('does not send duplicate ready reminders when a reminder log already exists', async () => {
    const { sweepReadyReminderEntries } = await import('../../src/services/table.service');

    prismaMock.queueEntry.findMany.mockResolvedValue([
      {
        id: 'entry_reminder',
        venueId: 'venue_subko',
        guestName: 'Neha',
        guestPhone: '9876543210',
        position: 2,
        estimatedWaitMin: 11,
        tableReadyDeadlineAt: new Date('2026-03-31T10:02:00.000Z'),
      },
    ]);
    prismaMock.venue.findMany.mockResolvedValue([
      {
        id: 'venue_subko',
        name: 'The Craftery by Subko',
        slug: 'the-craftery-koramangala',
        brandConfig: null,
        featureConfig: null,
        uiConfig: null,
        opsConfig: {
          queueDispatchMode: 'MANUAL_NOTIFY',
          readyReminderEnabled: true,
          readyReminderOffsetMin: 1,
        },
      },
    ]);
    prismaMock.notification.findMany.mockResolvedValue([
      {
        payload: {
          kind: 'QUEUE_READY_REMINDER',
        },
      },
    ]);

    await sweepReadyReminderEntries(new Date('2026-03-31T10:01:30.000Z'));

    expect(notifyMock.queueReadyReminder).not.toHaveBeenCalled();
  });

  it('runs the ready-reminder sweep on the worker tick before expiry processing', async () => {
    vi.resetModules();

    const intervalCallback: Array<() => Promise<void> | void> = [];
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      intervalCallback.push(handler as () => Promise<void> | void);
      return { hasRef: () => true, ref: () => undefined, unref: () => undefined, refresh: () => undefined } as unknown as NodeJS.Timeout;
    }) as typeof setInterval);

    const sweepReadyReminderEntriesMock = vi.fn().mockResolvedValue(undefined);
    const sweepExpiredTableReadyEntriesMock = vi.fn().mockResolvedValue(undefined);
    const updateTableStatusMock = vi.fn();
    const tryAdvanceQueueMock = vi.fn();
    prismaMock.venue.findMany.mockResolvedValue([]);

    vi.doMock('../../src/services/table.service', () => ({
      sweepReadyReminderEntries: sweepReadyReminderEntriesMock,
      sweepExpiredTableReadyEntries: sweepExpiredTableReadyEntriesMock,
      updateTableStatus: updateTableStatusMock,
      tryAdvanceQueue: tryAdvanceQueueMock,
    }));

    const { startTmsPoller } = await import('../../src/workers/tmsPoller');
    startTmsPoller();
    await intervalCallback[0]();

    expect(sweepReadyReminderEntriesMock).toHaveBeenCalledTimes(1);
    expect(sweepExpiredTableReadyEntriesMock).toHaveBeenCalledTimes(1);
    expect(sweepReadyReminderEntriesMock.mock.invocationCallOrder[0]).toBeLessThan(
      sweepExpiredTableReadyEntriesMock.mock.invocationCallOrder[0],
    );

    setIntervalSpy.mockRestore();
  });
});
