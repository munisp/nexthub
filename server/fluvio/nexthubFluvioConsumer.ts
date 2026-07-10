/**
 * nexthubFluvioConsumer.ts — NextHub Fluvio Consumer
 * ─────────────────────────────────────────────────────────────────────────────
 * Consumes real-time events from Fluvio topics that Paygate produces.
 * These are low-latency, high-frequency events that don't need Kafka durability.
 *
 * Topics consumed:
 *   paygate-tx-stream   — Real-time Paygate transaction stream for live analytics
 */

import { ENV } from "../_core/env";
import { NEXTHUB_FLUVIO_TOPICS } from "./nexthubFluvioProducer";

// ─── In-memory ring buffer for live analytics ─────────────────────────────────
const TX_RING_SIZE = 500;
const _txRingBuffer: any[] = [];

export function getTxRingBuffer() {
  return [..._txRingBuffer];
}

function pushToRingBuffer(event: any) {
  _txRingBuffer.push(event);
  if (_txRingBuffer.length > TX_RING_SIZE) {
    _txRingBuffer.shift();
  }
}

// ─── Lazy Fluvio client ───────────────────────────────────────────────────────
async function getFluvio() {
  const endpoint = (ENV as any).fluvioEndpoint;
  if (!endpoint) return null;
  try {
    const { Fluvio } = await import("@fluvio/client" as any);
    return await Fluvio.connect(endpoint);
  } catch {
    console.warn("[nexthub-fluvio-consumer] @fluvio/client not available");
    return null;
  }
}

// ─── Start consumer for Paygate transaction stream ────────────────────────────
async function startPaygateTxStreamConsumer() {
  const fluvio = await getFluvio();
  if (!fluvio) return;

  try {
    const consumer = await fluvio.partitionConsumer("paygate-tx-stream", 0);
    const stream = await consumer.createStream({ index: BigInt(0) });

    console.log("[nexthub-fluvio-consumer] Paygate TX stream consumer started");

    for await (const record of stream) {
      try {
        const payload = JSON.parse(record.valueString());
        pushToRingBuffer(payload);
      } catch {
        // Skip malformed records
      }
    }
  } catch (err) {
    console.warn("[nexthub-fluvio-consumer] TX stream consumer error:", err);
  }
}

// ─── Start all Fluvio consumers ───────────────────────────────────────────────
let _started = false;
export async function startAllFluvioConsumers() {
  if (_started) return;
  _started = true;
  try {
    // Run in background — don't await
    startPaygateTxStreamConsumer().catch(err =>
      console.warn("[nexthub-fluvio-consumer] Background consumer error:", err)
    );
    console.log("[nexthub-fluvio-consumer] All Fluvio consumers initialised");
  } catch (err) {
    console.error("[nexthub-fluvio-consumer] Failed to start Fluvio consumers:", err);
  }
}
