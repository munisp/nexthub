/**
 * fxSseRegistry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-Sent Events registry for live FX rate streaming.
 * Maintains a set of active SSE response objects and broadcasts
 * rate updates to all connected clients.
 */

import type { Response } from "express";

// Active SSE connections
const _subscribers = new Set<Response>();

/**
 * Register a new SSE subscriber (called when a client connects to /api/fx/stream).
 */
export function addFxSseSubscriber(res: Response): void {
  _subscribers.add(res);
  res.on("close", () => _subscribers.delete(res));
  res.on("error", () => _subscribers.delete(res));
}

/**
 * Broadcast an FX rate update to all connected SSE clients.
 */
export function broadcastFxRateUpdate(data: {
  sourceCurrency: string;
  targetCurrency: string;
  rate: number;
  provider: string;
  validFrom: string;
  validTo: string;
  timestamp: string;
}): void {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of _subscribers) {
    try {
      res.write(payload);
    } catch {
      _subscribers.delete(res);
    }
  }
}

/**
 * Return the number of active SSE subscribers.
 */
export function getFxSseSubscriberCount(): number {
  return _subscribers.size;
}
