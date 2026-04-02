import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import {
  VenueBrandConfigSchema,
  VenueFeatureConfigSchema,
  VenueOpsConfigSchema,
  VenueUiConfigSchema,
  buildVenueConfigPatch,
  mapVenueToPublicSummary,
  resolveVenueConfig,
} from './venueConfig.service';

export const CreateVenueSchema = z.object({
  name: z.string().min(2),
  address: z.string().min(5),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().length(6),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  email: z.string().email(),
  gstin: z.string().optional(),
  licenceType: z.enum(['LICENSED_BAR', 'RESTAURANT_ONLY']).default('LICENSED_BAR'),
  depositPercent: z.number().int().min(50).max(100).default(75),
  brandConfig: VenueBrandConfigSchema.optional(),
  featureConfig: VenueFeatureConfigSchema.optional(),
  uiConfig: VenueUiConfigSchema.optional(),
  opsConfig: VenueOpsConfigSchema.optional(),
});

export const UpdateVenueConfigSchema = z.object({
  depositPercent: z.number().int().min(50).max(100).optional(),
  isQueueOpen: z.boolean().optional(),
  tableReadyWindowMin: z.number().int().min(5).max(60).optional(),
  maxQueueSize: z.number().int().min(10).max(500).optional(),
  tmsProvider: z.enum(['POSIST', 'PETPOOJA', 'URBANPIPER', 'MANUAL']).optional(),
  tmsApiKey: z.string().optional(),
  tmsVenueId: z.string().optional(),
  posPlatform: z.string().optional(),
  posOutletId: z.string().optional(),
  brandConfig: VenueBrandConfigSchema.optional(),
  featureConfig: VenueFeatureConfigSchema.optional(),
  uiConfig: VenueUiConfigSchema.optional(),
  opsConfig: VenueOpsConfigSchema.optional(),
});

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function toJsonValue(value?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
  if (!value) {
    return undefined;
  }

  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  if (!entries.length) {
    return undefined;
  }

  return Object.fromEntries(entries) as Prisma.InputJsonValue;
}

export async function createVenue(data: z.infer<typeof CreateVenueSchema>) {
  const baseSlug = slugify(data.name);
  let slug = baseSlug;
  let n = 1;
  while (await prisma.venue.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${n++}`;
  }

  const {
    brandConfig,
    featureConfig,
    uiConfig,
    opsConfig,
    ...venueData
  } = data;

  return prisma.venue.create({
    data: {
      ...venueData,
      slug,
      ...(brandConfig ? { brandConfig: toJsonValue(brandConfig) } : {}),
      ...(featureConfig ? { featureConfig: toJsonValue(featureConfig) } : {}),
      ...(uiConfig ? { uiConfig: toJsonValue(uiConfig) } : {}),
      ...(opsConfig ? { opsConfig: toJsonValue(opsConfig) } : {}),
    },
  });
}

export async function getPublicVenues() {
  const venues = await prisma.venue.findMany({
    orderBy: [
      { city: 'asc' },
      { name: 'asc' },
    ],
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      isQueueOpen: true,
      brandConfig: true,
      featureConfig: true,
      uiConfig: true,
      opsConfig: true,
    },
  });

  return venues.map((venue) => mapVenueToPublicSummary(venue));
}

export async function getVenueBySlug(slug: string) {
  const venue = await prisma.venue.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      address: true,
      city: true,
      isQueueOpen: true,
      depositPercent: true,
      licenceType: true,
      maxQueueSize: true,
      tableReadyWindowMin: true,
      brandConfig: true,
      featureConfig: true,
      uiConfig: true,
      opsConfig: true,
      menuCategories: {
        where: { isVisible: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            where: { isAvailable: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
      contentBlocks: {
        orderBy: [
          { sortOrder: 'asc' },
          { slot: 'asc' },
        ],
      },
    },
  });

  if (!venue) {
    throw new AppError('Venue not found', 404);
  }

  return {
    ...venue,
    config: resolveVenueConfig(venue),
  };
}

export async function updateVenueConfig(venueId: string, data: z.infer<typeof UpdateVenueConfigSchema>) {
  const current = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      slug: true,
      brandConfig: true,
      featureConfig: true,
      uiConfig: true,
      opsConfig: true,
    },
  });

  if (!current) {
    throw new AppError('Venue not found', 404);
  }

  const {
    brandConfig,
    featureConfig,
    uiConfig,
    opsConfig,
    ...scalarConfig
  } = data;

  return prisma.venue.update({
    where: { id: venueId },
    data: {
      ...scalarConfig,
      ...buildVenueConfigPatch(current, { brandConfig, featureConfig, uiConfig, opsConfig }),
    },
  });
}

export async function getVenueStats(venueId: string) {
  const now = new Date();
  const IST_MS = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(now.getTime() + IST_MS);
  const startOfDay = new Date(
    Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()) - IST_MS,
  );

  const [queueStats, tableStats, revenueStats] = await Promise.all([
    prisma.queueEntry.aggregate({
      where: { venueId, joinedAt: { gte: startOfDay } },
      _count: { _all: true },
      _avg: { estimatedWaitMin: true },
    }),
    prisma.table.groupBy({
      by: ['status'],
      where: { venueId },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { venueId, status: 'CAPTURED', createdAt: { gte: startOfDay } },
      _sum: { amount: true, platformFeeAmount: true },
      _count: { _all: true },
    }),
  ]);

  return {
    today: {
      totalQueueJoins: queueStats._count._all,
      avgWaitMin: Math.round(queueStats._avg.estimatedWaitMin ?? 0),
      totalPayments: revenueStats._count._all,
      totalRevenuePaise: revenueStats._sum.amount ?? 0,
      platformFeePaise: revenueStats._sum.platformFeeAmount ?? 0,
    },
    tables: tableStats.reduce((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {} as Record<string, number>),
  };
}
