/**
 * NqrScanner.tsx — In-App NQR QR Code Scanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses the device camera (via getUserMedia) to scan EMVCo NQR codes.
 * Decodes the QR payload using jsQR (pure JS, no native deps).
 * On successful scan, calls onScanned(emvcoPayload) and closes the camera.
 *
 * Performance notes:
 *   - Canvas frames are decoded at 10fps (not 60fps) to reduce CPU usage
 *   - Camera stream is stopped immediately after a successful scan
 *   - Component is React.memo'd to prevent re-renders from parent state
 */
import React, { useEffect, useRef, useCallback, useState } from "react";

interface NqrScannerProps {
  /** Called with the raw EMVCo NQR payload string when a QR code is detected */
  onScanned: (payload: string) => void;
  /** Called if the user cancels or camera access is denied */
  onCancel?: () => void;
  /** Optional CSS class for the outer container */
  className?: string;
}

const NqrScanner: React.FC<NqrScannerProps> = React.memo(({ onScanned, onCancel, className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    try {
      // Lazy-load jsQR to keep initial bundle small
      const { default: jsQR } = await import("jsqr");
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code?.data) {
        stopCamera();
        onScanned(code.data);
        return;
      }
    } catch {
      // jsQR not available — show error
      setError("QR scanning library unavailable. Please install jsqr.");
      stopCamera();
      return;
    }

    // Throttle to ~10fps to reduce CPU load
    setTimeout(() => {
      rafRef.current = requestAnimationFrame(scanFrame);
    }, 100);
  }, [onScanned, stopCamera]);

  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment", // rear camera on mobile
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScanning(true);
        rafRef.current = requestAnimationFrame(scanFrame);
      } catch (err: any) {
        if (mounted) {
          setError(
            err?.name === "NotAllowedError"
              ? "Camera access denied. Please allow camera permissions and try again."
              : `Camera error: ${err?.message ?? "Unknown error"}`
          );
        }
      }
    };

    startCamera();
    return () => {
      mounted = false;
      stopCamera();
    };
  }, [scanFrame, stopCamera]);

  return (
    <div className={`relative flex flex-col items-center gap-3 ${className ?? ""}`}>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-xl border-2 border-blue-500 shadow-lg">
            <video
              ref={videoRef}
              className="h-64 w-64 object-cover"
              playsInline
              muted
              autoPlay
            />
            {/* Scanning overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-40 rounded-lg border-4 border-blue-400 opacity-70" />
            </div>
            {scanning && (
              <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                  Scanning…
                </span>
              </div>
            )}
          </div>
          <p className="text-center text-sm text-gray-500">
            Point the camera at an NQR code to pay
          </p>
        </>
      )}

      {/* Hidden canvas used for frame extraction */}
      <canvas ref={canvasRef} className="hidden" />

      {onCancel && (
        <button
          type="button"
          onClick={() => { stopCamera(); onCancel(); }}
          className="mt-1 text-sm text-gray-500 underline hover:text-gray-700"
        >
          Cancel
        </button>
      )}
    </div>
  );
});

NqrScanner.displayName = "NqrScanner";
export default NqrScanner;
