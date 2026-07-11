/**
 * VirtualTransferList.tsx — Virtualised Transfer Table
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders only the visible rows of a potentially large transfer list.
 * Uses @tanstack/react-virtual for windowed rendering.
 *
 * Performance characteristics:
 *   - Renders ~20 DOM rows regardless of dataset size (1K, 100K, 1M rows)
 *   - Scroll is handled natively — no JS scroll event throttling needed
 *   - React.memo on each row prevents re-renders when sibling rows update
 *   - useMemo on sorted/filtered data prevents recomputation on unrelated re-renders
 */
import React, { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface TransferRow {
  id: string;
  payerFspId: string;
  payeeFspId: string;
  amountKobo: number;
  currency: string;
  state: string;
  createdAt: string | Date;
  fraudScore?: number | null;
}

interface VirtualTransferListProps {
  transfers: TransferRow[];
  /** Height of the scrollable container in pixels */
  containerHeight?: number;
  /** Called when a row is clicked */
  onRowClick?: (transfer: TransferRow) => void;
  /** Optional search filter applied client-side */
  filter?: string;
}

const STATE_COLOURS: Record<string, string> = {
  COMMITTED: "bg-green-100 text-green-800",
  RECEIVED:  "bg-blue-100 text-blue-800",
  RESERVED:  "bg-yellow-100 text-yellow-800",
  ABORTED:   "bg-red-100 text-red-800",
  EXPIRED:   "bg-gray-100 text-gray-600",
};

// ── Individual row — memoised to prevent re-renders ──────────────────────────
const TransferRowItem = React.memo<{
  transfer: TransferRow;
  style: React.CSSProperties;
  onClick?: (t: TransferRow) => void;
}>(({ transfer, style, onClick }) => {
  const stateClass = STATE_COLOURS[transfer.state] ?? "bg-gray-100 text-gray-600";
  const amount = (transfer.amountKobo / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const date = new Date(transfer.createdAt).toLocaleString("en-NG", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div
      style={style}
      onClick={() => onClick?.(transfer)}
      className={`flex items-center gap-4 border-b border-gray-100 px-4 text-sm ${
        onClick ? "cursor-pointer hover:bg-gray-50" : ""
      }`}
    >
      <span className="w-32 truncate font-mono text-xs text-gray-400" title={transfer.id}>
        {transfer.id.slice(0, 12)}…
      </span>
      <span className="w-28 truncate text-gray-700">{transfer.payerFspId}</span>
      <span className="w-6 text-gray-400">→</span>
      <span className="w-28 truncate text-gray-700">{transfer.payeeFspId}</span>
      <span className="w-28 text-right font-medium text-gray-900">
        {transfer.currency} {amount}
      </span>
      <span className={`w-24 rounded-full px-2 py-0.5 text-center text-xs font-medium ${stateClass}`}>
        {transfer.state}
      </span>
      {transfer.fraudScore != null && (
        <span
          className={`w-16 text-right text-xs ${
            transfer.fraudScore > 0.7 ? "font-bold text-red-600" : "text-gray-400"
          }`}
        >
          {(transfer.fraudScore * 100).toFixed(0)}%
        </span>
      )}
      <span className="ml-auto text-xs text-gray-400">{date}</span>
    </div>
  );
});
TransferRowItem.displayName = "TransferRowItem";

// ── Main virtualised list ─────────────────────────────────────────────────────
const VirtualTransferList: React.FC<VirtualTransferListProps> = React.memo(({
  transfers,
  containerHeight = 480,
  onRowClick,
  filter,
}) => {
  // Client-side filter — memoised so it only recomputes when transfers or filter changes
  const filtered = useMemo(() => {
    if (!filter?.trim()) return transfers;
    const q = filter.toLowerCase();
    return transfers.filter(
      (t) =>
        t.id.includes(q) ||
        t.payerFspId.toLowerCase().includes(q) ||
        t.payeeFspId.toLowerCase().includes(q) ||
        t.state.toLowerCase().includes(q)
    );
  }, [transfers, filter]);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44, // row height in px
    overscan: 5, // render 5 extra rows above/below viewport
  });

  if (filtered.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-gray-400"
        style={{ height: containerHeight }}
      >
        {filter ? "No transfers match your search" : "No transfers found"}
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-4 border-b-2 border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <span className="w-32">Transfer ID</span>
        <span className="w-28">Payer FSP</span>
        <span className="w-6" />
        <span className="w-28">Payee FSP</span>
        <span className="w-28 text-right">Amount</span>
        <span className="w-24 text-center">State</span>
        <span className="w-16 text-right">Fraud</span>
        <span className="ml-auto">Time</span>
      </div>

      {/* Virtualised scroll container */}
      <div
        ref={parentRef}
        style={{ height: containerHeight, overflowY: "auto" }}
        className="relative"
      >
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <TransferRowItem
              key={filtered[virtualRow.index].id}
              transfer={filtered[virtualRow.index]}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={onRowClick}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
        Showing {filtered.length.toLocaleString()} transfer{filtered.length !== 1 ? "s" : ""}
        {filter && ` matching "${filter}"`}
      </div>
    </div>
  );
});

VirtualTransferList.displayName = "VirtualTransferList";
export default VirtualTransferList;
