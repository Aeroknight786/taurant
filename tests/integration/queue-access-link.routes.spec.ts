import { createPrismaMock } from '../helpers/mock-prisma';
import { invokeApp } from '../helpers/invoke-app';

const prismaMock = createPrismaMock();

const guestAccessMock = {
  redeemQueueAccessLink: vi.fn(),
};

vi.mock('../../src/config/database', () => ({
  prisma: prismaMock,
}));

vi.mock('../../src/services/guestAccessLink.service', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/guestAccessLink.service')>('../../src/services/guestAccessLink.service');
  return {
    ...actual,
    redeemQueueAccessLink: guestAccessMock.redeemQueueAccessLink,
  };
});

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireGuestAuth: (_req: any, _res: any, next: any) => next(),
  requireGuestMutationAccess: (_req: any, _res: any, next: any) => next(),
  requireGuestOrStaffAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../src/middleware/venueFeature', () => ({
  requireVenueFeature: () => (_req: any, _res: any, next: any) => next(),
  resolveVenueIdFromQueueEntryParam: () => async () => 'venue_1',
  resolveVenueIdFromPartyJoinToken: () => async () => 'venue_1',
}));

describe('queue access-link routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redeems access links through the queue route', async () => {
    guestAccessMock.redeemQueueAccessLink.mockResolvedValue({
      queueEntryId: 'entry_1',
      venueId: 'venue_1',
      accessMode: 'ACTIVE',
      guestToken: 'guest-token',
      queueEntryStatus: 'WAITING',
    });

    const app = (await import('../../src/app')).default;

    const response = await invokeApp(app, {
      method: 'POST',
      url: '/api/v1/queue/entry_1/access-link/redeem',
      body: { token: 'opaque-token' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      queueEntryId: 'entry_1',
      accessMode: 'ACTIVE',
      guestToken: 'guest-token',
    });
    expect(guestAccessMock.redeemQueueAccessLink).toHaveBeenCalledWith({
      queueEntryId: 'entry_1',
      token: 'opaque-token',
    });
  });
});
