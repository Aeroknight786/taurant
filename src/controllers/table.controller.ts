import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import * as TableService from '../services/table.service';
import { ok, created } from '../utils/response';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

const CreateTableSchema = z.object({
  label:    z.string().min(1),
  capacity: z.number().int().min(1).max(30),
  section:  z.string().optional(),
  tmsTableId: z.string().optional(),
});

const UpdateStatusSchema = z.object({ status: z.enum(['FREE', 'OCCUPIED', 'CLEARING', 'RESERVED']) });

export async function getTables(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const tables = await TableService.getVenueTables(req.venue!.id);
    ok(res, tables);
  } catch (e) { next(e); }
}

export async function getRecentTableEvents(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const events = await TableService.getRecentVenueTableEvents(req.venue!.id);
    ok(res, events);
  } catch (e) { next(e); }
}

export async function createTable(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = CreateTableSchema.parse(req.body);
    const table = await prisma.table.create({ data: { venueId: req.venue!.id, ...data } });
    created(res, table);
  } catch (e) { next(e); }
}

export async function updateTableStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = UpdateStatusSchema.parse(req.body);
    await TableService.updateTableStatus({ tableId: req.params.tableId, venueId: req.venue!.id, status: status as any, triggeredBy: 'STAFF' });
    ok(res, { message: 'Table status updated' });
  } catch (e) { next(e); }
}

export async function getTableEvents(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const events = await prisma.tableEvent.findMany({
      where:   { table: { venueId: req.venue!.id }, tableId: req.params.tableId },
      orderBy: { createdAt: 'desc' },
      take:    50,
    });
    ok(res, events);
  } catch (e) { next(e); }
}
