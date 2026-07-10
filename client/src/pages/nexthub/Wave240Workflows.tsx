/**
 * Wave240Workflows.tsx — Temporal Workflow Orchestration Dashboard
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { GitBranch, RefreshCw, Play, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";

const WORKFLOW_TYPES = [
  "TransferWorkflow",
  "PayoutApprovalWorkflow",
  "DisputeWorkflow",
  "SettlementWorkflow",
  "KYCWorkflow",
  "LiquidityMonitorWorkflow",
  "CollateralDepositWorkflow",
  "CorridorSettlementWorkflow",
] as const;

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

export default function Wave240Workflows() {
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [entityId, setEntityId] = useState("");
  const [newWfType, setNewWfType] = useState<typeof WORKFLOW_TYPES[number]>("TransferWorkflow");
  const [newWfEntity, setNewWfEntity] = useState("");
  const [newWfInput, setNewWfInput] = useState("{}");

  const dashboard = trpc.wave240Workflows.getDashboard.useQuery();
  const workflows = trpc.wave240Workflows.listWorkflows.useQuery({
    workflowType: filterType !== "all" ? filterType as any : undefined,
    status: filterStatus !== "all" ? filterStatus as any : undefined,
    entityId: entityId || undefined,
  });

  const startWorkflow = trpc.wave240Workflows.startWorkflow.useMutation({
    onSuccess: () => { toast.success("Workflow started"); workflows.refetch(); dashboard.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const cancelWorkflow = trpc.wave240Workflows.cancelWorkflow.useMutation({
    onSuccess: () => { toast.success("Workflow cancelled"); workflows.refetch(); dashboard.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GitBranch className="h-6 w-6 text-primary" />
          Wave 240 — Workflow Orchestration
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Temporal workflow instances — Transfer, Payout, Dispute, Settlement, KYC, Liquidity
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total", value: dashboard.data?.total, color: "" },
          { label: "Running", value: dashboard.data?.running, color: "text-blue-600" },
          { label: "Completed", value: dashboard.data?.completed, color: "text-green-600" },
          { label: "Failed", value: dashboard.data?.failed, color: "text-red-600" },
          { label: "Cancelled", value: dashboard.data?.cancelled, color: "text-gray-500" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value ?? "—"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Workflow type breakdown */}
      {dashboard.data?.byType && Object.keys(dashboard.data.byType).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">By Workflow Type</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(dashboard.data.byType).map(([type, count]) => (
                <Badge key={type} variant="outline" className="text-xs">
                  {type}: <span className="font-bold ml-1">{count}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Workflow list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Workflow Instances</CardTitle>
              <CardDescription>All Temporal workflow executions</CardDescription>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm"><Play className="h-4 w-4 mr-1" />Start Workflow</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Start Temporal Workflow</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label>Workflow Type</Label>
                    <Select value={newWfType} onValueChange={v => setNewWfType(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WORKFLOW_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Entity ID</Label>
                    <Input placeholder="transfer-001" value={newWfEntity} onChange={e => setNewWfEntity(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Input (JSON)</Label>
                    <Input placeholder="{}" value={newWfInput} onChange={e => setNewWfInput(e.target.value)} />
                  </div>
                  <Button
                    className="w-full"
                    disabled={!newWfEntity || startWorkflow.isPending}
                    onClick={() => {
                      try {
                        startWorkflow.mutate({
                          workflowType: newWfType,
                          entityId: newWfEntity,
                          entityType: newWfType.replace("Workflow", "").toLowerCase(),
                          input: JSON.parse(newWfInput),
                        });
                      } catch {
                        toast.error("Invalid JSON input");
                      }
                    }}
                  >
                    {startWorkflow.isPending ? "Starting…" : "Start"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-52"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {WORKFLOW_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="RUNNING">Running</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Entity ID…"
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
              className="w-48"
            />
            <Button variant="outline" size="icon" onClick={() => workflows.refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.data?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No workflows found</TableCell></TableRow>
              )}
              {workflows.data?.map(w => (
                <TableRow key={w.workflowId}>
                  <TableCell className="font-mono text-xs max-w-[180px] truncate">{w.workflowId}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{w.workflowType}</Badge></TableCell>
                  <TableCell className="text-xs">{w.entityId}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[w.status] ?? ""}>{w.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{w.startedAt ? new Date(w.startedAt).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-xs">{w.completedAt ? new Date(w.completedAt).toLocaleString() : "—"}</TableCell>
                  <TableCell>
                    {w.status === "RUNNING" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => cancelWorkflow.mutate({ workflowId: w.workflowId })}
                      >
                        <XCircle className="h-3 w-3 mr-1" />Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
