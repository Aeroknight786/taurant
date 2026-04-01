import { createPrismaMock } from '../helpers/mock-prisma';

const prismaMock = createPrismaMock();

vi.mock('../../src/config/database', () => ({
  prisma: prismaMock,
}));

describe('content service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns fixed slots with defaults when rows are missing', async () => {
    const { getVenueContentBlocks } = await import('../../src/services/content.service');

    prismaMock.venue.findUnique.mockResolvedValue({ id: 'venue_1' });
    prismaMock.venueContentBlock.findMany.mockResolvedValue([
      {
        id: 'block_1',
        venueId: 'venue_1',
        slot: 'MENU',
        title: 'Menu highlights',
        body: 'Fresh menu highlights.',
        imageUrl: null,
        isEnabled: true,
        sortOrder: 2,
      },
    ]);

    const blocks = await getVenueContentBlocks('venue_1');

    expect(blocks).toEqual([
      { slot: 'MENU', title: 'Menu highlights', body: 'Fresh menu highlights.', imageUrl: null, isEnabled: true, sortOrder: 2 },
      { slot: 'MERCH', title: 'Merch', body: null, imageUrl: null, isEnabled: false, sortOrder: 2 },
      { slot: 'STORIES', title: 'Stories', body: null, imageUrl: null, isEnabled: false, sortOrder: 3 },
      { slot: 'EVENTS', title: 'Events', body: null, imageUrl: null, isEnabled: false, sortOrder: 4 },
    ]);
  });

  it('upserts a slot using URL image data and preserves defaults for omitted fields', async () => {
    const { upsertVenueContentBlock } = await import('../../src/services/content.service');

    prismaMock.venue.findUnique.mockResolvedValue({ id: 'venue_1' });
    prismaMock.venueContentBlock.findUnique.mockResolvedValue(null);
    prismaMock.venueContentBlock.upsert.mockResolvedValue({
      slot: 'STORIES',
      title: 'Stories',
      body: 'House stories',
      imageUrl: 'https://cdn.example.com/story.jpg',
      isEnabled: true,
      sortOrder: 3,
    });

    const block = await upsertVenueContentBlock('venue_1', 'STORIES', {
      body: 'House stories',
      imageUrl: 'https://cdn.example.com/story.jpg',
      isEnabled: true,
    });

    expect(prismaMock.venueContentBlock.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { venueId_slot: { venueId: 'venue_1', slot: 'STORIES' } },
      create: expect.objectContaining({
        venueId: 'venue_1',
        slot: 'STORIES',
        title: 'Stories',
        body: 'House stories',
        imageUrl: 'https://cdn.example.com/story.jpg',
        isEnabled: true,
        sortOrder: 3,
      }),
      update: expect.objectContaining({
        body: 'House stories',
        imageUrl: 'https://cdn.example.com/story.jpg',
        isEnabled: true,
      }),
    }));
    expect(block).toEqual({
      slot: 'STORIES',
      title: 'Stories',
      body: 'House stories',
      imageUrl: 'https://cdn.example.com/story.jpg',
      isEnabled: true,
      sortOrder: 3,
    });
  });

  it('rejects empty content patches and invalid slots', async () => {
    const { upsertVenueContentBlock, VenueContentSlotSchema } = await import('../../src/services/content.service');

    prismaMock.venue.findUnique.mockResolvedValue({ id: 'venue_1' });

    expect(() => VenueContentSlotSchema.parse('BAD')).toThrow();
    await expect(upsertVenueContentBlock('venue_1', 'MENU', {})).rejects.toMatchObject({
      code: 'CONTENT_UPDATE_EMPTY',
    });
  });
});
