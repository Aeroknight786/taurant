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
    };

    expect(resolveVenueConfig(source).brandConfig.themeKey).toBe('craftery');

    const patch = buildVenueConfigPatch(source, {
      brandConfig: { tagline: 'Coffee first' },
      featureConfig: { preOrder: false },
      uiConfig: { defaultGuestTray: 'ordered' },
    });

    expect(patch).toEqual({
      brandConfig: expect.objectContaining({ shortName: 'Craftery', tagline: 'Coffee first' }),
      featureConfig: expect.objectContaining({ guestQueue: true, preOrder: false }),
      uiConfig: expect.objectContaining({ showContinueEntry: false, defaultGuestTray: 'ordered' }),
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
        supportCopy: 'Join the waitlist, track your live position, and head back to the host desk once your table is ready.',
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
        supportCopy: 'Join the waitlist, track your live position, and head back to the host desk once your table is ready.',
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
    });

    await expect(assertVenueFeatureEnabled('venue_3', 'preOrder')).rejects.toMatchObject({
      code: 'VENUE_FEATURE_DISABLED',
      message: 'Pre-orders are disabled for this venue.',
    });
  });
});
