import { invokeApp } from '../helpers/invoke-app';

const {
  prismaMock,
  venueServiceMock,
  tableServiceMock,
  venueFeatureState,
} = vi.hoisted(() => ({
  prismaMock: {
    venue: {
      findUnique: vi.fn(),
    },
    menuCategory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    menuItem: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    table: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    tableEvent: {
      findMany: vi.fn(),
    },
  },
  venueServiceMock: {
    createVenue: vi.fn(),
    getPublicVenues: vi.fn(),
    getVenueBySlug: vi.fn(),
    updateVenueConfig: vi.fn(),
    getVenueStats: vi.fn(),
  },
  tableServiceMock: {
    getVenueTables: vi.fn(),
    getRecentVenueTableEvents: vi.fn(),
    updateTableStatus: vi.fn(),
  },
  venueFeatureState: {
    disabledFeatures: new Set<string>(),
  },
}));

vi.mock('../../src/config/database', () => ({
  prisma: prismaMock,
}));

vi.mock('../../src/services/venue.service', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/venue.service')>('../../src/services/venue.service');
  return {
    ...actual,
    createVenue: venueServiceMock.createVenue,
    getPublicVenues: venueServiceMock.getPublicVenues,
    getVenueBySlug: venueServiceMock.getVenueBySlug,
    updateVenueConfig: venueServiceMock.updateVenueConfig,
    getVenueStats: venueServiceMock.getVenueStats,
  };
});
vi.mock('../../src/services/table.service', () => tableServiceMock);
vi.mock('../../src/middleware/venueFeature', () => ({
  requireVenueFeature: (feature: string) => (req: any, res: any, next: any) => {
    if (venueFeatureState.disabledFeatures.has(feature)) {
      res.status(403).json({
        success: false,
        error: `${feature} disabled`,
        code: 'VENUE_FEATURE_DISABLED',
      });
      return;
    }
    next();
  },
  resolveVenueIdFromQueueEntryParam: () => async () => 'venue_1',
  resolveVenueIdFromPartyJoinToken: () => async () => 'venue_1',
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const authHeader = req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const venueSlug = req.header('x-venue-slug') || 'the-barrel-room-koramangala';
    let opsConfig = undefined;
    try {
      opsConfig = req.header('x-venue-ops-config') ? JSON.parse(req.header('x-venue-ops-config')) : undefined;
    } catch (_error) {
      opsConfig = undefined;
    }
    req.staff = {
      id: authHeader.slice('Bearer '.length),
      role: 'MANAGER',
      venueId: 'venue_1',
    };
    req.venue = { id: 'venue_1', slug: venueSlug, opsConfig };
    next();
  },
  requireGuestAuth: (req: any, res: any, next: any) => {
    req.guest = { queueEntryId: 'entry_1', venueId: 'venue_1', guestPhone: '9876543210' };
    next();
  },
  requireGuestMutationAccess: (_req: any, _res: any, next: any) => next(),
  requireGuestOrStaffAuth: (req: any, res: any, next: any) => {
    req.staff = { id: 'staff_1', role: 'MANAGER', venueId: 'venue_1' };
    req.venue = { id: 'venue_1', slug: 'the-barrel-room-koramangala' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

describe('venue, menu, and table routes', () => {
  const authHeader = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeEach(() => {
    vi.clearAllMocks();
    venueFeatureState.disabledFeatures.clear();
  });

  it('covers venue onboarding, guest venue read, stats, and config update', async () => {
    venueServiceMock.createVenue.mockResolvedValue({ id: 'venue_2', slug: 'new-venue' });
    venueServiceMock.getPublicVenues.mockResolvedValue([{ id: 'venue_1', slug: 'the-barrel-room-koramangala' }]);
    venueServiceMock.getVenueBySlug.mockResolvedValue({
      id: 'venue_1',
      slug: 'the-barrel-room-koramangala',
      contentBlocks: [
        { slot: 'MENU', title: 'Menu highlights', body: 'A quick menu view', imageUrl: null, isEnabled: true, sortOrder: 1 },
        { slot: 'MERCH', title: 'Merch', body: 'House merch', imageUrl: null, isEnabled: true, sortOrder: 2 },
      ],
      config: {
        brandConfig: { themeKey: 'default' },
        featureConfig: { guestQueue: true, adminConsole: true },
        uiConfig: { landingMode: 'venue', showQueuePosition: false },
      },
    });
    venueServiceMock.getVenueStats.mockResolvedValue({ today: { totalQueueJoins: 3 } });
    venueServiceMock.updateVenueConfig.mockResolvedValue({ id: 'venue_1', isQueueOpen: true });

    const app = (await import('../../src/app')).default;

    expect((await invokeApp(app, {
      method: 'POST',
      url: '/api/v1/venues',
      headers: { 'x-flock-onboarding-token': process.env.ONBOARDING_TOKEN! },
      body: {
        name: 'New Venue',
        address: '12 Main Street',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        phone: '9876543210',
        email: 'new@example.com',
      },
    })).status).toBe(201);

    expect((await invokeApp(app, {
      method: 'GET',
      url: '/api/v1/venues/public',
    })).status).toBe(200);

    const venueRead = await invokeApp(app, {
      method: 'GET',
      url: '/api/v1/venues/the-barrel-room-koramangala',
    });
    expect(venueRead.status).toBe(200);
    expect(venueRead.body.data.config.uiConfig.showQueuePosition).toBe(false);
    expect(venueRead.body.data.contentBlocks).toEqual([
      expect.objectContaining({ slot: 'MENU', isEnabled: true }),
      expect.objectContaining({ slot: 'MERCH', isEnabled: true }),
    ]);

    expect((await invokeApp(app, {
      method: 'GET',
      url: '/api/v1/venues/stats/today',
      headers: authHeader('staff-venue'),
    })).status).toBe(200);

    expect((await invokeApp(app, {
      method: 'PATCH',
      url: '/api/v1/venues/config',
      headers: authHeader('staff-venue'),
      body: { depositPercent: 80 },
    })).status).toBe(200);
  });

  it('covers menu admin/current, guest menu read, and CRUD endpoints', async () => {
    prismaMock.venue.findUnique.mockResolvedValue({ id: 'venue_1' });
    prismaMock.menuCategory.findMany.mockResolvedValue([{ id: 'cat_1', items: [] }]);
    prismaMock.menuCategory.findFirst.mockResolvedValue({ id: 'cat_1' });
    prismaMock.menuCategory.create.mockResolvedValue({ id: 'cat_2', name: 'Specials' });
    prismaMock.menuItem.findFirst
      .mockResolvedValueOnce({ id: 'item_1', venueId: 'venue_1', isAvailable: true })
      .mockResolvedValueOnce({ id: 'item_1', venueId: 'venue_1', isAvailable: true })
      .mockResolvedValueOnce({ id: 'item_1', venueId: 'venue_1', isAvailable: false });
    prismaMock.menuItem.create.mockResolvedValue({ id: 'item_1' });
    prismaMock.menuItem.update.mockResolvedValue({ id: 'item_1', isAvailable: false });
    prismaMock.menuItem.delete.mockResolvedValue({ id: 'item_1' });

    const app = (await import('../../src/app')).default;

    expect((await invokeApp(app, {
      method: 'GET',
      url: '/api/v1/menu/admin/current',
      headers: authHeader('staff-menu-read'),
    })).status).toBe(200);

    expect((await invokeApp(app, {
      method: 'GET',
      url: '/api/v1/menu/venue_1',
    })).status).toBe(200);

    expect((await invokeApp(app, {
      method: 'POST',
      url: '/api/v1/menu/categories',
      headers: authHeader('staff-menu-write-a'),
      body: { name: 'Specials', sortOrder: 1 },
    })).status).toBe(201);

    expect((await invokeApp(app, {
      method: 'POST',
      url: '/api/v1/menu/items',
      headers: authHeader('staff-menu-write-a'),
      body: { categoryId: 'cat_1', name: 'Test Item', priceExGst: 1000, gstPercent: 5 },
    })).status).toBe(201);

    expect((await invokeApp(app, {
      method: 'PATCH',
      url: '/api/v1/menu/items/item_1',
      headers: authHeader('staff-menu-write-a'),
      body: { name: 'Updated Item' },
    })).status).toBe(200);

    expect((await invokeApp(app, {
      method: 'PATCH',
      url: '/api/v1/menu/items/item_1/toggle',
      headers: authHeader('staff-menu-write-a'),
    })).status).toBe(200);

    expect((await invokeApp(app, {
      method: 'DELETE',
      url: '/api/v1/menu/items/item_1',
      headers: authHeader('staff-menu-write-b'),
    })).status).toBe(200);
  });

  it('rejects disabled admin-console routes with a stable venue feature code', async () => {
    venueFeatureState.disabledFeatures.add('adminConsole');
    const app = (await import('../../src/app')).default;

    const response = await invokeApp(app, {
      method: 'GET',
      url: '/api/v1/menu/admin/current',
      headers: authHeader('staff-menu-read'),
    });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('VENUE_FEATURE_DISABLED');
  });

  it('covers table list, creation, event feeds, and status updates', async () => {
    tableServiceMock.getVenueTables.mockResolvedValue([{ id: 'table_1' }]);
    tableServiceMock.getRecentVenueTableEvents.mockResolvedValue([{ id: 'event_1' }]);
    tableServiceMock.updateTableStatus.mockResolvedValue(undefined);
    prismaMock.table.create.mockResolvedValue({ id: 'table_2', label: 'T2' });
    prismaMock.tableEvent.findMany.mockResolvedValue([{ id: 'event_2' }]);

    const app = (await import('../../src/app')).default;

    expect((await invokeApp(app, {
      method: 'GET',
      url: '/api/v1/tables',
      headers: authHeader('staff-table-read'),
    })).status).toBe(200);

    expect((await invokeApp(app, {
      method: 'POST',
      url: '/api/v1/tables',
      headers: authHeader('staff-table-write'),
      body: { label: 'T2', capacity: 4 },
    })).status).toBe(201);

    expect((await invokeApp(app, {
      method: 'GET',
      url: '/api/v1/tables/events/recent',
      headers: authHeader('staff-table-read'),
    })).status).toBe(200);

    expect((await invokeApp(app, {
      method: 'PATCH',
      url: '/api/v1/tables/table_1/status',
      headers: authHeader('staff-table-write'),
      body: { status: 'FREE' },
    })).status).toBe(200);

    expect((await invokeApp(app, {
      method: 'GET',
      url: '/api/v1/tables/table_1/events',
      headers: authHeader('staff-table-read'),
    })).status).toBe(200);
  });

  it('rejects table routes when table management is disabled for the venue', async () => {
    const app = (await import('../../src/app')).default;

    const response = await invokeApp(app, {
      method: 'GET',
      url: '/api/v1/tables',
      headers: {
        ...authHeader('staff-table-read'),
        'x-venue-slug': 'the-craftery-koramangala',
        'x-venue-ops-config': JSON.stringify({
          queueDispatchMode: 'MANUAL_NOTIFY',
          tableSourceMode: 'DISABLED',
          arrivalCompletionMode: 'QUEUE_COMPLETE',
          contentMode: 'DISABLED',
        }),
      },
    });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('VENUE_FEATURE_DISABLED');
  });
});
