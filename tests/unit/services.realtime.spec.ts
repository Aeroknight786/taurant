import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRealtimeClientCounts,
  publishQueueRealtimeEvent,
  registerRealtimeClient,
} from '../../src/services/realtime.service';

function makeResponseMock() {
  let writableEnded = false;
  const writes: string[] = [];
  const response = {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn((chunk: string) => {
      writes.push(String(chunk));
      return true;
    }),
    end: vi.fn(() => {
      writableEnded = true;
    }),
    get writableEnded() {
      return writableEnded;
    },
  } as unknown as Response;

  return { response, writes };
}

describe('realtime service', () => {
  const cleanupFns: Array<() => void> = [];

  afterEach(() => {
    while (cleanupFns.length) {
      cleanupFns.pop()?.();
    }
  });

  it('registers SSE clients, publishes queue updates, and cleans up on close', () => {
    const venueClient = makeResponseMock();
    const entryClient = makeResponseMock();

    cleanupFns.push(registerRealtimeClient('venue:venue_1', venueClient.response));
    cleanupFns.push(registerRealtimeClient('entry:entry_1', entryClient.response));

    expect(getRealtimeClientCounts()).toEqual({
      'venue:venue_1': 1,
      'entry:entry_1': 1,
    });
    expect(venueClient.response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');

    publishQueueRealtimeEvent({
      type: 'ENTRY_NOTIFIED',
      venueId: 'venue_1',
      entryId: 'entry_1',
      ts: '2026-05-02T10:00:00.000Z',
    });

    expect(venueClient.writes.join('')).toContain('event: queue-update');
    expect(venueClient.writes.join('')).toContain('"type":"ENTRY_NOTIFIED"');
    expect(entryClient.writes.join('')).toContain('event: queue-update');
    expect(entryClient.writes.join('')).toContain('"entryId":"entry_1"');

    cleanupFns.pop()?.();
    cleanupFns.pop()?.();
    expect(getRealtimeClientCounts()).toEqual({});
  });
});
