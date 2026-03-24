import { createPrismaMock } from '../helpers/mock-prisma';

const prismaMock = createPrismaMock();

vi.mock('../../src/config/database', () => ({
  prisma: prismaMock,
}));

describe('venue service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a unique slug when the base slug already exists', async () => {
    const { createVenue } = await import('../../src/services/venue.service');

    prismaMock.venue.findUnique
      .mockResolvedValueOnce({ id: 'venue_existing' })
      .mockResolvedValueOnce(null);
    prismaMock.venue.create.mockResolvedValue({ id: 'venue_2', slug: 'the-barrel-room-1' });

    const result = await createVenue({
      name: 'The Barrel Room',
      address: '12 Main Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      phone: '9876543210',
      email: 'venue@example.com',
      licenceType: 'LICENSED_BAR',
      depositPercent: 75,
    });

    expect(prismaMock.venue.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ slug: 'the-barrel-room-1' }),
    }));
    expect(result.slug).toBe('the-barrel-room-1');
  });

  it('calculates daily stats from IST day boundaries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T18:45:00.000Z'));

    const { getVenueStats } = await import('../../src/services/venue.service');

    prismaMock.queueEntry.aggregate.mockResolvedValue({
      _count: { _all: 14 },
      _avg: { estimatedWaitMin: 27.4 },
    });
    prismaMock.table.groupBy.mockResolvedValue([
      { status: 'FREE', _count: { _all: 6 } },
      { status: 'OCCUPIED', _count: { _all: 4 } },
    ]);
    prismaMock.payment.aggregate.mockResolvedValue({
      _count: { _all: 8 },
      _sum: { amount: 88_000, platformFeeAmount: 1_760 },
    });

    const stats = await getVenueStats('venue_1');

    expect(prismaMock.queueEntry.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        venueId: 'venue_1',
        joinedAt: expect.objectContaining({ gte: new Date('2026-03-09T18:30:00.000Z') }),
      }),
    }));
    expect(stats).toEqual({
      today: {
        totalQueueJoins: 14,
        avgWaitMin: 27,
        totalPayments: 8,
        totalRevenuePaise: 88_000,
        platformFeePaise: 1_760,
      },
      tables: {
        FREE: 6,
        OCCUPIED: 4,
      },
    });

    vi.useRealTimers();
  });

  it('returns public venue selector data and resolved config for venue reads', async () => {
    const { getPublicVenues, getVenueBySlug } = await import('../../src/services/venue.service');

    prismaMock.venue.findMany.mockResolvedValue([
      {
        id: 'venue_1',
        slug: 'the-barrel-room-koramangala',
        name: 'The Barrel Room',
        city: 'Bengaluru',
        isQueueOpen: true,
        brandConfig: null,
        featureConfig: null,
        uiConfig: null,
      },
      {
        id: 'venue_2',
        slug: 'the-craftery-koramangala',
        name: 'The Craftery by Subko',
        city: 'Bengaluru',
        isQueueOpen: true,
        brandConfig: { themeKey: 'craftery', shortName: 'Craftery', tagline: 'Waitlist · live updates · host desk' },
        featureConfig: { guestQueue: true, preOrder: false, partyShare: false, seatedOrdering: false, finalPayment: false, staffConsole: true, adminConsole: true, historyTab: true, flowLog: false, refunds: false, offlineSettle: false, bulkClear: false },
        uiConfig: { defaultGuestTray: 'ordered', supportCopy: 'Join the waitlist, track your live position, and head back to the host desk once your table is ready.' },
      },
    ]);
    prismaMock.venue.findUnique.mockResolvedValue({
      id: 'venue_2',
      slug: 'the-craftery-koramangala',
      name: 'The Craftery by Subko',
      address: '68 Koramangala',
      city: 'Bengaluru',
      isQueueOpen: true,
      depositPercent: 30,
      licenceType: 'RESTAURANT_ONLY',
      tableReadyWindowMin: 15,
      brandConfig: { themeKey: 'craftery', shortName: 'Craftery', tagline: 'Waitlist · live updates · host desk' },
      featureConfig: { guestQueue: true, preOrder: false, partyShare: false, seatedOrdering: false, finalPayment: false, staffConsole: true, adminConsole: true, historyTab: true, flowLog: false, refunds: false, offlineSettle: false, bulkClear: false },
      uiConfig: { defaultGuestTray: 'ordered', supportCopy: 'Join the waitlist, track your live position, and head back to the host desk once your table is ready.' },
      menuCategories: [],
    });

    const publicVenues = await getPublicVenues();
    expect(publicVenues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slug: 'the-barrel-room-koramangala',
        brandConfig: expect.objectContaining({ themeKey: 'default' }),
      }),
      expect.objectContaining({
        slug: 'the-craftery-koramangala',
        brandConfig: expect.objectContaining({ themeKey: 'craftery' }),
        featureConfig: expect.objectContaining({
          guestQueue: true,
          preOrder: false,
          adminConsole: true,
        }),
        uiConfig: expect.objectContaining({
          supportCopy: 'Join the waitlist, track your live position, and head back to the host desk once your table is ready.',
        }),
      }),
    ]));

    const venue = await getVenueBySlug('the-craftery-koramangala');
    expect(venue.config.brandConfig.themeKey).toBe('craftery');
    expect(venue.config.featureConfig.preOrder).toBe(false);
    expect(venue.config.featureConfig.flowLog).toBe(false);
    expect(venue.config.featureConfig.bulkClear).toBe(false);
    expect(venue.config.featureConfig.adminConsole).toBe(true);
    expect(venue.config.uiConfig.defaultGuestTray).toBe('ordered');
  });
});
