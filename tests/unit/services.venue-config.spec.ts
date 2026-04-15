import { createPrismaMock } from '../helpers/mock-prisma';

const prismaMock = createPrismaMock();

vi.mock('../../src/config/database', () => ({
  prisma: prismaMock,
}));

describe('venue config service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves defaults when persisted config is absent', async () => {
    const { resolveVenueConfig } = await import('../../src/services/venueConfig.service');

    const resolved = resolveVenueConfig({
      id: 'venue_1',
      name: 'The Barrel Room',
      slug: 'the-barrel-room-koramangala',
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: null,
    });

    expect(resolved).toMatchObject({
      brandConfig: {
        displayName: 'The Barrel Room',
        shortName: 'The Barrel Room',
        themeKey: 'default',
        themeColor: '#141210',
      },
      featureConfig: {
        guestQueue: true,
        preOrder: true,
        partyShare: true,
        adminConsole: true,
      },
      uiConfig: {
        landingMode: 'venue',
        defaultGuestTray: 'menu',
        showContinueEntry: true,
        showQueuePosition: true,
      },
      opsConfig: {
        queueDispatchMode: 'AUTO_TABLE',
        tableSourceMode: 'MANUAL',
        joinConfirmationMode: 'WHATSAPP',
        readyNotificationChannels: ['WHATSAPP'],
        readyReminderEnabled: false,
        readyReminderOffsetMin: 1,
        expiryNotificationEnabled: false,
        guestWaitFormula: 'LEGACY_TURN_HEURISTIC',
        contentMode: 'DEFAULT',
      },
    });
  });

  it('preserves explicit theme config and merges partial config patches', async () => {
    const { buildVenueConfigPatch, resolveVenueConfig } = await import('../../src/services/venueConfig.service');

    const source = {
      id: 'venue_2',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      brandConfig: { shortName: 'Craftery', themeKey: 'craftery' },
      featureConfig: { guestQueue: true, preOrder: true },
      uiConfig: { showContinueEntry: false },
      opsConfig: { queueDispatchMode: 'AUTO_TABLE' },
    };

    expect(resolveVenueConfig(source).brandConfig.themeKey).toBe('craftery');

    const patch = buildVenueConfigPatch(source, {
      brandConfig: { tagline: 'Coffee first' },
      featureConfig: { preOrder: false },
      uiConfig: { defaultGuestTray: 'ordered' },
      opsConfig: { queueDispatchMode: 'MANUAL_NOTIFY', joinConfirmationMode: 'WEB_ONLY' },
    });

    expect(patch).toEqual({
      brandConfig: expect.objectContaining({ shortName: 'Craftery', tagline: 'Coffee first' }),
      featureConfig: expect.objectContaining({ guestQueue: true, preOrder: false }),
      uiConfig: expect.objectContaining({ showContinueEntry: false, defaultGuestTray: 'ordered' }),
      opsConfig: expect.objectContaining({ queueDispatchMode: 'MANUAL_NOTIFY', joinConfirmationMode: 'WEB_ONLY' }),
    });
  });

  it('resolves Craftery queue-only config without re-enabling hidden modules', async () => {
    const { resolveVenueConfig } = await import('../../src/services/venueConfig.service');

    const resolved = resolveVenueConfig({
      id: 'venue_subko',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      brandConfig: {
        shortName: 'Craftery',
        tagline: 'Waitlist · live updates · host desk',
        themeKey: 'craftery',
      },
      featureConfig: {
        guestQueue: true,
        staffConsole: true,
        adminConsole: true,
        historyTab: true,
        preOrder: false,
        partyShare: false,
        seatedOrdering: false,
        finalPayment: false,
        flowLog: false,
        refunds: false,
        offlineSettle: false,
        bulkClear: false,
      },
      uiConfig: {
        defaultGuestTray: 'ordered',
        showQueuePosition: true,
        supportCopy: 'Join the waitlist, keep your phone nearby, and wait for the host call when your turn comes up.',
      },
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        tableSourceMode: 'DISABLED',
        joinConfirmationMode: 'WEB_ONLY',
        readyNotificationChannels: ['WHATSAPP', 'IVR'],
        readyReminderEnabled: true,
        readyReminderOffsetMin: 1,
        expiryNotificationEnabled: false,
        guestWaitFormula: 'SUBKO_FIXED_V1',
        contentMode: 'DISABLED',
        arrivalCompletionMode: 'QUEUE_COMPLETE',
      },
    });

    expect(resolved).toMatchObject({
      brandConfig: {
        shortName: 'Craftery',
        tagline: 'Waitlist · live updates · host desk',
        themeKey: 'craftery',
      },
      featureConfig: {
        guestQueue: true,
        staffConsole: true,
        adminConsole: true,
        historyTab: true,
        preOrder: false,
        partyShare: false,
        seatedOrdering: false,
        finalPayment: false,
        flowLog: false,
        refunds: false,
        offlineSettle: false,
        bulkClear: false,
      },
      uiConfig: {
        defaultGuestTray: 'ordered',
        showQueuePosition: true,
        supportCopy: 'Join the waitlist, keep your phone nearby, and wait for the host call when your turn comes up.',
      },
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        tableSourceMode: 'DISABLED',
        joinConfirmationMode: 'WEB_ONLY',
        readyNotificationChannels: ['WHATSAPP', 'IVR'],
        readyReminderEnabled: true,
        readyReminderOffsetMin: 1,
        expiryNotificationEnabled: false,
        guestWaitFormula: 'SUBKO_FIXED_V1',
        contentMode: 'DISABLED',
        arrivalCompletionMode: 'QUEUE_COMPLETE',
      },
    });
  });

  it('rejects invalid config shapes and disabled features surface a stable code', async () => {
    const {
      VenueBrandConfigSchema,
      assertVenueFeatureEnabled,
    } = await import('../../src/services/venueConfig.service');

    expect(() => VenueBrandConfigSchema.parse({ themeKey: 'wild' })).toThrow();

    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_3',
      name: 'No Preorder Venue',
      slug: 'no-preorder',
      brandConfig: null,
      featureConfig: { preOrder: false },
      uiConfig: null,
      opsConfig: null,
    });

    await expect(assertVenueFeatureEnabled('venue_3', 'preOrder')).rejects.toMatchObject({
      code: 'VENUE_FEATURE_DISABLED',
      message: 'Pre-orders are disabled for this venue.',
    });
  });

  it('exposes manual-dispatch helpers from resolved ops config', async () => {
    const {
      isManualQueueDispatchConfig,
      shouldSendJoinQueueNotification,
      resolveVenueConfig,
    } = await import('../../src/services/venueConfig.service');

    const resolved = resolveVenueConfig({
      id: 'venue_subko',
      name: 'The Craftery by Subko',
      slug: 'the-craftery-koramangala',
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        joinConfirmationMode: 'WEB_ONLY',
        readyNotificationChannels: ['WHATSAPP', 'IVR'],
      },
    });

    expect(isManualQueueDispatchConfig(resolved)).toBe(true);
    expect(shouldSendJoinQueueNotification(resolved)).toBe(false);
  });
});
