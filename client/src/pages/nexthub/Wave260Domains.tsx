/**
 * Wave260Domains.tsx — CBDC, G2P, Remittance, Healthcare & Audit Trail
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Coins, Users, Globe, Heart, FileText, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

export default function Wave260Domains() {
  // CBDC state
  const [cbdcOwnerId, setCbdcOwnerId] = useState("");
  const [cbdcSender, setCbdcSender] = useState("");
  const [cbdcReceiver, setCbdcReceiver] = useState("");
  const [cbdcAmount, setCbdcAmount] = useState("");

  // G2P state
  const [g2pProgramType, setG2pProgramType] = useState("SOCIAL_WELFARE");
  const [g2pProgramId, setG2pProgramId] = useState("");
  const [g2pPayerFsp, setG2pPayerFsp] = useState("");
  const [g2pPayerAccount, setG2pPayerAccount] = useState("");
  const [g2pBeneficiaries, setG2pBeneficiaries] = useState("");
  const [g2pAmount, setG2pAmount] = useState("");

  // Healthcare state
  const [claimPolicyNum, setClaimPolicyNum] = useState("");
  const [claimBeneficiary, setClaimBeneficiary] = useState("");
  const [claimBeneficiaryName, setClaimBeneficiaryName] = useState("");
  const [claimProvider, setClaimProvider] = useState("");
  const [claimProviderName, setClaimProviderName] = useState("");
  const [claimAmount, setClaimAmount] = useState("");
  const [claimServiceDate, setClaimServiceDate] = useState("");
  const [claimType, setClaimType] = useState("INPATIENT");

  // Audit state
  const [auditActorId, setAuditActorId] = useState("");
  const [auditResourceType, setAuditResourceType] = useState("");

  // Queries
  const cbdcDash = trpc.wave260Domains.cbdc.getDashboard.useQuery();
  const cbdcAccounts = trpc.wave260Domains.cbdc.listAccounts.useQuery({ ownerId: cbdcOwnerId || undefined });
  const g2pDash = trpc.wave260Domains.g2p.getDashboard.useQuery();
  const g2pBatches = trpc.wave260Domains.g2p.listBatches.useQuery({});
  const remittanceCorridors = trpc.wave260Domains.remittance.listCorridors.useQuery();
  const remittanceTransfers = trpc.wave260Domains.remittance.listTransfers.useQuery({});
  const healthcareClaimsList = trpc.wave260Domains.healthcare.listClaims.useQuery({});
  const healthcareDash = trpc.wave260Domains.healthcare.getDashboard.useQuery();
  const auditStats = trpc.wave260Domains.audit.getAuditStats.useQuery();
  const auditEvents = trpc.wave260Domains.audit.queryAudit.useQuery({
    actorId: auditActorId || undefined,
    resourceType: auditResourceType || undefined,
  });

  // Mutations
  const createCbdcAccount = trpc.wave260Domains.cbdc.createAccount.useMutation({
    onSuccess: () => { toast.success("CBDC account created"); cbdcAccounts.refetch(); cbdcDash.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const cbdcTransfer = trpc.wave260Domains.cbdc.transfer.useMutation({
    onSuccess: () => { toast.success("CBDC transfer initiated"); cbdcAccounts.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const createG2pBatch = trpc.wave260Domains.g2p.createBatch.useMutation({
    onSuccess: () => { toast.success("G2P batch created"); g2pBatches.refetch(); g2pDash.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const processG2pBatch = trpc.wave260Domains.g2p.processBatch.useMutation({
    onSuccess: () => { toast.success("Batch processing started"); g2pBatches.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const submitClaim = trpc.wave260Domains.healthcare.submitClaim.useMutation({
    onSuccess: () => { toast.success("Claim submitted"); healthcareClaimsList.refetch(); healthcareDash.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const processClaim = trpc.wave260Domains.healthcare.processClaim.useMutation({
    onSuccess: () => { toast.success("Claim processed"); healthcareClaimsList.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Globe className="h-6 w-6 text-primary" />
          Wave 260 — Domain Expansion
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          CBDC, G2P Disbursements, Remittance, Healthcare Claims, and Audit Trail
        </p>
      </div>

      {/* Top-level stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Coins className="h-3 w-3" />CBDC Accounts</p>
            <p className="text-3xl font-bold">{cbdcDash.data?.totalAccounts ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />G2P Batches</p>
            <p className="text-3xl font-bold">{g2pDash.data?.total ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Heart className="h-3 w-3" />Healthcare Claims</p>
            <p className="text-3xl font-bold">{healthcareDash.data?.total ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" />Audit Events</p>
            <p className="text-3xl font-bold">{auditStats.data?.total ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="cbdc">
        <TabsList className="flex-wrap">
          <TabsTrigger value="cbdc"><Coins className="h-3.5 w-3.5 mr-1.5" />CBDC</TabsTrigger>
          <TabsTrigger value="g2p"><Users className="h-3.5 w-3.5 mr-1.5" />G2P</TabsTrigger>
          <TabsTrigger value="remittance"><Globe className="h-3.5 w-3.5 mr-1.5" />Remittance</TabsTrigger>
          <TabsTrigger value="healthcare"><Heart className="h-3.5 w-3.5 mr-1.5" />Healthcare</TabsTrigger>
          <TabsTrigger value="audit"><FileText className="h-3.5 w-3.5 mr-1.5" />Audit Trail</TabsTrigger>
        </TabsList>

        {/* CBDC Tab */}
        <TabsContent value="cbdc" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Create Account */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Create CBDC Account</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Owner ID (DFSP)</Label>
                  <Input value={cbdcOwnerId} onChange={e => setCbdcOwnerId(e.target.value)} placeholder="dfsp-001" />
                </div>
                <Button
                  className="w-full"
                  disabled={!cbdcOwnerId || createCbdcAccount.isPending}
                  onClick={() => createCbdcAccount.mutate({ ownerId: cbdcOwnerId })}
                >
                  {createCbdcAccount.isPending ? "Creating…" : "Create Account"}
                </Button>
              </CardContent>
            </Card>

            {/* Transfer */}
            <Card>
              <CardHeader><CardTitle className="text-sm">CBDC Transfer</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Sender Wallet</Label>
                  <Input value={cbdcSender} onChange={e => setCbdcSender(e.target.value)} placeholder="wallet-id" />
                </div>
                <div className="space-y-1.5">
                  <Label>Receiver Wallet</Label>
                  <Input value={cbdcReceiver} onChange={e => setCbdcReceiver(e.target.value)} placeholder="wallet-id" />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount (eNGN)</Label>
                  <Input type="number" value={cbdcAmount} onChange={e => setCbdcAmount(e.target.value)} placeholder="100.00" />
                </div>
                <Button
                  className="w-full"
                  disabled={!cbdcSender || !cbdcReceiver || !cbdcAmount || cbdcTransfer.isPending}
                  onClick={() => cbdcTransfer.mutate({ senderWallet: cbdcSender, receiverWallet: cbdcReceiver, amount: parseFloat(cbdcAmount) })}
                >
                  {cbdcTransfer.isPending ? "Sending…" : "Transfer"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Accounts table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">CBDC Accounts</CardTitle>
                <Button variant="outline" size="icon" onClick={() => cbdcAccounts.refetch()}><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet ID</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cbdcAccounts.data?.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No CBDC accounts</TableCell></TableRow>
                  )}
                  {cbdcAccounts.data?.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{a.walletId?.slice(0, 16)}…</TableCell>
                      <TableCell>{a.ownerId}</TableCell>
                      <TableCell><Badge variant="outline">{a.ownerType}</Badge></TableCell>
                      <TableCell className="font-mono">{a.balance?.toLocaleString()}</TableCell>
                      <TableCell>{a.currency}</TableCell>
                      <TableCell>
                        <Badge className={a.isActive === 1 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {a.isActive === 1 ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* G2P Tab */}
        <TabsContent value="g2p" className="space-y-4">
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { label: "Pending", value: g2pDash.data?.pending, color: "text-yellow-600" },
              { label: "Processing", value: g2pDash.data?.processing, color: "text-blue-600" },
              { label: "Completed", value: g2pDash.data?.completed, color: "text-green-600" },
              { label: "Failed", value: g2pDash.data?.failed, color: "text-red-600" },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? "—"}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Disbursement Batches</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" />New Batch</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Create G2P Disbursement Batch</DialogTitle></DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Program Type</Label>
                          <Input value={g2pProgramType} onChange={e => setG2pProgramType(e.target.value)} placeholder="SOCIAL_WELFARE" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Program ID</Label>
                          <Input value={g2pProgramId} onChange={e => setG2pProgramId(e.target.value)} placeholder="prog-001" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Payer FSP</Label>
                          <Input value={g2pPayerFsp} onChange={e => setG2pPayerFsp(e.target.value)} placeholder="dfsp-001" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Payer Account</Label>
                          <Input value={g2pPayerAccount} onChange={e => setG2pPayerAccount(e.target.value)} placeholder="acct-001" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Beneficiaries</Label>
                          <Input type="number" value={g2pBeneficiaries} onChange={e => setG2pBeneficiaries(e.target.value)} placeholder="1000" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Total Amount (NGN)</Label>
                          <Input type="number" value={g2pAmount} onChange={e => setG2pAmount(e.target.value)} placeholder="5000000" />
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        disabled={!g2pProgramId || !g2pPayerFsp || !g2pBeneficiaries || !g2pAmount || createG2pBatch.isPending}
                        onClick={() => createG2pBatch.mutate({
                          programType: g2pProgramType,
                          programId: g2pProgramId,
                          payerFsp: g2pPayerFsp,
                          payerAccount: g2pPayerAccount,
                          beneficiaryCount: parseInt(g2pBeneficiaries),
                          totalAmount: parseFloat(g2pAmount),
                          amount: parseFloat(g2pAmount) / parseInt(g2pBeneficiaries || "1"),
                        })}
                      >
                        {createG2pBatch.isPending ? "Creating…" : "Create Batch"}
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
                    <TableHead>Program</TableHead>
                    <TableHead>Beneficiaries</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g2pBatches.data?.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No batches</TableCell></TableRow>
                  )}
                  {g2pBatches.data?.map(b => (
                    <TableRow key={b.id}>
                      <TableCell>{b.programType}</TableCell>
                      <TableCell>{b.beneficiaryCount?.toLocaleString()}</TableCell>
                      <TableCell className="font-mono">₦{b.totalAmount?.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={b.status === "COMPLETED" ? "bg-green-100 text-green-800" : b.status === "PROCESSING" ? "bg-blue-100 text-blue-800" : b.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{b.createdAt ? new Date(b.createdAt).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>
                        {b.status === "PENDING" && (
                          <Button size="sm" onClick={() => processG2pBatch.mutate({ batchId: b.id })}>
                            Process
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Remittance Tab */}
        <TabsContent value="remittance" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Active Corridors</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>Provider</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {remittanceCorridors.data?.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No corridors</TableCell></TableRow>
                    )}
                    {remittanceCorridors.data?.map(c => (
                      <TableRow key={c.id}>
                        <TableCell><Badge variant="outline">{c.fromCurrency}</Badge></TableCell>
                        <TableCell><Badge variant="outline">{c.toCurrency}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{c.exchangeRate}</TableCell>
                        <TableCell className="font-mono text-xs">{c.fee}</TableCell>
                        <TableCell className="text-xs">{c.provider}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Recent Transfers</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sender FSP</TableHead>
                      <TableHead>Receiver</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {remittanceTransfers.data?.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No transfers</TableCell></TableRow>
                    )}
                    {remittanceTransfers.data?.slice(0, 10).map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs">{t.senderFsp}</TableCell>
                        <TableCell className="text-xs">{t.receiverName}</TableCell>
                        <TableCell className="font-mono text-xs">{t.sendAmount} {t.sendCurrency}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{t.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Healthcare Tab */}
        <TabsContent value="healthcare" className="space-y-4">
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { label: "Total", value: healthcareDash.data?.total },
              { label: "Submitted", value: healthcareDash.data?.submitted },
              { label: "Approved", value: healthcareDash.data?.approved },
              { label: "Rejected", value: healthcareDash.data?.rejected },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value ?? "—"}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Healthcare Claims</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" />Submit Claim</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Submit Healthcare Claim</DialogTitle></DialogHeader>
                    <div className="space-y-3 py-2 max-h-96 overflow-y-auto">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Policy Number</Label>
                          <Input value={claimPolicyNum} onChange={e => setClaimPolicyNum(e.target.value)} placeholder="POL-001" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Claim Type</Label>
                          <Select value={claimType} onValueChange={setClaimType}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="INPATIENT">Inpatient</SelectItem>
                              <SelectItem value="OUTPATIENT">Outpatient</SelectItem>
                              <SelectItem value="DENTAL">Dental</SelectItem>
                              <SelectItem value="PHARMACY">Pharmacy</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Beneficiary ID</Label>
                          <Input value={claimBeneficiary} onChange={e => setClaimBeneficiary(e.target.value)} placeholder="BEN-001" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Beneficiary Name</Label>
                          <Input value={claimBeneficiaryName} onChange={e => setClaimBeneficiaryName(e.target.value)} placeholder="John Doe" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Provider ID</Label>
                          <Input value={claimProvider} onChange={e => setClaimProvider(e.target.value)} placeholder="PROV-001" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Provider Name</Label>
                          <Input value={claimProviderName} onChange={e => setClaimProviderName(e.target.value)} placeholder="Lagos General Hospital" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Claim Amount (NGN)</Label>
                          <Input type="number" value={claimAmount} onChange={e => setClaimAmount(e.target.value)} placeholder="50000" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Service Date</Label>
                          <Input type="date" value={claimServiceDate} onChange={e => setClaimServiceDate(e.target.value)} />
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        disabled={!claimPolicyNum || !claimBeneficiary || !claimProvider || !claimAmount || submitClaim.isPending}
                        onClick={() => submitClaim.mutate({
                          policyNumber: claimPolicyNum,
                          beneficiaryId: claimBeneficiary,
                          beneficiaryName: claimBeneficiaryName,
                          providerId: claimProvider,
                          providerName: claimProviderName,
                          claimType,
                          claimAmount: parseFloat(claimAmount),
                          serviceDate: claimServiceDate || new Date().toISOString().split("T")[0],
                        })}
                      >
                        {submitClaim.isPending ? "Submitting…" : "Submit Claim"}
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
                    <TableHead>Policy</TableHead>
                    <TableHead>Beneficiary</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {healthcareClaimsList.data?.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No claims</TableCell></TableRow>
                  )}
                  {healthcareClaimsList.data?.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">{c.policyNumber}</TableCell>
                      <TableCell className="text-xs">{c.beneficiaryName}</TableCell>
                      <TableCell className="text-xs">{c.providerName}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{c.claimType}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">₦{c.claimAmount?.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={c.status === "APPROVED" ? "bg-green-100 text-green-800" : c.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {c.status === "SUBMITTED" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="text-green-700 border-green-300"
                              onClick={() => processClaim.mutate({ claimId: c.id, decision: "APPROVED", approvedAmount: c.claimAmount })}>
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-700 border-red-300"
                              onClick={() => processClaim.mutate({ claimId: c.id, decision: "REJECTED" })}>
                              Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Trail Tab */}
        <TabsContent value="audit" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Events</p>
                <p className="text-3xl font-bold">{auditStats.data?.total ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Synced to Lakehouse</p>
                <p className="text-3xl font-bold text-green-600">{auditStats.data?.synced ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Pending Sync</p>
                <p className="text-3xl font-bold text-yellow-600">{auditStats.data?.unsynced ?? "—"}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Audit Events</CardTitle>
                <Button variant="outline" size="icon" onClick={() => auditEvents.refetch()}><RefreshCw className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input placeholder="Actor ID…" value={auditActorId} onChange={e => setAuditActorId(e.target.value)} className="max-w-xs" />
                <Input placeholder="Resource type…" value={auditResourceType} onChange={e => setAuditResourceType(e.target.value)} className="max-w-xs" />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditEvents.data?.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No audit events</TableCell></TableRow>
                  )}
                  {auditEvents.data?.map(e => (
                    <TableRow key={e.id}>
                      <TableCell><Badge variant="outline" className="text-xs">{e.eventType}</Badge></TableCell>
                      <TableCell className="text-xs">{e.actorId}</TableCell>
                      <TableCell className="text-xs">{e.resourceType}/{e.resourceId?.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs">{e.action}</TableCell>
                      <TableCell>
                        <Badge className={e.outcome === "SUCCESS" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                          {e.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}</TableCell>
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
