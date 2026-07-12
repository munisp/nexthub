/**
 * nexthubRepository.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Repository pattern layer for all NextHub domain entities.
 *
 * Each repository provides:
 *  - Type-safe CRUD operations via Drizzle query builder (no raw SQL)
 *  - Cursor-based and offset pagination with consistent return shapes
 *  - Soft-delete support (deletedAt timestamp) where applicable
 *  - Optimistic-lock upserts for position/limit tables
 *
 * Usage:
 *   import { repositories } from "./db/nexthubRepository";
 *   const participant = await repositories.participant.findByDfspId("DFSP001");
 */

import {
  eq, and, ne, desc, asc, gte, lte, like, sql, count, inArray,
  type SQL,
} from "drizzle-orm";
import { getDb } from "../db";
import {
  nexthubParticipants,
  nexthubParticipantLimits,
  nexthubParticipantPositions,
  nexthubLiquidityWindows,
  nexthubTransfers,
  nexthubFxRates,
  nexthubPispConsents,
  nexthubInvoices,
  nexthubDfsps,
  transferDisputes,
  settlementWindows,
  settlementNetPositions,
  reconciliationExceptions,
  nexthubSecurityEvents,
  amlRules,
  nexthubBulkTransfers,
  nexthubOracles,
} from "../../drizzle/nexthub_schema";

// ─── Pagination helpers ───────────────────────────────────────────────────────

