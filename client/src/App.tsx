/**
 * App.tsx — NextHub Core Frontend Entry Point
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone React application for the NextHub Scheme Operator portal.
 * Completely independent of Paygate's App.tsx.
 *
 * Routes:
 *   /                          → Dashboard (redirect to /dfsps)
 *   /dfsps                     → DFSP Management
 *   /participant-lifecycle     → Participant Lifecycle
 *   /topology                  → DFSP Topology Map
 *   /oracles                   → Oracle Management
 *   /settlement/windows        → Settlement Windows
 *   /settlement/banks          → Settlement Bank Management
 *   /ndc/limits                → NDC Position Limit Editor
 *   /ndc/breaches              → NDC Breach Events
 *   /fx                        → FX Dashboard
 *   /bulk-transfers            → Bulk Transfers
 *   /bulk-transfers/wizard     → Bulk Transfer Wizard
 *   /disputes                  → Disputes Hub
 *   /reconciliation            → Reconciliation Exceptions
 *   /pisp/consents             → PISP Consents
 *   /security                  → Security Dashboard
 *   /billing                   → Billing Hub
 *   /regulator/login           → Regulator Login
 *   /regulator/verify          → Regulator Verify
 *   /regulator/dashboard       → Regulator Dashboard
 *   /admin/regulators          → Admin Regulator Management
 */

import { lazy, Suspense } from "react";
import { Route, Switch, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Lazy page imports ────────────────────────────────────────────────────────
const DFSPManagement         = lazy(() => import("@/pages/nexthub/DFSPManagement"));
const ParticipantLifecycle   = lazy(() => import("@/pages/nexthub/ParticipantLifecycle"));
const DFSPTopologyMap        = lazy(() => import("@/pages/nexthub/DFSPTopologyMap"));
const OracleManagement       = lazy(() => import("@/pages/nexthub/OracleManagement"));
const SettlementWindows      = lazy(() => import("@/pages/nexthub/SettlementWindows"));
const SettlementBankMgmt     = lazy(() => import("@/pages/nexthub/SettlementBankManagement"));
const NDCPositionLimitEditor = lazy(() => import("@/pages/nexthub/NDCPositionLimitEditor"));
const NdcBreachEvents        = lazy(() => import("@/pages/nexthub/NdcBreachEvents"));
const FXDashboard            = lazy(() => import("@/pages/nexthub/FXDashboard"));
const BulkTransfers          = lazy(() => import("@/pages/nexthub/BulkTransfers"));
const BulkTransferWizard     = lazy(() => import("@/pages/nexthub/BulkTransferWizard"));
const DisputesHub            = lazy(() => import("@/pages/nexthub/DisputesHub"));
const ReconciliationExceptions = lazy(() => import("@/pages/nexthub/ReconciliationExceptions"));
const PISPConsents           = lazy(() => import("@/pages/nexthub/PISPConsents"));
const SecurityDashboard      = lazy(() => import("@/pages/nexthub/SecurityDashboard"));
const BillingHub             = lazy(() => import("@/pages/nexthub/BillingHub"));
const RegulatorLogin         = lazy(() => import("@/pages/regulator/RegulatorLogin"));
const RegulatorVerify        = lazy(() => import("@/pages/regulator/RegulatorVerify"));
const RegulatorDashboard     = lazy(() => import("@/pages/regulator/RegulatorDashboard"));
const RegulatorManagement    = lazy(() => import("@/pages/admin/RegulatorManagement"));
// ─── Wave 230–260 pages ───────────────────────────────────────────────────────
const Wave230Security        = lazy(() => import("@/pages/nexthub/Wave230Security"));
const Wave240Workflows       = lazy(() => import("@/pages/nexthub/Wave240Workflows"));
const Wave250Liquidity       = lazy(() => import("@/pages/nexthub/Wave250Liquidity"));
const Wave260Domains         = lazy(() => import("@/pages/nexthub/Wave260Domains"));

// ─── tRPC + React Query setup ─────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      headers: () => ({
        "x-client-id": "nexthub-frontend",
      }),
    }),
  ],
});

// ─── Page loading skeleton ────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-4 gap-4 mt-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg mt-4" />
    </div>
  );
}

// ─── Routes that need the Layout wrapper ─────────────────────────────────────
function AppRoutes() {
  return (
    <Switch>
      {/* Regulator portal — no Layout wrapper */}
      <Route path="/regulator/login">
        <Suspense fallback={<PageLoader />}><RegulatorLogin /></Suspense>
      </Route>
      <Route path="/regulator/verify">
        <Suspense fallback={<PageLoader />}><RegulatorVerify /></Suspense>
      </Route>

      {/* All other routes use the Layout */}
      <Route>
        <Layout>
          <Suspense fallback={<PageLoader />}>
            <Switch>
              <Route path="/" component={() => <Redirect to="/dfsps" />} />

              {/* Participants */}
              <Route path="/dfsps" component={DFSPManagement} />
              <Route path="/participant-lifecycle" component={ParticipantLifecycle} />
              <Route path="/topology" component={DFSPTopologyMap} />
              <Route path="/oracles" component={OracleManagement} />

              {/* Settlement & NDC */}
              <Route path="/settlement/windows" component={SettlementWindows} />
              <Route path="/settlement/banks" component={SettlementBankMgmt} />
              <Route path="/ndc/limits" component={NDCPositionLimitEditor} />
              <Route path="/ndc/breaches" component={NdcBreachEvents} />

              {/* FX & Transfers */}
              <Route path="/fx" component={FXDashboard} />
              <Route path="/bulk-transfers/wizard" component={BulkTransferWizard} />
              <Route path="/bulk-transfers" component={BulkTransfers} />

              {/* Compliance & Risk */}
              <Route path="/disputes" component={DisputesHub} />
              <Route path="/reconciliation" component={ReconciliationExceptions} />
              <Route path="/pisp/consents" component={PISPConsents} />
              <Route path="/security" component={SecurityDashboard} />

              {/* Billing */}
              <Route path="/billing" component={BillingHub} />

              {/* Regulator (authenticated) */}
              <Route path="/regulator/dashboard" component={RegulatorDashboard} />

              {/* Admin */}
              <Route path="/admin/regulators" component={RegulatorManagement} />

              {/* Wave 230–260 */}
              <Route path="/wave230/security" component={Wave230Security} />
              <Route path="/wave240/workflows" component={Wave240Workflows} />
              <Route path="/wave250/liquidity" component={Wave250Liquidity} />
              <Route path="/wave260/domains" component={Wave260Domains} />

              {/* 404 fallback */}
              <Route component={() => (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p className="text-6xl font-bold mb-4">404</p>
                    <p className="text-lg">Page not found</p>
                  </div>
                </div>
              )} />
            </Switch>
          </Suspense>
        </Layout>
      </Route>
    </Switch>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
