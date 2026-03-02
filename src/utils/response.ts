import { Response } from 'express';
import { ApiResponse } from '../types';

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>, status = 200): void {
  const body: ApiResponse<T> = { success: true, data, ...(meta ? { meta } : {}) };
  res.status(status).json(body);
}

export function created<T>(res: Response, data: T): void {
  ok(res, data, undefined, 201);
}

export function fail(res: Response, message: string, status = 400, code?: string): void {
  const body: ApiResponse = { success: false, error: message, ...(code ? { code } : {}) };
  res.status(status).json(body);
}

export function notFound(res: Response, resource = 'Resource'): void {
  fail(res, `${resource} not found`, 404, 'NOT_FOUND');
}

export function unauthorized(res: Response, msg = 'Unauthorized'): void {
  fail(res, msg, 401, 'UNAUTHORIZED');
}

export function forbidden(res: Response, msg = 'Forbidden'): void {
  fail(res, msg, 403, 'FORBIDDEN');
}