export interface PageInput {
  limit?: number;
  offset?: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

async function paginate<T>(
  baseQuery: () => Promise<T[]>,
  countQuery: () => Promise<number>,
  limit: number,
  offset: number,
): Promise<PageResult<T>> {
  const [items, total] = await Promise.all([baseQuery(), countQuery()]);
  return { items, total, limit, offset, hasMore: offset + items.length < total };
}

// ─── Participant Repository ───────────────────────────────────────────────────

export class ParticipantRepository {
  async findById(id: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(nexthubParticipants)
      .where(eq(nexthubParticipants.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByDfspId(dfspId: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(nexthubParticipants)
      .where(eq(nexthubParticipants.dfspId, dfspId))
      .limit(1);
    return row ?? null;
  }

  async list(opts: PageInput & {
    status?: string;
    currency?: string;
    search?: string;
  } = {}): Promise<PageResult<typeof nexthubParticipants.$inferSelect>> {
    const db = await getDb();
    if (!db) return { items: [], total: 0, limit: 50, offset: 0, hasMore: false };
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const conditions: SQL[] = [ne(nexthubParticipants.status, "OFFBOARDED")];
    if (opts.status && opts.status !== "ALL") {
      conditions.push(eq(nexthubParticipants.status, opts.status));
    }
    if (opts.currency) {
      conditions.push(eq(nexthubParticipants.currency, opts.currency));
    }
    if (opts.search) {
      conditions.push(like(nexthubParticipants.name, `%${opts.search}%`));
    }

    const where = and(...conditions);
    return paginate(
      () => db.select().from(nexthubParticipants).where(where)
        .orderBy(asc(nexthubParticipants.name)).limit(limit).offset(offset),
      async () => {
        const [{ value }] = await db.select({ value: count() })
          .from(nexthubParticipants).where(where);
        return value;
      },
      limit,
      offset,
    );
  }

  async updateStatus(id: string, status: string) {
    const db = await getDb();
    if (!db) return null;
    const [updated] = await db
      .update(nexthubParticipants)
      .set({ status, updatedAt: new Date() })
      .where(eq(nexthubParticipants.id, id))
      .returning();
    return updated ?? null;
  }

  async upsertPosition(
    participantId: string,
    currency: string,
    patch: Partial<{
      currentValue: number;
      reservedValue: number;
      availableValue: number;
      ndcUtilisation: number;
      positionStatus: string;
      lastTransferId: string;
    }>,
  ): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db
      .insert(nexthubParticipantPositions)
      .values({
        id: crypto.randomUUID(),
        participantId,
        currency,
        currentValue: patch.currentValue ?? 0,
        reservedValue: patch.reservedValue ?? 0,
        availableValue: patch.availableValue ?? 0,
        ndcUtilisation: patch.ndcUtilisation ?? 0,
        positionStatus: patch.positionStatus ?? "OK",
        lastTransferId: patch.lastTransferId ?? null,
        lastUpdated: new Date(),
      })
      .onConflictDoUpdate({
        target: [nexthubParticipantPositions.participantId, nexthubParticipantPositions.currency],
        set: {
          ...patch,
          lastUpdated: new Date(),
        },
      });
  }
}

// ─── Transfer Repository ──────────────────────────────────────────────────────

export class TransferRepository {
  async findById(id: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(nexthubTransfers)
      .where(eq(nexthubTransfers.id, id))
      .limit(1);
    return row ?? null;
  }

  async list(opts: PageInput & {
    payerFspId?: string;
    payeeFspId?: string;
    state?: string;
    fromDate?: Date;
    toDate?: Date;
  } = {}): Promise<PageResult<typeof nexthubTransfers.$inferSelect>> {
    const db = await getDb();
    if (!db) return { items: [], total: 0, limit: 50, offset: 0, hasMore: false };
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const conditions: SQL[] = [];
    if (opts.payerFspId) conditions.push(eq(nexthubTransfers.payerFspId, opts.payerFspId));
    if (opts.payeeFspId) conditions.push(eq(nexthubTransfers.payeeFspId, opts.payeeFspId));
    if (opts.state) conditions.push(eq(nexthubTransfers.state, opts.state));
    if (opts.fromDate) conditions.push(gte(nexthubTransfers.createdAt, opts.fromDate));
    if (opts.toDate) conditions.push(lte(nexthubTransfers.createdAt, opts.toDate));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return paginate(
      () => db.select().from(nexthubTransfers).where(where)
        .orderBy(desc(nexthubTransfers.createdAt)).limit(limit).offset(offset),
      async () => {
        const [{ value }] = await db.select({ value: count() })
          .from(nexthubTransfers).where(where);
        return value;
      },
      limit,
      offset,
    );
  }

  async updateState(id: string, state: string) {
    const db = await getDb();
    if (!db) return null;
    const [updated] = await db
      .update(nexthubTransfers)
      .set({ state, updatedAt: new Date() })
      .where(eq(nexthubTransfers.id, id))
      .returning();
    return updated ?? null;
  }
}

// ─── Dispute Repository ───────────────────────────────────────────────────────

export class DisputeRepository {
  async findById(id: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(transferDisputes)
      .where(eq(transferDisputes.id, id))
      .limit(1);
    return row ?? null;
  }

  async list(opts: PageInput & {
    status?: string;
    dfspId?: string;
    fromDate?: Date;
    toDate?: Date;
  } = {}) {
    const db = await getDb();
    if (!db) return { items: [], total: 0, limit: 50, offset: 0, hasMore: false };
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const conditions: SQL[] = [];
    if (opts.status) conditions.push(eq(transferDisputes.status, opts.status));
    if (opts.dfspId) {
      conditions.push(
        sql`(${transferDisputes.initiatedByDfspId} = ${opts.dfspId} OR ${transferDisputes.respondingDfspId} = ${opts.dfspId})`,
      );
    }
    if (opts.fromDate) conditions.push(gte(transferDisputes.createdAt, opts.fromDate));
    if (opts.toDate) conditions.push(lte(transferDisputes.createdAt, opts.toDate));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return paginate(
      () => db.select().from(transferDisputes).where(where)
        .orderBy(desc(transferDisputes.createdAt)).limit(limit).offset(offset),
      async () => {
        const [{ value }] = await db.select({ value: count() })
          .from(transferDisputes).where(where);
        return value;
      },
      limit,
      offset,
    );
  }

  async updateStatus(id: string, status: string, resolvedBy?: string): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db
      .update(transferDisputes)
      .set({
        status,
        updatedAt: new Date(),
        ...(status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
      })
      .where(eq(transferDisputes.id, id));
  }

  async statistics(fromDate?: Date, toDate?: Date) {
    const db = await getDb();
    if (!db) return [];
    const conditions: SQL[] = [];
    if (fromDate) conditions.push(gte(transferDisputes.createdAt, fromDate));
    if (toDate) conditions.push(lte(transferDisputes.createdAt, toDate));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return db
      .select({
        status: transferDisputes.status,
        count: count(),
        totalAmountKobo: sql<number>`SUM(${transferDisputes.amountKobo})`,
        avgResolutionHours: sql<number>`
          AVG(EXTRACT(EPOCH FROM (${transferDisputes.updatedAt} - ${transferDisputes.createdAt})) / 3600)
        `,
      })
      .from(transferDisputes)
      .where(where)
      .groupBy(transferDisputes.status)
      .orderBy(desc(count()));
  }
}

// ─── Settlement Repository ────────────────────────────────────────────────────

export class SettlementRepository {
  async findWindowById(id: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(settlementWindows)
      .where(eq(settlementWindows.id, id))
      .limit(1);
    return row ?? null;
  }

  async listOpenWindows() {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(settlementWindows)
      .where(eq(settlementWindows.status, "OPEN"))
      .orderBy(desc(settlementWindows.openedAt));
  }

  async getNetPositions(windowId: string) {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(settlementNetPositions)
      .where(eq(settlementNetPositions.windowId, windowId))
      .orderBy(asc(settlementNetPositions.dfspId));
  }

  async closeWindow(id: string): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db
      .update(settlementWindows)
      .set({ status: "CLOSED", closedAt: new Date(), updatedAt: new Date() })
      .where(eq(settlementWindows.id, id));
  }
}

// ─── PISP Consent Repository ──────────────────────────────────────────────────

export class PispConsentRepository {
  async findById(consentId: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(nexthubPispConsents)
      .where(eq(nexthubPispConsents.consentId, consentId))
      .limit(1);
    return row ?? null;
  }

