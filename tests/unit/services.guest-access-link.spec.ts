import { createPrismaMock } from '../helpers/mock-prisma';
import { verifyToken } from '../../src/utils/jwt';

const prismaMock = createPrismaMock();

vi.mock('../../src/config/database', () => ({
  prisma: prismaMock,
}));

vi.mock('../../src/config/env', () => ({
  env: {
    APP_PUBLIC_URL: 'https://taurant.onrender.com',
    JWT_SECRET: 'test-secret',
    GUEST_JWT_EXPIRES_IN: '6h',
  },
}));

vi.mock('../../src/config/redis', () => ({
  redis: {},
  isRedisReady: () => false,
}));

describe('guest access link service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('issues opaque links and redeems them into active guest sessions', async () => {
    const { issueQueueAccessLink, redeemQueueAccessLink } = await import('../../src/services/guestAccessLink.service');

    prismaMock.queueEntry.findFirst.mockResolvedValueOnce({
      id: 'entry_1',
      venueId: 'venue_1',
      venue: { slug: 'the-craftery-koramangala' },
    });
    prismaMock.guestAccessLink.create.mockResolvedValue({ id: 'access_1' });
    prismaMock.guestAccessLink.findUnique.mockResolvedValueOnce({
      id: 'access_1',
      queueEntryId: 'entry_1',
      venueId: 'venue_1',
      invalidatedAt: null,
      queueEntry: {
        id: 'entry_1',
        venueId: 'venue_1',
        guestPhone: '9876543210',
        status: 'WAITING',
        completedAt: null,
        updatedAt: new Date(),
      },
    });
    prismaMock.guestAccessLink.update.mockResolvedValue({ id: 'access_1' });

    const issued = await issueQueueAccessLink({
      venueId: 'venue_1',
      queueEntryId: 'entry_1',
      messageKind: 'JOIN',
    });

    expect(issued.token).toHaveLength(43);
    expect(issued.tokenHash).toHaveLength(43);
    expect(issued.statusLink).toContain('/v/the-craftery-koramangala/e/entry_1?access=');

    const redeemed = await redeemQueueAccessLink({
      queueEntryId: 'entry_1',
      token: issued.token,
    });

    expect(redeemed.accessMode).toBe('ACTIVE');
    expect(verifyToken(redeemed.guestToken)).toMatchObject({
      kind: 'guest',
      queueEntryId: 'entry_1',
      venueId: 'venue_1',
      guestPhone: '9876543210',
    });
  });

  it('redeems closed links into read-only sessions for the 24h window', async () => {
    const { issueQueueAccessLink, redeemQueueAccessLink, resolveGuestAccessModeFromQueueEntry } = await import('../../src/services/guestAccessLink.service');

    prismaMock.queueEntry.findFirst.mockResolvedValueOnce({
      id: 'entry_2',
      venueId: 'venue_1',
      venue: { slug: 'the-craftery-koramangala' },
    });
    prismaMock.guestAccessLink.create.mockResolvedValue({ id: 'access_2' });
    prismaMock.guestAccessLink.findUnique.mockResolvedValueOnce({
      id: 'access_2',
      queueEntryId: 'entry_2',
      venueId: 'venue_1',
      invalidatedAt: null,
      queueEntry: {
        id: 'entry_2',
        venueId: 'venue_1',
        guestPhone: '9876543210',
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    prismaMock.guestAccessLink.update.mockResolvedValue({ id: 'access_2' });

    const issued = await issueQueueAccessLink({
      venueId: 'venue_1',
      queueEntryId: 'entry_2',
      messageKind: 'NOTIFY',
    });

    const redeemed = await redeemQueueAccessLink({
      queueEntryId: 'entry_2',
      token: issued.token,
    });

    expect(redeemed.accessMode).toBe('READ_ONLY');
    expect(resolveGuestAccessModeFromQueueEntry({
      status: 'COMPLETED',
      completedAt: new Date(Date.now() - 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    })).toBe('READ_ONLY');
    expect(verifyToken(redeemed.guestToken)).toMatchObject({
      kind: 'guest',
      queueEntryId: 'entry_2',
      venueId: 'venue_1',
      guestPhone: '9876543210',
    });
  });

  it('rejects access links older than the read-only window', async () => {
    const { redeemQueueAccessLink, resolveGuestAccessModeFromQueueEntry } = await import('../../src/services/guestAccessLink.service');

    expect(resolveGuestAccessModeFromQueueEntry({
      status: 'COMPLETED',
      completedAt: new Date(Date.now() - (25 * 60 * 60 * 1000)),
      updatedAt: new Date(Date.now() - (25 * 60 * 60 * 1000)),
    })).toBeNull();

    prismaMock.guestAccessLink.findUnique.mockResolvedValueOnce({
      id: 'access_3',
      queueEntryId: 'entry_3',
      venueId: 'venue_1',
      invalidatedAt: null,
      queueEntry: {
        id: 'entry_3',
        venueId: 'venue_1',
        guestPhone: '9876543210',
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - (25 * 60 * 60 * 1000)),
        updatedAt: new Date(Date.now() - (25 * 60 * 60 * 1000)),
      },
    });

    await expect(redeemQueueAccessLink({
      queueEntryId: 'entry_3',
      token: 'opaque-token',
    })).rejects.toMatchObject({
      code: 'GUEST_SESSION_EXPIRED',
      statusCode: 410,
    });
  });
});
