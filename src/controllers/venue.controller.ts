import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import * as VenueService from '../services/venue.service';
import { ok, created } from '../utils/response';

export async function createVenue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const venue = await VenueService.createVenue(VenueService.CreateVenueSchema.parse(req.body));
    created(res, venue);
  } catch (e) { next(e); }
}

export async function getVenueBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const venue = await VenueService.getVenueBySlug(req.params.slug);
    ok(res, venue);
  } catch (e) { next(e); }
}

export async function updateVenueConfig(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const venue = await VenueService.updateVenueConfig(req.venue!.id, VenueService.UpdateVenueConfigSchema.parse(req.body));
    ok(res, venue);
  } catch (e) { next(e); }
}

export async function getVenueStats(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await VenueService.getVenueStats(req.venue!.id);
    ok(res, stats);
  } catch (e) { next(e); }
}
