/**
 * routers.ts — NextHub tRPC App Router
 * ─────────────────────────────────────────────────────────────────────────────
 * Wires all NextHub sub-routers into a single appRouter.
 * This is the type-safe API surface for the NextHub frontend (Admin + Regulator).
 *
 * External DFSP clients (like Paygate) do NOT use tRPC — they call the
 * REST Integration API at /api/v1/* (see server/integrationApi.ts).
 */
import { router } from "./_core/trpc";

// ─── NextHub domain routers ───────────────────────────────────────────────────
import { nexthubSettlementRouter } from "./routers/nexthubSettlement";
import { nexthubParticipantsRouter } from "./routers/nexthubParticipants";
import { nexthubFXRouter } from "./routers/nexthubFX";
import { nexthubBillingRouter } from "./routers/nexthubBilling";
import { nexthubDisputesRouter } from "./routers/nexthubDisputes";
import { nexthubSecurityRouter } from "./routers/nexthubSecurity";
import { nexthubOraclesRouter } from "./routers/nexthubOracles";
import { nexthubBulkTransfersRouter } from "./routers/nexthubBulkTransfers";
import { nexthubPISPRouter } from "./routers/nexthubPISP";
import { nexthubReconciliationRouter } from "./routers/nexthubReconciliation";
import { nexthubDfspsRouter } from "./routers/nexthubDfsps";

// ─── Wave routers (nexthub-owned) ────────────────────────────────────────────
import { wave221Router } from "./routers/wave221_developer";
import { wave223Router } from "./routers/wave223_onboarding";
import { wave223ExtRouter } from "./routers/wave223_extensions";
import { regulatorPortalRouter } from "./routers/wave224_regulator";
import { regulatorAuthRouter } from "./routers/wave225_regulator_auth";
import { adminRegulatorsRouter } from "./routers/wave226_admin_regulators";
import { regulatorDocsRouter, ndcBreachRouter } from "./routers/wave227";

// ─── Wave 230–260 routers ─────────────────────────────────────────────────────
import { wave230Router } from "./routers/wave230_security";
import { wave240Router } from "./routers/wave240_workflows";
import { wave250Router } from "./routers/wave250_liquidity";
import { wave260Router } from "./routers/wave260_domains";
import { nibssNipRouter } from "./routers/nibssNip";
import { nexthubTenantsRouter } from "./routers/nexthubTenants";
import { nexthubLiquidityRouter } from "./routers/nexthubLiquidity";
import { nexthubIdentityDirectoryRouter } from "./routers/nexthubIdentityDirectory";
import { nexthubHsmRouter } from "./routers/nexthubHsm";
import { nexthubArbitrationRouter } from "./routers/nexthubArbitration";

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  // Core hub operations
  nexthubSettlement: nexthubSettlementRouter,
  nexthubParticipants: nexthubParticipantsRouter,
  nexthubFX: nexthubFXRouter,
  nexthubBilling: nexthubBillingRouter,
  nexthubDisputes: nexthubDisputesRouter,
  nexthubSecurity: nexthubSecurityRouter,
  nexthubOracles: nexthubOraclesRouter,
  nexthubBulkTransfers: nexthubBulkTransfersRouter,
  nexthubPISP: nexthubPISPRouter,
  nexthubReconciliation: nexthubReconciliationRouter,
  nexthubDfsps: nexthubDfspsRouter,

  // Developer portal (hub-side API key management)
  developerPortal: wave221Router,

  // Onboarding
  wave223: wave223Router,
  wave223Ext: wave223ExtRouter,

  // Regulator portal
  regulatorPortal: regulatorPortalRouter,
  regulatorAuth: regulatorAuthRouter,
  adminRegulators: adminRegulatorsRouter,
  regulatorDocs: regulatorDocsRouter,
  ndcBreach: ndcBreachRouter,

  // Wave 230: JWS non-repudiation, HSM key management, mTLS
  wave230Security: wave230Router,

  // Wave 240: Temporal workflow orchestration + TigerBeetle ledger tracking
  wave240Workflows: wave240Router,

  // Wave 250: Liquidity cover management, collateral, settlement corridors
  wave250Liquidity: wave250Router,

  // Wave 260: CBDC, G2P, Remittance, Healthcare, Audit Trail + Lakehouse
  wave260Domains: wave260Router,
  // NIBSS / NIP: Nigerian payment rails (NIP, NQR, NEFT, RTGS, BVN)
  nibssNip: nibssNipRouter,
  // Multi-tenant & white-label management
  nexthubTenants: nexthubTenantsRouter,
  nexthubLiquidity:         nexthubLiquidityRouter,
  nexthubIdentityDirectory: nexthubIdentityDirectoryRouter,
  nexthubHsm:               nexthubHsmRouter,
  nexthubArbitration:       nexthubArbitrationRouter,
});

export type AppRouter = typeof appRouter;
