import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

function optionalTrimmedString(max: number) {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed || undefined;
  }, z.string().min(1).max(max).optional());
}

const CONTENT_SLOT_ORDER = ['MENU', 'MERCH', 'STORIES', 'EVENTS'] as const;

export const VenueContentSlotSchema = z.enum(CONTENT_SLOT_ORDER);
export type VenueContentSlot = z.infer<typeof VenueContentSlotSchema>;

export const VenueContentBlockPatchSchema = z.object({
  title: optionalTrimmedString(120),
  body: optionalTrimmedString(2000),
  imageUrl: z.union([z.string().url(), z.null()]).optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
}).strict();

export type VenueContentBlockPatch = z.infer<typeof VenueContentBlockPatchSchema>;

export type VenueContentBlockView = {
  slot: VenueContentSlot;
  title: string;
  body: string | null;
  imageUrl: string | null;
  isEnabled: boolean;
  sortOrder: number;
};

type VenueContentBlockRecord = {
  id: string;
  venueId: string;
  slot: VenueContentSlot;
  title: string;
  body: string | null;
  imageUrl: string | null;
  isEnabled: boolean;
  sortOrder: number;
};

const DEFAULT_BLOCKS: Record<VenueContentSlot, VenueContentBlockView> = {
  MENU: {
    slot: 'MENU',
    title: 'Menu',
    body: null,
    imageUrl: null,
    isEnabled: false,
    sortOrder: 1,
  },
  MERCH: {
    slot: 'MERCH',
    title: 'Merch',
    body: null,
    imageUrl: null,
    isEnabled: false,
    sortOrder: 2,
  },
  STORIES: {
    slot: 'STORIES',
    title: 'Stories',
    body: null,
    imageUrl: null,
    isEnabled: false,
    sortOrder: 3,
  },
  EVENTS: {
    slot: 'EVENTS',
    title: 'Events',
    body: null,
    imageUrl: null,
    isEnabled: false,
    sortOrder: 4,
  },
};

function normalizeBlock(block?: Partial<VenueContentBlockView> | null): VenueContentBlockView {
  if (!block) {
    throw new Error('Missing content block');
  }

  const fallback = DEFAULT_BLOCKS[block.slot as VenueContentSlot];
  return {
    slot: block.slot as VenueContentSlot,
    title: block.title ?? fallback.title,
    body: block.body ?? fallback.body,
    imageUrl: block.imageUrl ?? fallback.imageUrl,
    isEnabled: block.isEnabled ?? fallback.isEnabled,
    sortOrder: block.sortOrder ?? fallback.sortOrder,
  };
}

function orderBlocks(blocks: VenueContentBlockView[]): VenueContentBlockView[] {
  return [...blocks].sort((a, b) => a.sortOrder - b.sortOrder || CONTENT_SLOT_ORDER.indexOf(a.slot) - CONTENT_SLOT_ORDER.indexOf(b.slot));
}

function toPatchData(patch: VenueContentBlockPatch): Record<string, unknown> {
  return {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.body !== undefined ? { body: patch.body } : {}),
    ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl } : {}),
    ...(patch.isEnabled !== undefined ? { isEnabled: patch.isEnabled } : {}),
    ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
  };
}

async function ensureVenueExists(venueId: string): Promise<void> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true },
  });

  if (!venue) {
    throw new AppError('Venue not found', 404);
  }
}

export async function getVenueContentBlocks(venueId: string): Promise<VenueContentBlockView[]> {
  await ensureVenueExists(venueId);

  const blocks = await prisma.venueContentBlock.findMany({
    where: { venueId },
    orderBy: [{ sortOrder: 'asc' }, { slot: 'asc' }],
  });

  const bySlot = new Map<VenueContentSlot, VenueContentBlockRecord>();
  for (const block of blocks as VenueContentBlockRecord[]) {
    bySlot.set(block.slot, block);
  }

  return orderBlocks(CONTENT_SLOT_ORDER.map((slot) => {
    const block = bySlot.get(slot);
    if (!block) {
      return DEFAULT_BLOCKS[slot];
    }
    return {
      slot: block.slot,
      title: block.title,
      body: block.body,
      imageUrl: block.imageUrl,
      isEnabled: block.isEnabled,
      sortOrder: block.sortOrder,
    };
  }));
}

export async function upsertVenueContentBlock(
  venueId: string,
  slot: VenueContentSlot,
  patch: VenueContentBlockPatch,
): Promise<VenueContentBlockView> {
  await ensureVenueExists(venueId);

  const patchData = toPatchData(VenueContentBlockPatchSchema.parse(patch));
  if (!Object.keys(patchData).length) {
    throw new AppError('At least one content field must be provided', 400, 'CONTENT_UPDATE_EMPTY');
  }

  const upserted = await prisma.venueContentBlock.upsert({
    where: { venueId_slot: { venueId, slot } },
    create: {
      id: `${venueId}-${slot.toLowerCase()}`,
      venueId,
      slot,
      title: typeof patchData.title === 'string' ? patchData.title : DEFAULT_BLOCKS[slot].title,
      body: patchData.body !== undefined ? (patchData.body as string | null) : DEFAULT_BLOCKS[slot].body,
      imageUrl: patchData.imageUrl !== undefined ? (patchData.imageUrl as string | null) : DEFAULT_BLOCKS[slot].imageUrl,
      isEnabled: typeof patchData.isEnabled === 'boolean' ? patchData.isEnabled : DEFAULT_BLOCKS[slot].isEnabled,
      sortOrder: typeof patchData.sortOrder === 'number' ? patchData.sortOrder : DEFAULT_BLOCKS[slot].sortOrder,
    },
    update: patchData,
  });

  return normalizeBlock({
    slot: upserted.slot,
    title: upserted.title,
    body: upserted.body,
    imageUrl: upserted.imageUrl,
    isEnabled: upserted.isEnabled,
    sortOrder: upserted.sortOrder,
  });
}

export function getDefaultVenueContentBlock(slot: VenueContentSlot): VenueContentBlockView {
  return normalizeBlock(DEFAULT_BLOCKS[slot]);
}
