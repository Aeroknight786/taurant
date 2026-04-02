import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import * as QueueService from '../services/queue.service';
import { getFlowEvents } from '../services/orderFlowEvent.service';
import { ok, created } from '../utils/response';
import { AppError } from '../middleware/errorHandler';

const JoinSchema = z.object({
  venueId:           z.string().min(1),
  guestName:         z.string().min(1).max(80),
  guestPhone:        z.string().regex(/^[6-9]\d{9}$/),
  partySize:         z.number().int().min(1).max(20),
  seatingPreference: z.enum(['INDOOR', 'OUTDOOR', 'FIRST_AVAILABLE']).default('FIRST_AVAILABLE'),
  guestNotes:        z.string().trim().max(240).optional(),
});

const SeatSchema = z.object({
  otp:     z.string().length(6),
  tableId: z.string().min(1).optional(),
});

const NotifySchema = z.object({
  windowMin: z.number().int().min(1).max(60).optional(),
});

const ReorderSchema = z.object({
  direction: z.enum(['UP', 'DOWN']),
});

const SessionSchema = z.object({
  otp: z.string().length(6),
});

export async function joinQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await QueueService.joinQueue(JoinSchema.parse(req.body));
    created(res, result);
  } catch (e) { next(e); }
}

export async function getVenueQueue(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entries = await QueueService.getVenueQueue(req.venue!.id);
    ok(res, entries, { count: entries.length });
  } catch (e) { next(e); }
}

export async function getQueueEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.guest || req.guest.queueEntryId !== req.params.entryId) {
      res.status(403).json({ success: false, error: 'Guest session does not match this queue entry' });
      return;
    }
    const entry = await QueueService.getQueueEntry(req.params.entryId);
    ok(res, entry);
  } catch (e) { next(e); }
}

export async function reissueGuestSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { otp } = SessionSchema.parse(req.body);
    const session = await QueueService.reissueGuestSession(req.params.entryId, otp);
    ok(res, session);
  } catch (e) { next(e); }
}

export async function seatGuest(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { otp, tableId } = SeatSchema.parse(req.body);
    const result = await QueueService.seatGuest({ venueId: req.venue!.id, otp, tableId });
    ok(res, result);
  } catch (e) { next(e); }
}

export async function notifyEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { windowMin } = NotifySchema.parse(req.body ?? {});
    const result = await QueueService.notifyQueueEntry(req.params.entryId, req.venue!.id, windowMin);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function nudgeEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await QueueService.nudgeQueueEntry(req.params.entryId, req.venue!.id);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function reorderEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { direction } = ReorderSchema.parse(req.body);
    const result = await QueueService.reorderQueueEntry(req.params.entryId, req.venue!.id, direction, req.staff?.id);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function prioritizeEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await QueueService.prioritizeQueueEntry(req.params.entryId, req.venue!.id, req.staff?.id);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function cancelEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await QueueService.cancelQueueEntry(req.params.entryId, req.venue!.id);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function leaveEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.guest || req.guest.queueEntryId !== req.params.entryId) {
      throw new AppError('Guest session does not match this queue entry', 403, 'GUEST_SESSION_MISMATCH');
    }

    const result = await QueueService.leaveQueueEntry(req.params.entryId, req.guest.venueId, req.guest.guestPhone);
    ok(res, result);
  } catch (e) { next(e); }
}

export async function checkoutEntry(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await QueueService.completeQueueEntry(req.params.entryId);
    ok(res, { checkedOut: true });
  } catch (e) { next(e); }
}

export async function getEntryFlowEvents(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const events = await getFlowEvents(req.params.entryId);
    ok(res, events, { count: events.length });
  } catch (e) { next(e); }
}

export async function getRecentHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const entries = await QueueService.getRecentCompletedEntries(req.venue!.id);
    ok(res, entries, { count: entries.length });
  } catch (e) { next(e); }
}

export async function clearAllEntries(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await QueueService.clearAllQueueEntries(req.venue!.id);
    ok(res, result);
  } catch (e) { next(e); }
}
