import { Request, Response, NextFunction } from 'express';
import { ok } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import {
  VenueContentBlockPatchSchema,
  VenueContentSlotSchema,
  getVenueContentBlocks,
  upsertVenueContentBlock,
} from '../services/content.service';

export async function getAdminCurrent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const blocks = await getVenueContentBlocks(req.venue!.id);
    ok(res, { blocks });
  } catch (error) {
    next(error);
  }
}

export async function patchContentBlock(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const slot = VenueContentSlotSchema.parse(String(req.params.slot || '').trim().toUpperCase());
    const patch = VenueContentBlockPatchSchema.parse(req.body);
    const block = await upsertVenueContentBlock(req.venue!.id, slot, patch);
    ok(res, block);
  } catch (error) {
    next(error);
  }
}