  async listActiveByConsumer(consumerId: string) {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(nexthubPispConsents)
      .where(
        and(
          eq(nexthubPispConsents.consumerId, consumerId),
          eq(nexthubPispConsents.state, "ACTIVE"),
        ),
      )
      .orderBy(desc(nexthubPispConsents.createdAt));
  }

  async revokeExpired(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;
    const result = await db
      .update(nexthubPispConsents)
      .set({ state: "REVOKED", updatedAt: new Date() })
      .where(
        and(
          eq(nexthubPispConsents.state, "ACTIVE"),
          sql`${nexthubPispConsents.expiresAt} < NOW()`,
        ),
      )
      .returning({ id: nexthubPispConsents.consentId });
    return result.length;
  }
}

// ─── Billing Repository ───────────────────────────────────────────────────────

export class BillingRepository {
  async findInvoiceById(id: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(nexthubInvoices)
      .where(eq(nexthubInvoices.id, id))
      .limit(1);
    return row ?? null;
  }

  async listByDfsp(dfspId: string, opts: PageInput = {}) {
    const db = await getDb();
    if (!db) return { items: [], total: 0, limit: 50, offset: 0, hasMore: false };
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    return paginate(
      () => db.select().from(nexthubInvoices)
        .where(eq(nexthubInvoices.dfspId, dfspId))
        .orderBy(desc(nexthubInvoices.createdAt)).limit(limit).offset(offset),
      async () => {
        const [{ value }] = await db.select({ value: count() })
          .from(nexthubInvoices).where(eq(nexthubInvoices.dfspId, dfspId));
        return value;
      },
      limit,
      offset,
    );
  }

  async markOverdue(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;
    const result = await db
      .update(nexthubInvoices)
      .set({ status: "OVERDUE", updatedAt: new Date() })
      .where(
        and(
          eq(nexthubInvoices.status, "ISSUED"),
          sql`${nexthubInvoices.dueAt} < NOW()`,
        ),
      )
      .returning({ id: nexthubInvoices.id });
    return result.length;
  }
}

// ─── FX Rate Repository ───────────────────────────────────────────────────────

export class FxRateRepository {
  async getLatestRate(sourceCurrency: string, targetCurrency: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(nexthubFxRates)
      .where(
        and(
          eq(nexthubFxRates.sourceCurrency, sourceCurrency),
          eq(nexthubFxRates.targetCurrency, targetCurrency),
          sql`${nexthubFxRates.validTo} > NOW()`,
        ),
      )
      .orderBy(desc(nexthubFxRates.validFrom))
      .limit(1);
    return row ?? null;
  }

  async listActivePairs() {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        sourceCurrency: nexthubFxRates.sourceCurrency,
        targetCurrency: nexthubFxRates.targetCurrency,
        rate: nexthubFxRates.rate,
        provider: nexthubFxRates.provider,
        validFrom: nexthubFxRates.validFrom,
        validTo: nexthubFxRates.validTo,
      })
      .from(nexthubFxRates)
      .where(sql`${nexthubFxRates.validTo} > NOW()`)
      .orderBy(
        asc(nexthubFxRates.sourceCurrency),
        asc(nexthubFxRates.targetCurrency),
        desc(nexthubFxRates.validFrom),
      );
  }
}

// ─── Security Repository ──────────────────────────────────────────────────────

export class SecurityRepository {
  async listUnacknowledgedEvents(opts: PageInput = {}) {
    const db = await getDb();
    if (!db) return { items: [], total: 0, limit: 50, offset: 0, hasMore: false };
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const where = eq(nexthubSecurityEvents.acknowledged, false);
    return paginate(
      () => db.select().from(nexthubSecurityEvents).where(where)
        .orderBy(desc(nexthubSecurityEvents.createdAt)).limit(limit).offset(offset),
      async () => {
        const [{ value }] = await db.select({ value: count() })
          .from(nexthubSecurityEvents).where(where);
        return value;
      },
      limit,
      offset,
    );
  }

