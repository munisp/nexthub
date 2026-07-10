/**
 * Wave250Liquidity.tsx — Liquidity Cover Management Dashboard
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Landmark, AlertTriangle, RefreshCw, Plus, TrendingUp, CheckCircle } from "lucide-react";
import { toast } from "sonner";

function formatKobo(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

export default function Wave250Liquidity() {
  const [depositDfsp, setDepositDfsp] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [ndcDfsp, setNdcDfsp] = useState("");
  const [ndcLimit, setNdcLimit] = useState("");
  const [corridorFrom, setCorridorFrom] = useState("NGN");
  const [corridorTo, setCorridorTo] = useState("USD");
  const [corridorRate, setCorridorRate] = useState("");

  const dashboard = trpc.wave250Liquidity.getDashboard.useQuery();
  const deposits = trpc.wave250Liquidity.listCollateralDeposits.useQuery({});
  const ndcLimits = trpc.wave250Liquidity.listNdcLimits.useQuery();
  const alerts = trpc.wave250Liquidity.listLiquidityAlerts.useQuery({ unresolvedOnly: true });
  const corridors = trpc.wave250Liquidity.listCorridors.useQuery();

  const initiateDeposit = trpc.wave250Liquidity.initiateCollateralDeposit.useMutation({
    onSuccess: () => { toast.success("Collateral deposit initiated"); deposits.refetch(); dashboard.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateNdc = trpc.wave250Liquidity.updateNdcLimit.useMutation({
    onSuccess: () => { toast.success("NDC limit updated"); ndcLimits.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const resolveAlert = trpc.wave250Liquidity.resolveLiquidityAlert.useMutation({
    onSuccess: () => { toast.success("Alert resolved"); alerts.refetch(); dashboard.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const upsertCorridor = trpc.wave250Liquidity.upsertCorridor.useMutation({
    onSuccess: () => { toast.success("Corridor saved"); corridors.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="h-6 w-6 text-primary" />
          Wave 250 — Liquidity Cover Management
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Collateral deposits, NDC limits, liquidity alerts, and settlement corridors
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "DFSPs", value: dashboard.data?.totalDfsps },
          { label: "Pending Deposits", value: dashboard.data?.pendingDeposits },
          { label: "Unresolved Alerts", value: dashboard.data?.unresolvedAlerts },
          { label: "Critical Alerts", value: dashboard.data?.criticalAlerts },
          { label: "Active Corridors", value: dashboard.data?.activeCorridors },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-3xl font-bold ${s.label.includes("Critical") && (s.value ?? 0) > 0 ? "text-red-600" : ""}`}>
                {s.value ?? "—"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="deposits">
        <TabsList>
          <TabsTrigger value="deposits">Collateral Deposits</TabsTrigger>
          <TabsTrigger value="ndc">NDC Limits</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts
            {(dashboard.data?.criticalAlerts ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px] px-1">{dashboard.data?.criticalAlerts}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="corridors">Corridors</TabsTrigger>
        </TabsList>

        {/* Collateral Deposits */}
        <TabsContent value="deposits">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Collateral Deposits</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" />New Deposit</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Initiate Collateral Deposit</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-1.5">
                        <Label>DFSP ID</Label>
                        <Input value={depositDfsp} onChange={e => setDepositDfsp(e.target.value)} placeholder="dfsp-001" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Amount (Kobo)</Label>
                        <Input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="10000000" />
                      </div>
                      <Button
                        className="w-full"
                        disabled={!depositDfsp || !depositAmount || initiateDeposit.isPending}
                        onClick={() => initiateDeposit.mutate({ dfspId: depositDfsp, amountKobo: parseInt(depositAmount) })}
                      >
                        {initiateDeposit.isPending ? "Processing…" : "Initiate Deposit"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DFSP</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deposits.data?.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No deposits</TableCell></TableRow>
                  )}
                  {deposits.data?.map(d => (
                    <TableRow key={d.id}>
                      <TableCell>{d.dfspId}</TableCell>
                      <TableCell>{formatKobo(d.amountKobo)}</TableCell>
                      <TableCell>{d.currency}</TableCell>
                      <TableCell>
                        <Badge className={d.status === "CONFIRMED" ? "bg-green-100 text-green-800" : d.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NDC Limits */}
        <TabsContent value="ndc">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">NDC Limits</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" />Set NDC Limit</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Update NDC Limit</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-1.5">
                        <Label>DFSP ID</Label>
                        <Input value={ndcDfsp} onChange={e => setNdcDfsp(e.target.value)} placeholder="dfsp-001" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>NDC Limit (Kobo)</Label>
                        <Input type="number" value={ndcLimit} onChange={e => setNdcLimit(e.target.value)} placeholder="500000000" />
                      </div>
                      <Button
                        className="w-full"
                        disabled={!ndcDfsp || !ndcLimit || updateNdc.isPending}
                        onClick={() => updateNdc.mutate({ dfspId: ndcDfsp, dfspName: ndcDfsp, ndcLimitKobo: parseInt(ndcLimit) })}
                      >
                        {updateNdc.isPending ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DFSP</TableHead>
                    <TableHead>NDC Limit</TableHead>
                    <TableHead>Alert Threshold</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ndcLimits.data?.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No NDC limits configured</TableCell></TableRow>
                  )}
                  {ndcLimits.data?.map(n => (
                    <TableRow key={n.dfspId}>
                      <TableCell>{n.dfspName}</TableCell>
                      <TableCell className="font-mono">{formatKobo(n.ndcLimitKobo)}</TableCell>
                      <TableCell>{n.alertThresholdPct}%</TableCell>
                      <TableCell className="text-xs">{n.updatedAt ? new Date(n.updatedAt).toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader><CardTitle className="text-base">Unresolved Liquidity Alerts</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DFSP</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.data?.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No unresolved alerts</TableCell></TableRow>
                  )}
                  {alerts.data?.map(a => (
                    <TableRow key={a.id}>
                      <TableCell>{a.dfspId}</TableCell>
                      <TableCell>
                        <Badge className={a.alertLevel === "CRITICAL" ? "bg-red-100 text-red-800" : a.alertLevel === "HIGH" ? "bg-orange-100 text-orange-800" : "bg-yellow-100 text-yellow-800"}>
                          <AlertTriangle className="h-3 w-3 mr-1" />{a.alertLevel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{a.message}</TableCell>
                      <TableCell className="text-xs">{a.createdAt ? new Date(a.createdAt).toLocaleString() : "—"}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => resolveAlert.mutate({ alertId: a.id })}>
                          <CheckCircle className="h-3 w-3 mr-1" />Resolve
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Corridors */}
        <TabsContent value="corridors">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Settlement Corridors</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Corridor</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add Settlement Corridor</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Source Currency</Label>
                          <Input value={corridorFrom} onChange={e => setCorridorFrom(e.target.value)} placeholder="NGN" maxLength={3} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Target Currency</Label>
                          <Input value={corridorTo} onChange={e => setCorridorTo(e.target.value)} placeholder="USD" maxLength={3} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>FX Rate</Label>
                        <Input type="number" step="0.0001" value={corridorRate} onChange={e => setCorridorRate(e.target.value)} placeholder="0.00065" />
                      </div>
                      <Button
                        className="w-full"
                        disabled={!corridorFrom || !corridorTo || !corridorRate || upsertCorridor.isPending}
                        onClick={() => upsertCorridor.mutate({
                          corridorId: `${corridorFrom}-${corridorTo}`,
                          sourceCurrency: corridorFrom,
                          targetCurrency: corridorTo,
                          fxRate: parseFloat(corridorRate),
                        })}
                      >
                        {upsertCorridor.isPending ? "Saving…" : "Save Corridor"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corridor</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>FX Rate</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {corridors.data?.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No corridors configured</TableCell></TableRow>
                  )}
                  {corridors.data?.map(c => (
                    <TableRow key={c.corridorId}>
                      <TableCell className="font-mono">{c.corridorId}</TableCell>
                      <TableCell>{c.sourceCurrency}</TableCell>
                      <TableCell>{c.targetCurrency}</TableCell>
                      <TableCell className="font-mono">{c.fxRate}</TableCell>
                      <TableCell>
                        <Badge className={c.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
