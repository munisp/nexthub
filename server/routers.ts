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
import { wave221DeveloperRouter } from "./routers/wave221_developer";
import { wave223Router } from "./routers/wave223_onboarding";
import { wave223ExtRouter } from "./routers/wave223_extensions";
import { wave224RegulatorRouter } from "./routers/wave224_regulator";
import { wave225RegulatorAuthRouter } from "./routers/wave225_regulator_auth";
import { wave226AdminRegulatorsRouter } from "./routers/wave226_admin_regulators";
import { wave227Router } from "./routers/wave227";

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
  developerPortal: wave221DeveloperRouter,

  // Onboarding
  wave223: wave223Router,
  wave223Ext: wave223ExtRouter,

  // Regulator portal
  regulatorPortal: wave224RegulatorRouter,
  regulatorAuth: wave225RegulatorAuthRouter,
  adminRegulators: wave226AdminRegulatorsRouter,
  regulatorDocs: wave227Router,
});

export type AppRouter = typeof appRouter;
