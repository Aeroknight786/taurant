import { createPrismaMock } from '../helpers/mock-prisma';
import { invokeApp } from '../helpers/invoke-app';

const prismaMock = createPrismaMock();

const contentServiceMock = {
  getVenueContentBlocks: vi.fn(),
  upsertVenueContentBlock: vi.fn(),
};

vi.mock('../../src/config/database', () => ({
  prisma: prismaMock,
}));

vi.mock('../../src/services/content.service', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/content.service')>('../../src/services/content.service');
  return {
    ...actual,
    getVenueContentBlocks: contentServiceMock.getVenueContentBlocks,
    upsertVenueContentBlock: contentServiceMock.upsertVenueContentBlock,
  };
});

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.staff = { id: 'staff_1', role: 'MANAGER', venueId: 'venue_1' };
    req.venue = { id: 'venue_1', slug: 'the-craftery-koramangala' };
    next();
  },
  requireGuestAuth: (_req: any, _res: any, next: any) => next(),
  requireGuestOrStaffAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../src/middleware/venueFeature', () => ({
  requireVenueFeature: () => (_req: any, _res: any, next: any) => next(),
  resolveVenueIdFromQueueEntryParam: () => async (_req: any) => 'venue_1',
  resolveVenueIdFromPartyJoinToken: () => async (_req: any) => 'venue_1',
}));

describe('content routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns current content blocks and updates a slot', async () => {
    contentServiceMock.getVenueContentBlocks.mockResolvedValue([
      { slot: 'MENU', title: 'Current highlights', body: 'A quick look at the categories and dishes currently showing at Craftery.', imageUrl: null, isEnabled: true, sortOrder: 1 },
      { slot: 'MERCH', title: 'Craftery', body: 'Current venue touchpoints from Craftery in Bengaluru.', imageUrl: null, isEnabled: true, sortOrder: 2 },
      { slot: 'STORIES', title: 'Stories', body: null, imageUrl: null, isEnabled: false, sortOrder: 3 },
      { slot: 'EVENTS', title: 'Events', body: null, imageUrl: null, isEnabled: false, sortOrder: 4 },
    ]);
    contentServiceMock.upsertVenueContentBlock.mockResolvedValue({
      slot: 'STORIES',
      title: 'Stories',
      body: 'New body copy',
      imageUrl: 'https://cdn.example.com/story.jpg',
      isEnabled: true,
      sortOrder: 3,
    });

    const app = (await import('../../src/app')).default;

    const current = await invokeApp(app, {
      method: 'GET',
      url: '/api/v1/content/admin/current',
      headers: { authorization: 'Bearer staff-token' },
    });
    expect(current.status).toBe(200);
    expect(current.body.data.blocks).toHaveLength(4);
    expect(current.body.data.blocks.map((block: any) => block.slot)).toEqual(['MENU', 'MERCH', 'STORIES', 'EVENTS']);

    const update = await invokeApp(app, {
      method: 'PATCH',
      url: '/api/v1/content/STORIES',
      headers: { authorization: 'Bearer staff-token' },
      body: {
        body: 'New body copy',
        imageUrl: 'https://cdn.example.com/story.jpg',
        isEnabled: true,
      },
    });
    expect(update.status).toBe(200);
    expect(update.body.data).toMatchObject({
      slot: 'STORIES',
      body: 'New body copy',
      imageUrl: 'https://cdn.example.com/story.jpg',
      isEnabled: true,
    });
  });

  it('rejects invalid content slots', async () => {
    const app = (await import('../../src/app')).default;

    const response = await invokeApp(app, {
      method: 'PATCH',
      url: '/api/v1/content/BAD',
      headers: { authorization: 'Bearer staff-token' },
      body: { title: 'Bad slot' },
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});
