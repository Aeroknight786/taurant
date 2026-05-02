import { Response } from 'express';
import { logger } from '../config/logger';

type RealtimeScope = `entry:${string}` | `venue:${string}`;

type RealtimeClient = {
  id: string;
  scope: RealtimeScope;
  res: Response;
  heartbeatId: NodeJS.Timeout;
};

export type QueueRealtimeEvent = {
  type: string;
  venueId: string;
  entryId?: string;
  ts?: string;
};

const clientsByScope = new Map<RealtimeScope, Map<string, RealtimeClient>>();
let nextClientId = 1;

function writeSse(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function registerRealtimeClient(scope: RealtimeScope, res: Response): () => void {
  const clientId = String(nextClientId++);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let scopeClients = clientsByScope.get(scope);
  if (!scopeClients) {
    scopeClients = new Map<string, RealtimeClient>();
    clientsByScope.set(scope, scopeClients);
  }

  const heartbeatId = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 25_000);

  const client: RealtimeClient = {
    id: clientId,
    scope,
    res,
    heartbeatId,
  };

  scopeClients.set(clientId, client);
  writeSse(res, 'connected', { scope, ts: new Date().toISOString() });

  return () => {
    clearInterval(heartbeatId);
    const activeClients = clientsByScope.get(scope);
    activeClients?.delete(clientId);
    if (activeClients && activeClients.size === 0) {
      clientsByScope.delete(scope);
    }
    if (!res.writableEnded) {
      res.end();
    }
  };
}

function publishToScope(scope: RealtimeScope, event: QueueRealtimeEvent): void {
  const clients = clientsByScope.get(scope);
  if (!clients?.size) {
    return;
  }

  for (const client of clients.values()) {
    try {
      writeSse(client.res, 'queue-update', event);
    } catch (error) {
      logger.warn('SSE queue update write failed', {
        scope,
        clientId: client.id,
        error: String(error),
      });
    }
  }
}

export function publishQueueRealtimeEvent(event: QueueRealtimeEvent): void {
  const payload = {
    ...event,
    ts: event.ts ?? new Date().toISOString(),
  };

  publishToScope(`venue:${payload.venueId}`, payload);
  if (payload.entryId) {
    publishToScope(`entry:${payload.entryId}`, payload);
  }
}

export function getRealtimeClientCounts(): Record<string, number> {
  return Object.fromEntries(
    Array.from(clientsByScope.entries()).map(([scope, clients]) => [scope, clients.size]),
  );
}