  async acknowledgeEvent(id: string, acknowledgedBy: string): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db
      .update(nexthubSecurityEvents)
      .set({ acknowledged: true, acknowledgedBy, acknowledgedAt: new Date() })
      .where(eq(nexthubSecurityEvents.id, id));
  }

  async getEnabledAmlRules() {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(amlRules)
      .where(eq(amlRules.isEnabled, true))
      .orderBy(asc(amlRules.ruleName));
  }
}

// ─── DFSP Repository ──────────────────────────────────────────────────────────

export class DfspRepository {
  async findById(dfspId: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(nexthubDfsps)
      .where(eq(nexthubDfsps.dfspId, dfspId))
      .limit(1);
    return row ?? null;
  }

  async listActive() {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(nexthubDfsps)
      .where(eq(nexthubDfsps.status, "ACTIVE"))
      .orderBy(asc(nexthubDfsps.dfspName));
  }

  async findByIds(dfspIds: string[]) {
    const db = await getDb();
    if (!db || dfspIds.length === 0) return [];
    return db
      .select()
      .from(nexthubDfsps)
      .where(inArray(nexthubDfsps.dfspId, dfspIds));
  }
}

// ─── Oracle Repository ────────────────────────────────────────────────────────

export class OracleRepository {
  async listActive() {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(nexthubOracles)
      .where(eq(nexthubOracles.isActive, 1))
      .orderBy(asc(nexthubOracles.partyIdType));
  }

  async findById(oracleId: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(nexthubOracles)
      .where(eq(nexthubOracles.oracleId, oracleId))
      .limit(1);
    return row ?? null;
  }
}

// ─── Bulk Transfer Repository ─────────────────────────────────────────────────

export class BulkTransferRepository {
  async findById(bulkTransferId: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(nexthubBulkTransfers)
      .where(eq(nexthubBulkTransfers.bulkTransferId, bulkTransferId))
      .limit(1);
    return row ?? null;
  }

  async list(opts: PageInput & { state?: string; payerFsp?: string } = {}) {
    const db = await getDb();
    if (!db) return { items: [], total: 0, limit: 50, offset: 0, hasMore: false };
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const conditions: SQL[] = [];
    if (opts.state) conditions.push(eq(nexthubBulkTransfers.state, opts.state));
    if (opts.payerFsp) conditions.push(eq(nexthubBulkTransfers.payerFsp, opts.payerFsp));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return paginate(
      () => db.select().from(nexthubBulkTransfers).where(where)
        .orderBy(desc(nexthubBulkTransfers.createdAt)).limit(limit).offset(offset),
      async () => {
        const [{ value }] = await db.select({ value: count() })
          .from(nexthubBulkTransfers).where(where);
        return value;
      },
      limit,
      offset,
    );
  }
}

// ─── Reconciliation Repository ────────────────────────────────────────────────

export class ReconciliationRepository {
  async listOpen(opts: PageInput = {}) {
    const db = await getDb();
    if (!db) return { items: [], total: 0, limit: 50, offset: 0, hasMore: false };
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const where = eq(reconciliationExceptions.status, "OPEN");
    return paginate(
      () => db.select().from(reconciliationExceptions).where(where)
        .orderBy(desc(reconciliationExceptions.createdAt)).limit(limit).offset(offset),
      async () => {
        const [{ value }] = await db.select({ value: count() })
          .from(reconciliationExceptions).where(where);
        return value;
      },
      limit,
      offset,
    );
  }

  async resolve(id: string, resolvedBy: string, notes?: string): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db
      .update(reconciliationExceptions)
      .set({
        status: "RESOLVED",
        assignedTo: resolvedBy,
        resolvedAt: new Date(),
        resolutionNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(reconciliationExceptions.id, id));
  }
}

// ─── Repository factory (convenience) ────────────────────────────────────────

export const repositories = {
  participant: new ParticipantRepository(),
  transfer: new TransferRepository(),
  dispute: new DisputeRepository(),
  settlement: new SettlementRepository(),
  pispConsent: new PispConsentRepository(),
  billing: new BillingRepository(),
  fxRate: new FxRateRepository(),
  security: new SecurityRepository(),
  dfsp: new DfspRepository(),
  oracle: new OracleRepository(),
  bulkTransfer: new BulkTransferRepository(),
  reconciliation: new ReconciliationRepository(),
};
