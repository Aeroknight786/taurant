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

const envMock = {
  USE_MOCK_NOTIFICATIONS: true,
  USE_MOCK_AUTH_OTP_NOTIFICATIONS: true,
  GUPSHUP_API_KEY: '',
  GUPSHUP_APP_NAME: 'FlockApp',
  GUPSHUP_SOURCE_NUMBER: '',
  GUPSHUP_TEMPLATE_QUEUE_JOIN_NAME: 'queue_join',
  GUPSHUP_TEMPLATE_QUEUE_JOIN_ID: 'b5362b76-8215-497d-889d-6e32d013fb8a',
  GUPSHUP_TEMPLATE_TABLE_READY_NAME: 'table_ready_v6',
  GUPSHUP_TEMPLATE_TABLE_READY_ID: '9b5bd379-904c-4936-b7d8-1a08cfd02a74',
  MSG91_AUTH_KEY: '',
  MSG91_SENDER_ID: 'FLOCK',
  IVR_PROVIDER: '',
  IVR_ENABLED_VENUE_SLUGS: '',
  IVR_QUEUE_READY_REMINDER_ENABLED: false,
  IVR_QUEUE_EXPIRED_ENABLED: false,
  IVR_QUEUE_NO_SHOW_ENABLED: false,
};

const sendIvrQueueTableReadyMock = vi.fn().mockResolvedValue('ivr_table_ready');
const sendIvrQueueReadyReminderMock = vi.fn().mockResolvedValue('ivr_ready_reminder');
const sendIvrQueueExpiredMock = vi.fn().mockResolvedValue('ivr_expired');
const sendIvrQueueNoShowMock = vi.fn().mockResolvedValue('ivr_no_show');

vi.mock('../../src/config/database', () => ({
  prisma: prismaMock,
}));

vi.mock('../../src/config/env', () => ({
  env: envMock,
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
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.USE_MOCK_NOTIFICATIONS = true;
    envMock.USE_MOCK_AUTH_OTP_NOTIFICATIONS = true;
    prismaMock.notification.create.mockResolvedValue({ id: 'notif_1' });
    prismaMock.notification.update.mockResolvedValue({ id: 'notif_1' });
    prismaMock.venue.findUnique.mockResolvedValue({ slug: 'the-craftery-koramangala' });
    global.fetch = vi.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('maps Craftery join WhatsApp to the approved queue_join template variables', async () => {
    const { Notify } = await import('../../src/integrations/notifications');

    await Notify.queueJoined(
      'venue_1',
      'entry_1',
      '9876543210',
      'Neha',
      'The Craftery by Subko',
      {
        venueSlug: 'the-craftery-koramangala',
        queuePosition: 4,
        estimatedWaitMin: 17,
        guestOtp: '123456',
        statusLink: 'https://taurant.onrender.com/v/the-craftery-koramangala/e/entry_1?access=token',
      },
    );

    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: NotificationType.QUEUE_JOINED,
        channel: NotificationChannel.WHATSAPP,
        templateId: 'b5362b76-8215-497d-889d-6e32d013fb8a',
        payload: expect.objectContaining({
          templateName: 'queue_join',
          templateVariables: {
            guest_name: 'Neha',
            queue_position: 4,
            estimated_wait: 17,
            otp: '123456',
            status_link: 'https://taurant.onrender.com/v/the-craftery-koramangala/e/entry_1?access=token',
          },
        }),
      }),
    }));
  });

  it('maps Craftery table-ready WhatsApp to the approved fixed template', async () => {
    const { Notify } = await import('../../src/integrations/notifications');

    await Notify.tableReady(
      'venue_1',
      'entry_1',
      '9876543210',
      'Neha',
      '',
      'The Craftery by Subko',
      5,
      {
        venueSlug: 'the-craftery-koramangala',
        guestOtp: '123456',
        statusLink: 'https://taurant.onrender.com/v/the-craftery-koramangala/e/entry_1?access=token',
      },
    );

    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        venueId: 'venue_1',
        queueEntryId: 'entry_1',
        type: NotificationType.TABLE_READY,
        channel: NotificationChannel.WHATSAPP,
        templateId: '9b5bd379-904c-4936-b7d8-1a08cfd02a74',
        status: NotificationStatus.PENDING,
        payload: expect.objectContaining({
          kind: 'TABLE_READY',
          templateName: 'table_ready_v6',
          templateVariables: {
            guest_name: 'Neha',
          },
          windowMin: 5,
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

  it('does not auto-fallback to SMS when queue WhatsApp template send fails', async () => {
    envMock.USE_MOCK_NOTIFICATIONS = false;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ status: 'error', message: 'template failed' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { sendNotification } = await import('../../src/integrations/notifications');

    await sendNotification({
      venueId: 'venue_1',
      queueEntryId: 'entry_1',
      type: NotificationType.QUEUE_JOINED,
      to: '9876543210',
      message: 'fallback should stay off',
      channel: NotificationChannel.WHATSAPP,
      template: {
        id: 'b5362b76-8215-497d-889d-6e32d013fb8a',
        name: 'queue_join',
        variables: ['Neha', '4', '17', '123456', 'https://taurant.onrender.com'],
      },
      allowSmsFallback: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.notification.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: NotificationStatus.FAILED,
      }),
    }));
  });
});
