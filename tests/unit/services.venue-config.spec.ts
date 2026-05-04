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
        waitEstimateDecayEnabled: true,
        waitEstimateBaseMin: 3,
        waitEstimateStepMin: 5,
        waitEstimateMaxMin: 30,
        contentMode: 'DEFAULT',
        arrivalCompletionMode: 'TABLE_ASSIGN',
        postWindowHandlingMode: 'AUTO_NO_SHOW',
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
      opsConfig: { queueDispatchMode: 'AUTO_TABLE', waitEstimateBaseMin: 10 },
    };

    expect(resolveVenueConfig(source).brandConfig.themeKey).toBe('craftery');

    const patch = buildVenueConfigPatch(source, {
      brandConfig: { tagline: 'Coffee first' },
      featureConfig: { preOrder: false },
      uiConfig: { defaultGuestTray: 'ordered' },
      opsConfig: {
        queueDispatchMode: 'MANUAL_NOTIFY',
        joinConfirmationMode: 'WEB_ONLY',
        waitEstimateStepMin: 8,
        waitEstimateMaxMin: 60,
      },
    });

    expect(patch).toEqual({
      brandConfig: expect.objectContaining({ shortName: 'Craftery', tagline: 'Coffee first' }),
      featureConfig: expect.objectContaining({ guestQueue: true, preOrder: false }),
      uiConfig: expect.objectContaining({ showContinueEntry: false, defaultGuestTray: 'ordered' }),
      opsConfig: expect.objectContaining({
        queueDispatchMode: 'MANUAL_NOTIFY',
        joinConfirmationMode: 'WEB_ONLY',
        waitEstimateBaseMin: 10,
        waitEstimateStepMin: 8,
        waitEstimateMaxMin: 60,
      }),
    });
  });

  it('defaults Craftery lab to static Subko wait estimates', async () => {
    const { resolveVenueConfig } = await import('../../src/services/venueConfig.service');

    const resolved = resolveVenueConfig({
      id: 'venue_lab',
      name: 'The Craftery by Subko Lab',
      slug: 'the-craftery-koramangala-lab',
      brandConfig: null,
      featureConfig: null,
      uiConfig: null,
      opsConfig: null,
    });

    expect(resolved.opsConfig).toMatchObject({
      guestWaitFormula: 'SUBKO_FIXED_V1',
      waitEstimateDecayEnabled: false,
      waitEstimateBaseMin: 10,
      waitEstimateStepMin: 8,
      waitEstimateMaxMin: 60,
      queueDispatchMode: 'MANUAL_NOTIFY',
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
        waitEstimateDecayEnabled: false,
        waitEstimateBaseMin: 10,
        waitEstimateStepMin: 8,
        waitEstimateMaxMin: 60,
        contentMode: 'DISABLED',
        arrivalCompletionMode: 'QUEUE_COMPLETE',
        postWindowHandlingMode: 'MANUAL_REMOVE',
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
        waitEstimateDecayEnabled: false,
        contentMode: 'DISABLED',
        arrivalCompletionMode: 'QUEUE_COMPLETE',
        postWindowHandlingMode: 'MANUAL_REMOVE',
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
      shouldHandlePostWindowManually,
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
        postWindowHandlingMode: 'MANUAL_REMOVE',
      },
    });

    expect(isManualQueueDispatchConfig(resolved)).toBe(true);
    expect(shouldSendJoinQueueNotification(resolved)).toBe(false);
    expect(shouldHandlePostWindowManually(resolved)).toBe(true);
  });

  it('supports hidden lightweight realtime lab venues with Craftery waitlist defaults', async () => {
    const {
      resolveVenueConfig,
      shouldHideVenueFromPublic,
      shouldUseLightGuestShell,
      shouldUseSseRealtime,
    } = await import('../../src/services/venueConfig.service');

    const resolved = resolveVenueConfig({
      id: 'venue_lab',
      name: 'The Craftery Lab',
      slug: 'the-craftery-koramangala-lab',
      brandConfig: { themeKey: 'craftery' },
      featureConfig: { guestQueue: true },
      uiConfig: {
        hideFromPublic: true,
        guestShellMode: 'LIGHT_WAITLIST',
      },
      opsConfig: {
        realtimeMode: 'SSE_V1',
      },
    });

    expect(shouldHideVenueFromPublic(resolved)).toBe(true);
    expect(shouldUseLightGuestShell(resolved)).toBe(true);
    expect(shouldUseSseRealtime(resolved)).toBe(true);
    expect(resolved.opsConfig).toMatchObject({
      queueDispatchMode: 'MANUAL_NOTIFY',
      guestWaitFormula: 'SUBKO_FIXED_V1',
      waitEstimateDecayEnabled: false,
      waitEstimateBaseMin: 10,
      waitEstimateStepMin: 8,
      waitEstimateMaxMin: 60,
    });
  });
});
