/**
 * Wave230Security.tsx — JWS/HSM Key Management & mTLS Certificates
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
import { Shield, Key, Lock, RefreshCw, Plus, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function Wave230Security() {
  const [dfspId, setDfspId] = useState("");
  const [algorithm, setAlgorithm] = useState<"PS256" | "RS256" | "ES256">("PS256");
  const [certDfsp, setCertDfsp] = useState("");
  const [certCN, setCertCN] = useState("");

  const stats = trpc.wave230Security.hsm.stats.useQuery();
  const mtlsStats = trpc.wave230Security.mtls.stats.useQuery();
  const keys = trpc.wave230Security.hsm.listKeys.useQuery({ dfspId: dfspId || undefined });
  const certs = trpc.wave230Security.mtls.listCertificates.useQuery({ dfspId: certDfsp || undefined });

  const generateKey = trpc.wave230Security.hsm.generateKey.useMutation({
    onSuccess: () => { toast.success("JWS key pair generated"); keys.refetch(); stats.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const rotateKey = trpc.wave230Security.hsm.rotateKey.useMutation({
    onSuccess: () => { toast.success("Key rotated successfully"); keys.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const issueCert = trpc.wave230Security.mtls.issueCertificate.useMutation({
    onSuccess: () => { toast.success("Certificate issued"); certs.refetch(); mtlsStats.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const revokeCert = trpc.wave230Security.mtls.revokeCertificate.useMutation({
    onSuccess: () => { toast.success("Certificate revoked"); certs.refetch(); mtlsStats.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Wave 230 — Cryptography & Security
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          JWS non-repudiation, HSM key management, and mTLS certificate lifecycle
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Active JWS Keys</p>
            <p className="text-3xl font-bold">{stats.data?.activeKeys ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">DFSPs Covered</p>
            <p className="text-3xl font-bold">{stats.data?.dfspsCovered ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Active mTLS Certs</p>
            <p className="text-3xl font-bold">{mtlsStats.data?.active ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Revoked Certs</p>
            <p className="text-3xl font-bold text-destructive">{mtlsStats.data?.revoked ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="jws">
        <TabsList>
          <TabsTrigger value="jws"><Key className="h-3.5 w-3.5 mr-1.5" />JWS Keys</TabsTrigger>
          <TabsTrigger value="mtls"><Lock className="h-3.5 w-3.5 mr-1.5" />mTLS Certificates</TabsTrigger>
        </TabsList>

        {/* JWS Keys Tab */}
        <TabsContent value="jws" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">JWS Key Management</CardTitle>
                  <CardDescription>RSA-PSS and EC key pairs for DFSP non-repudiation</CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" />Generate Key Pair</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Generate JWS Key Pair</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-1.5">
                        <Label>DFSP ID</Label>
                        <Input placeholder="dfsp-001" value={dfspId} onChange={e => setDfspId(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Algorithm</Label>
                        <Select value={algorithm} onValueChange={v => setAlgorithm(v as any)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PS256">PS256 (RSA-PSS SHA-256)</SelectItem>
                            <SelectItem value="RS256">RS256 (RSASSA-PKCS1 SHA-256)</SelectItem>
                            <SelectItem value="ES256">ES256 (ECDSA P-256)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        className="w-full"
                        disabled={!dfspId || generateKey.isPending}
                        onClick={() => generateKey.mutate({ dfspId, algorithm })}
                      >
                        {generateKey.isPending ? "Generating…" : "Generate"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Filter by DFSP ID…"
                  value={dfspId}
                  onChange={e => setDfspId(e.target.value)}
                  className="max-w-xs"
                />
                <Button variant="outline" size="icon" onClick={() => keys.refetch()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key ID</TableHead>
                    <TableHead>DFSP</TableHead>
                    <TableHead>Algorithm</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.data?.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No keys found</TableCell></TableRow>
                  )}
                  {keys.data?.map(k => (
                    <TableRow key={k.id}>
                      <TableCell className="font-mono text-xs">{k.id.slice(0, 12)}…</TableCell>
                      <TableCell>{k.dfspId}</TableCell>
                      <TableCell><Badge variant="outline">{k.algorithm}</Badge></TableCell>
                      <TableCell>
                        {k.isActive
                          ? <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>
                          : <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Revoked</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{k.createdAt ? new Date(k.createdAt).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-xs">{k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>
                        {k.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => rotateKey.mutate({ dfspId: k.dfspId })}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />Rotate
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

        {/* mTLS Certificates Tab */}
        <TabsContent value="mtls" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">mTLS Certificate Management</CardTitle>
                  <CardDescription>Issue and revoke client certificates for DFSP mutual TLS</CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-1" />Issue Certificate</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Issue mTLS Certificate</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-1.5">
                        <Label>DFSP ID</Label>
                        <Input placeholder="dfsp-001" value={certDfsp} onChange={e => setCertDfsp(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Common Name (CN)</Label>
                        <Input placeholder="dfsp-001.nexthub.local" value={certCN} onChange={e => setCertCN(e.target.value)} />
                      </div>
                      <Button
                        className="w-full"
                        disabled={!certDfsp || !certCN || issueCert.isPending}
                        onClick={() => issueCert.mutate({ dfspId: certDfsp, commonName: certCN })}
                      >
                        {issueCert.isPending ? "Issuing…" : "Issue Certificate"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Filter by DFSP ID…"
                  value={certDfsp}
                  onChange={e => setCertDfsp(e.target.value)}
                  className="max-w-xs"
                />
                <Button variant="outline" size="icon" onClick={() => certs.refetch()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial</TableHead>
                    <TableHead>DFSP</TableHead>
                    <TableHead>Common Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certs.data?.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No certificates found</TableCell></TableRow>
                  )}
                  {certs.data?.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.serialNumber?.slice(0, 10)}…</TableCell>
                      <TableCell>{c.dfspId}</TableCell>
                      <TableCell className="text-xs">{c.commonName}</TableCell>
                      <TableCell><Badge variant="outline">{c.certType}</Badge></TableCell>
                      <TableCell>
                        {c.status === "ACTIVE"
                          ? <Badge className="bg-green-100 text-green-800">Active</Badge>
                          : c.status === "REVOKED"
                          ? <Badge variant="destructive">Revoked</Badge>
                          : <Badge variant="secondary">{c.status}</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{c.issuedAt ? new Date(c.issuedAt).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-xs">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>
                        {c.status === "ACTIVE" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => revokeCert.mutate({ certId: c.id, reason: "superseded" })}
                          >
                            Revoke
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
      </Tabs>
    </div>
  );
}
