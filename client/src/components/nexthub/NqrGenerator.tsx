/**
 * NqrGenerator.tsx — NQR QR Code Generator with Real-Time Status
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates an EMVCo NQR code for a merchant payment request.
 * Displays the QR image and subscribes to the SSE status stream so the UI
 * updates in real-time when the payer scans and pays.
 *
 * Performance notes:
 *   - QR image is rendered server-side (PNG data URL) — no client-side QR lib needed
 *   - SSE connection replaces polling — single long-lived HTTP connection
 *   - React.memo prevents re-renders when parent state changes
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";

interface NqrGeneratorProps {
  merchantId: string;
  merchantName: string;
  amountKobo?: number;
  currency?: string;
  description?: string;
  onPaymentReceived?: (data: { reference: string; paidAmountKobo: number }) => void;
}

type QrStatus = "IDLE" | "GENERATING" | "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "ERROR";

const NqrGenerator: React.FC<NqrGeneratorProps> = React.memo(({
  merchantId,
  merchantName,
  amountKobo,
  currency = "NGN",
  description,
  onPaymentReceived,
}) => {
  const [status, setStatus] = useState<QrStatus>("IDLE");
  const [reference, setReference] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generateQr = trpc.nibssNip.nqrGenerate.useMutation({
    onSuccess: (data: any) => {
      setReference(data.reference);
      setQrImageUrl(data.qrImageUrl);
      setExpiresAt(new Date(data.expiresAt));
      setStatus("PENDING");
    },
    onError: (err: any) => {
      setError(err.message);
      setStatus("ERROR");
    },
  });

  // Subscribe to SSE status stream
  useEffect(() => {
    if (!reference || status !== "PENDING") return;

    const sse = new EventSource(`/api/v1/nqr/status-stream/${reference}`);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "PAID") {
          setStatus("PAID");
          onPaymentReceived?.({ reference: data.reference, paidAmountKobo: data.paidAmountKobo ?? 0 });
          sse.close();
        } else if (data.status === "EXPIRED" || data.status === "CANCELLED") {
          setStatus(data.status as QrStatus);
          sse.close();
        }
      } catch {
        // Ignore malformed events
      }
    };

    sse.onerror = () => {
      // SSE connection dropped — not critical, QR still valid
      sse.close();
    };

    return () => {
      sse.close();
      sseRef.current = null;
    };
  }, [reference, status, onPaymentReceived]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt || status !== "PENDING") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setStatus("EXPIRED");
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [expiresAt, status]);

  const handleGenerate = useCallback(() => {
    setError(null);
    setStatus("GENERATING");
    generateQr.mutate({
      merchantId,
      merchantName,
      amountKobo,
      currency,
      description,
      qrType: amountKobo ? "DYNAMIC" : "STATIC",
    } as any);
  }, [generateQr, merchantId, merchantName, amountKobo, currency, description]);

  const handleReset = useCallback(() => {
    sseRef.current?.close();
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus("IDLE");
    setReference(null);
    setQrImageUrl(null);
    setExpiresAt(null);
    setError(null);
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-800">NQR Payment Code</h3>

      {status === "IDLE" && (
        <button
          type="button"
          onClick={handleGenerate}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
        >
          Generate QR Code
        </button>
      )}

      {status === "GENERATING" && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          Generating…
        </div>
      )}

      {status === "PENDING" && qrImageUrl && (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-lg border-4 border-green-500 p-2">
            <img
              src={qrImageUrl}
              alt="NQR Payment Code"
              className="h-48 w-48"
              loading="eager"
            />
          </div>
          {amountKobo && (
            <p className="text-sm font-medium text-gray-700">
              Amount: {currency} {(amountKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </p>
          )}
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            Waiting for payment · Expires in {formatTime(secondsLeft)}
          </div>
          <button type="button" onClick={handleReset} className="text-xs text-gray-400 underline">
            Cancel
          </button>
        </div>
      )}

      {status === "PAID" && (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <span className="text-3xl">✓</span>
          </div>
          <p className="font-semibold text-green-700">Payment Received!</p>
          <p className="text-xs text-gray-500">Reference: {reference}</p>
          <button type="button" onClick={handleReset} className="mt-2 text-xs text-blue-500 underline">
            Generate New Code
          </button>
        </div>
      )}

      {(status === "EXPIRED" || status === "CANCELLED") && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-medium text-orange-600">
            {status === "EXPIRED" ? "QR Code Expired" : "Payment Cancelled"}
          </p>
          <button type="button" onClick={handleReset} className="text-xs text-blue-500 underline">
            Generate New Code
          </button>
        </div>
      )}

      {status === "ERROR" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error ?? "Failed to generate QR code"}
          <button type="button" onClick={handleReset} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}
    </div>
  );
});

NqrGenerator.displayName = "NqrGenerator";
export default NqrGenerator;
