import { NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client';

const prismaMock = {
  notification: {
    create: vi.fn(),
    update: vi.fn(),
  },
  venue: {
    findUnique: vi.fn(),
  },
};

const sendIvrQueueTableReadyMock = vi.fn().mockResolvedValue('ivr_table_ready');
const sendIvrQueueReadyReminderMock = vi.fn().mockResolvedValue('ivr_ready_reminder');
const sendIvrQueueExpiredMock = vi.fn().mockResolvedValue('ivr_expired');
const sendIvrQueueNoShowMock = vi.fn().mockResolvedValue('ivr_no_show');

vi.mock('../../src/config/database', () => ({
  prisma: prismaMock,
}));

vi.mock('../../src/config/env', () => ({
  env: {
    USE_MOCK_NOTIFICATIONS: true,
    GUPSHUP_API_KEY: '',
    GUPSHUP_APP_NAME: 'FlockApp',
    GUPSHUP_SOURCE_NUMBER: '',
    MSG91_AUTH_KEY: '',
    MSG91_SENDER_ID: 'FLOCK',
    IVR_PROVIDER: '',
    IVR_ENABLED_VENUE_SLUGS: '',
    IVR_QUEUE_READY_REMINDER_ENABLED: false,
    IVR_QUEUE_EXPIRED_ENABLED: false,
    IVR_QUEUE_NO_SHOW_ENABLED: false,
  },
}));

vi.mock('../../src/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/integrations/ivr', () => ({
  sendIvrQueueTableReady: sendIvrQueueTableReadyMock,
  sendIvrQueueReadyReminder: sendIvrQueueReadyReminderMock,
  sendIvrQueueExpired: sendIvrQueueExpiredMock,
  sendIvrQueueNoShow: sendIvrQueueNoShowMock,
}));

describe('notification integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.notification.create.mockResolvedValue({ id: 'notif_1' });
    prismaMock.notification.update.mockResolvedValue({ id: 'notif_1' });
    prismaMock.venue.findUnique.mockResolvedValue({ slug: 'the-craftery-koramangala' });
  });

  it('sends a mock WhatsApp table-ready notification with host-desk copy', async () => {
    const { Notify } = await import('../../src/integrations/notifications');

    await Notify.tableReady(
      'venue_1',
      'entry_1',
      '9876543210',
      'Neha',
      '',
      'The Craftery by Subko',
      3,
    );

    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        venueId: 'venue_1',
        queueEntryId: 'entry_1',
        type: NotificationType.TABLE_READY,
        channel: NotificationChannel.WHATSAPP,
        status: NotificationStatus.PENDING,
        payload: expect.objectContaining({
          kind: 'TABLE_READY',
          name: 'Neha',
          venueName: 'The Craftery by Subko',
          windowMin: 3,
        }),
      }),
    }));
    expect(sendIvrQueueTableReadyMock).toHaveBeenCalledWith(expect.objectContaining({
      venueId: 'venue_1',
      venueSlug: 'the-craftery-koramangala',
      queueEntryId: 'entry_1',
      to: '9876543210',
      message: expect.stringContaining('host desk'),
    }));
  });

  it('adds a ready reminder template and IVR scaffold for manual dispatch', async () => {
    const { Notify } = await import('../../src/integrations/notifications');

    prismaMock.notification.create.mockResolvedValueOnce({ id: 'notif_2' });
    prismaMock.notification.update.mockResolvedValueOnce({ id: 'notif_2' });

    await Notify.queueReadyReminder(
      'venue_1',
      'entry_1',
      '9876543210',
      'Neha',
      4,
      12,
      'The Craftery by Subko',
    );

    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: NotificationType.TABLE_READY,
        channel: NotificationChannel.WHATSAPP,
        payload: expect.objectContaining({
          kind: 'QUEUE_READY_REMINDER',
          name: 'Neha',
          position: 4,
          waitMin: 12,
          venueName: 'The Craftery by Subko',
        }),
      }),
    }));
    expect(sendIvrQueueReadyReminderMock).toHaveBeenCalledWith(expect.objectContaining({
      venueId: 'venue_1',
      venueSlug: 'the-craftery-koramangala',
      queueEntryId: 'entry_1',
      to: '9876543210',
      message: expect.stringContaining('stay nearby'),
    }));
  });

  it('adds expiry and no-show messaging scaffolds for queue release', async () => {
    const { Notify } = await import('../../src/integrations/notifications');

    prismaMock.notification.create.mockResolvedValueOnce({ id: 'notif_3' });
    prismaMock.notification.update.mockResolvedValueOnce({ id: 'notif_3' });

    await Notify.queueExpired(
      'venue_1',
      'entry_1',
      '9876543210',
      'Neha',
      'The Craftery by Subko',
    );

    prismaMock.notification.create.mockResolvedValueOnce({ id: 'notif_4' });
    prismaMock.notification.update.mockResolvedValueOnce({ id: 'notif_4' });

    await Notify.queueNoShow(
      'venue_1',
      'entry_1',
      '9876543210',
      'Neha',
      'The Craftery by Subko',
    );

    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: NotificationType.TABLE_READY,
        payload: expect.objectContaining({
          kind: 'QUEUE_EXPIRED',
          name: 'Neha',
          venueName: 'The Craftery by Subko',
        }),
      }),
    }));
    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: NotificationType.TABLE_READY,
        payload: expect.objectContaining({
          kind: 'QUEUE_NO_SHOW',
          name: 'Neha',
          venueName: 'The Craftery by Subko',
        }),
      }),
    }));
    expect(sendIvrQueueExpiredMock).toHaveBeenCalledWith(expect.objectContaining({
      venueId: 'venue_1',
      venueSlug: 'the-craftery-koramangala',
      queueEntryId: 'entry_1',
      to: '9876543210',
      message: expect.stringContaining('expired'),
    }));
    expect(sendIvrQueueNoShowMock).toHaveBeenCalledWith(expect.objectContaining({
      venueId: 'venue_1',
      venueSlug: 'the-craftery-koramangala',
      queueEntryId: 'entry_1',
      to: '9876543210',
      message: expect.stringContaining('released'),
    }));
  });

  it('keeps queue-joined helper intact with generic message copy', async () => {
    const { sendNotification } = await import('../../src/integrations/notifications');

    await sendNotification({
      venueId: 'venue_1',
      queueEntryId: 'entry_1',
      type: NotificationType.QUEUE_JOINED,
      to: '9876543210',
      message: 'test message',
      channel: NotificationChannel.WHATSAPP,
    });

    expect(prismaMock.notification.create).toHaveBeenCalled();
  });
});
