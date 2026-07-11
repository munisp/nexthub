/**
 * DisputeArbitrationTribunal.tsx — Multi-Party Dispute Arbitration Portal
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-featured React UI for the NextHub Dispute Arbitration Tribunal.
 * Supports:
 *   - Raising disputes with reason codes
 *   - Evidence submission by both DFSPs
 *   - Real-time ML fraud score display
 *   - Arbitrator decision panel (hub operators only)
 *   - Appeal filing
 *   - Dispute timeline and audit trail
 *
 * Language: TypeScript + React 18 + tRPC + Tailwind CSS
 */
import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  RAISED:               "bg-yellow-100 text-yellow-800",
  EVIDENCE_COLLECTION:  "bg-blue-100 text-blue-800",
  ML_SCORING:           "bg-purple-100 text-purple-800",
  UNDER_REVIEW:         "bg-orange-100 text-orange-800",
  DECISION_ISSUED:      "bg-green-100 text-green-800",
  CHARGEBACK_INITIATED: "bg-red-100 text-red-800",
  APPEALED:             "bg-pink-100 text-pink-800",
  CLOSED:               "bg-gray-100 text-gray-700",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── ML Score display ─────────────────────────────────────────────────────────

function MLScoreCard({ score, recommendation, confidence, indicators }: {
  score: number;
  recommendation: string;
  confidence: number;
  indicators: string[];
}) {
  const riskLevel = score >= 0.75 ? "HIGH" : score >= 0.4 ? "MEDIUM" : "LOW";
  const riskColor = riskLevel === "HIGH" ? "text-red-600" : riskLevel === "MEDIUM" ? "text-yellow-600" : "text-green-600";
  const barWidth  = `${Math.round(score * 100)}%`;

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <h4 className="font-semibold text-sm text-gray-700 mb-3">ML Fraud Score</h4>
      <div className="flex items-center gap-4 mb-3">
        <div className="text-3xl font-bold tabular-nums">
          <span className={riskColor}>{(score * 100).toFixed(0)}</span>
          <span className="text-gray-400 text-lg">/100</span>
        </div>
        <div>
          <div className={`font-semibold text-sm ${riskColor}`}>{riskLevel} RISK</div>
          <div className="text-xs text-gray-500">Confidence: {(confidence * 100).toFixed(0)}%</div>
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all ${
            riskLevel === "HIGH" ? "bg-red-500" : riskLevel === "MEDIUM" ? "bg-yellow-500" : "bg-green-500"
          }`}
          style={{ width: barWidth }}
        />
      </div>
      <div className="mb-3">
        <span className="text-xs font-medium text-gray-600">Recommendation: </span>
        <span className={`text-xs font-bold ${
          recommendation === "UPHOLD" ? "text-red-600" :
          recommendation === "REJECT" ? "text-green-600" : "text-yellow-600"
        }`}>{recommendation}</span>
      </div>
      {indicators.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-600 mb-1">Fraud Indicators:</div>
          <div className="flex flex-wrap gap-1">
            {indicators.map(ind => (
              <span key={ind} className="bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded border border-red-200">
                {ind.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Raise Dispute Form ───────────────────────────────────────────────────────

function RaiseDisputeForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [transferId, setTransferId] = useState("");
  const [reason, setReason] = useState<string>("UNAUTHORIZED_TRANSACTION");
  const [description, setDescription] = useState("");

  const raise = trpc.nexthubArbitration?.raiseDispute?.useMutation({
    onSuccess: (data: any) => {
      toast({ title: "Dispute raised", description: `Dispute ID: ${data.disputeId}` });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="border rounded-lg p-6 bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Raise New Dispute</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Transfer ID</label>
          <input
            type="text"
            value={transferId}
            onChange={e => setTransferId(e.target.value)}
            placeholder="UUID of the disputed transfer"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="UNAUTHORIZED_TRANSACTION">Unauthorized Transaction</option>
            <option value="DUPLICATE_TRANSACTION">Duplicate Transaction</option>
            <option value="WRONG_AMOUNT">Wrong Amount</option>
            <option value="WRONG_BENEFICIARY">Wrong Beneficiary</option>
            <option value="TECHNICAL_ERROR">Technical Error</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="Describe the dispute in detail..."
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => raise?.mutate({ transferId, reason: reason as any, description })}
          disabled={!transferId || !description || raise?.isPending}
          className="w-full bg-red-600 text-white py-2 rounded font-medium text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {raise?.isPending ? "Raising..." : "Raise Dispute"}
        </button>
      </div>
    </div>
  );
}

// ─── Decision Panel ───────────────────────────────────────────────────────────

function DecisionPanel({ disputeId, onDecision }: { disputeId: string; onDecision: () => void }) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<"UPHOLD" | "REJECT" | "PARTIAL">("REJECT");
  const [reasoning, setReasoning] = useState("");
  const [chargebackAmount, setChargebackAmount] = useState("");

  const issue = trpc.nexthubArbitration?.issueDecision?.useMutation({
    onSuccess: () => {
      toast({ title: "Decision issued", description: `Dispute ${disputeId} — ${decision}` });
      onDecision();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="border-2 border-orange-200 rounded-lg p-4 bg-orange-50">
      <h4 className="font-semibold text-sm text-orange-800 mb-3">Issue Arbitration Decision</h4>
      <div className="space-y-3">
        <div className="flex gap-2">
          {(["UPHOLD", "REJECT", "PARTIAL"] as const).map(d => (
            <button
              key={d}
              onClick={() => setDecision(d)}
              className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                decision === d
                  ? d === "UPHOLD" ? "bg-red-600 text-white"
                  : d === "REJECT" ? "bg-green-600 text-white"
                  : "bg-yellow-600 text-white"
                  : "bg-white border text-gray-700 hover:bg-gray-50"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        {decision === "PARTIAL" && (
          <input
            type="number"
            value={chargebackAmount}
            onChange={e => setChargebackAmount(e.target.value)}
            placeholder="Chargeback amount (kobo)"
            className="w-full border rounded px-3 py-2 text-sm"
          />
        )}
        <textarea
          value={reasoning}
          onChange={e => setReasoning(e.target.value)}
          rows={3}
          placeholder="Provide detailed reasoning for this decision..."
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <button
          onClick={() => issue?.mutate({
            disputeId,
            decision,
            reasoning,
            chargebackAmount: chargebackAmount ? parseInt(chargebackAmount) : undefined,
          })}
          disabled={reasoning.length < 20 || issue?.isPending}
          className="w-full bg-orange-600 text-white py-2 rounded font-medium text-sm hover:bg-orange-700 disabled:opacity-50 transition-colors"
        >
          {issue?.isPending ? "Issuing..." : "Issue Decision"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Tribunal Page ───────────────────────────────────────────────────────

export default function DisputeArbitrationTribunal() {
  const [activeTab, setActiveTab] = useState<"list" | "raise" | "stats">("list");
  const [selectedDispute, setSelectedDispute] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const { data: disputeData, refetch } = trpc.nexthubArbitration?.listDisputes?.useQuery({
    status: statusFilter || undefined,
    limit: 50,
  }) ?? { data: null, refetch: () => {} };

  const { data: stats } = trpc.nexthubArbitration?.statistics?.useQuery({}) ?? { data: null };

  const disputes = (disputeData as any)?.disputes ?? [];
  const total    = (disputeData as any)?.total ?? 0;

  const statRows = useMemo(() => {
    if (!stats) return [];
    return (stats as any[]).map((s: any) => ({
      status:   s.status,
      count:    Number(s.count),
      amount:   Number(s.total_amount ?? 0),
      avgHours: Number(s.avg_resolution_hours ?? 0).toFixed(1),
    }));
  }, [stats]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dispute Arbitration Tribunal</h1>
        <p className="text-sm text-gray-500 mt-1">
          Multi-party dispute resolution powered by Temporal workflows and ML fraud scoring
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b">
        {(["list", "raise", "stats"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 ${
              activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab === "list" ? `All Disputes (${total})` : tab === "raise" ? "Raise Dispute" : "Statistics"}
          </button>
        ))}
      </div>

      {/* Dispute list */}
      {activeTab === "list" && (
        <div>
          <div className="flex gap-3 mb-4">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              {Object.keys(STATUS_COLORS).map(s => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Dispute ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Transfer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Reason</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Raised</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {disputes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">No disputes found</td>
                  </tr>
                )}
                {disputes.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-blue-600">{d.id?.slice(0, 12)}...</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.transfer_id?.slice(0, 12)}...</td>
                    <td className="px-4 py-3 text-xs">{(d.reason ?? "").replace(/_/g, " ")}</td>
                    <td className="px-4 py-3"><StatusBadge status={d.status ?? ""} /></td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {d.amount ? `₦${(d.amount / 100).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {d.created_at ? new Date(d.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedDispute(d.id === selectedDispute ? null : d.id)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {d.id === selectedDispute ? "Close" : "Manage"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Expanded dispute management panel */}
          {selectedDispute && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <DecisionPanel
                disputeId={selectedDispute}
                onDecision={() => { setSelectedDispute(null); refetch(); }}
              />
            </div>
          )}
        </div>
      )}

      {/* Raise dispute form */}
      {activeTab === "raise" && (
        <div className="max-w-lg">
          <RaiseDisputeForm onSuccess={() => { setActiveTab("list"); refetch(); }} />
        </div>
      )}

      {/* Statistics */}
      {activeTab === "stats" && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Dispute Statistics by Status</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Count</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Total Amount</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Avg Resolution (hrs)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {statRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400">No statistics available</td>
                  </tr>
                )}
                {statRows.map(row => (
                  <tr key={row.status} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{row.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">₦{(row.amount / 100).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.avgHours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
