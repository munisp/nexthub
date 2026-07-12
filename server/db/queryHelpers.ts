/**
 * queryHelpers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drizzle ORM query utility functions for the NextHub platform.
 *
 * Provides:
 *  - buildWhereClause: type-safe dynamic WHERE builder
 *  - buildDateRangeFilter: standardised date range conditions
 *  - buildCursorFilter / toCursorPage: keyset pagination for large tables
 *  - buildTextSearch: case-insensitive ILIKE across multiple columns
 *  - aggregateTransferStats: reusable transfer statistics aggregation
 *  - aggregateDisputeStats: reusable dispute statistics aggregation
 *  - getPositionDashboard: JOIN-based position dashboard (replaces raw SQL)
 *  - getParticipantStats: participant status counts
 */

import {
  and, or, eq, ne, gte, lte, lt, ilike, isNull, sql, count, sum, avg, max, min,
  desc, asc,
  type SQL, type Column,
} from "drizzle-orm";
import { getDb } from "../db";
import {
  nexthubTransfers,
  transferDisputes,
  nexthubParticipants,
  nexthubParticipantPositions,
  nexthubParticipantLimits,
} from "../../drizzle/nexthub_schema";

// ─── Dynamic WHERE builder ────────────────────────────────────────────────────

/**
 * Build a combined AND condition from an array of optional SQL fragments.
 * Undefined/null entries are automatically filtered out.
 */
export function buildWhereClause(conditions: (SQL | undefined | null)[]): SQL | undefined {
  const valid = conditions.filter((c): c is SQL => c != null);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  return and(...valid);
}

/**
 * Build an OR condition from an array of optional SQL fragments.
 */
export function buildOrClause(conditions: (SQL | undefined | null)[]): SQL | undefined {
  const valid = conditions.filter((c): c is SQL => c != null);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  return or(...valid);
}

// ─── Soft-delete helper ───────────────────────────────────────────────────────

/**
 * Append a `deletedAt IS NULL` condition to an existing WHERE clause.
 */
export function withSoftDelete(deletedAtColumn: Column, existing?: SQL): SQL {
  const notDeleted = isNull(deletedAtColumn);
  return existing ? and(existing, notDeleted)! : notDeleted;
}

// ─── Date range filter ────────────────────────────────────────────────────────

export interface DateRangeInput {
  fromDate?: string | Date;
  toDate?: string | Date;
}

export function buildDateRangeFilter(column: Column, range: DateRangeInput): SQL | undefined {
  const conditions: SQL[] = [];
  if (range.fromDate) conditions.push(gte(column, new Date(range.fromDate)));
  if (range.toDate) conditions.push(lte(column, new Date(range.toDate)));
  return buildWhereClause(conditions);
}

// ─── Cursor-based pagination ──────────────────────────────────────────────────

export interface CursorPageResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function buildCursorFilter(createdAtColumn: Column, cursor?: string): SQL | undefined {
  if (!cursor) return undefined;
  return lt(createdAtColumn, new Date(cursor));
}

export function toCursorPage<T extends { createdAt: Date | null }>(
  items: T[],
  limit: number,
): CursorPageResult<T> {
  const hasMore = items.length === limit;
  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1].createdAt?.toISOString() ?? null
    : null;
  return { items, nextCursor, hasMore };
}

// ─── Text search ──────────────────────────────────────────────────────────────

/**
 * Build a case-insensitive ILIKE search across multiple text columns.
 */
export function buildTextSearch(term: string, columns: Column[]): SQL | undefined {
  if (!term.trim()) return undefined;
  const pattern = `%${term.trim()}%`;
  return buildOrClause(columns.map((col) => ilike(col, pattern)));
}

// ─── Transfer statistics aggregation ─────────────────────────────────────────

export interface TransferStatsResult {
  state: string | null;
  count: number;
  totalAmountKobo: number | null;
  avgAmountKobo: number | null;
  minAmountKobo: number | null;
  maxAmountKobo: number | null;
}

export async function aggregateTransferStats(
  opts: DateRangeInput & { payerFspId?: string; payeeFspId?: string } = {},
): Promise<TransferStatsResult[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: SQL[] = [];
  if (opts.payerFspId) conditions.push(eq(nexthubTransfers.payerFspId, opts.payerFspId));
  if (opts.payeeFspId) conditions.push(eq(nexthubTransfers.payeeFspId, opts.payeeFspId));
  const dateFilter = buildDateRangeFilter(nexthubTransfers.createdAt as Column, opts);
  if (dateFilter) conditions.push(dateFilter);

  const where = buildWhereClause(conditions);

  return db
    .select({
      state: nexthubTransfers.state,
      count: count(),
      totalAmountKobo: sum(nexthubTransfers.amountKobo),
      avgAmountKobo: avg(nexthubTransfers.amountKobo),
      minAmountKobo: min(nexthubTransfers.amountKobo),
      maxAmountKobo: max(nexthubTransfers.amountKobo),
    })
    .from(nexthubTransfers)
    .where(where)
    .groupBy(nexthubTransfers.state)
    .orderBy(desc(count())) as Promise<TransferStatsResult[]>;
}

// ─── Dispute statistics aggregation ──────────────────────────────────────────

export interface DisputeStatsResult {
  status: string | null;
  count: number;
  totalAmountKobo: number | null;
  avgResolutionHours: number | null;
}

export async function aggregateDisputeStats(
  opts: DateRangeInput = {},
): Promise<DisputeStatsResult[]> {
  const db = await getDb();
  if (!db) return [];

  const dateFilter = buildDateRangeFilter(transferDisputes.createdAt as Column, opts);

  return db
    .select({
      status: transferDisputes.status,
      count: count(),
      totalAmountKobo: sum(transferDisputes.amountKobo),
      avgResolutionHours: sql<number>`
        AVG(EXTRACT(EPOCH FROM (${transferDisputes.updatedAt} - ${transferDisputes.createdAt})) / 3600)
      `,
    })
    .from(transferDisputes)
    .where(dateFilter)
    .groupBy(transferDisputes.status)
    .orderBy(desc(count())) as Promise<DisputeStatsResult[]>;
}

// ─── Participant position dashboard ──────────────────────────────────────────

export interface ParticipantPositionSummary {
  participantId: string;
  name: string;
  dfspId: string;
  currentValue: number;
  reservedValue: number;
  availableValue: number;
  ndcUtilisation: number;
  positionStatus: string;
  netDebitCap: number;
  lastUpdated: Date | null;
}

/**
 * Fetch participant positions with limits in a single JOIN query.
 * Replaces the raw SQL in nexthubParticipants.ts getPositionDashboard.
 */
export async function getPositionDashboard(
  currency: string,
  statusFilter?: string,
): Promise<{ positions: ParticipantPositionSummary[]; summary: Record<string, number> }> {
  const db = await getDb();
  if (!db) return { positions: [], summary: {} };

  const conditions: SQL[] = [
    ne(nexthubParticipants.status, "OFFBOARDED"),
    eq(nexthubParticipants.currency, currency),
  ];
  if (statusFilter && statusFilter !== "ALL") {
    conditions.push(eq(nexthubParticipantPositions.positionStatus, statusFilter));
  }

  const rows = await db
    .select({
      participantId: nexthubParticipants.id,
      name: nexthubParticipants.name,
      dfspId: nexthubParticipants.dfspId,
      currentValue: sql<number>`COALESCE(${nexthubParticipantPositions.currentValue}, 0)`,
      reservedValue: sql<number>`COALESCE(${nexthubParticipantPositions.reservedValue}, 0)`,
      availableValue: sql<number>`COALESCE(${nexthubParticipantPositions.availableValue}, 0)`,
      ndcUtilisation: sql<number>`COALESCE(${nexthubParticipantPositions.ndcUtilisation}, 0)`,
      positionStatus: sql<string>`COALESCE(${nexthubParticipantPositions.positionStatus}, 'OK')`,
      netDebitCap: sql<number>`COALESCE(${nexthubParticipantLimits.netDebitCap}, 0)`,
      lastUpdated: nexthubParticipantPositions.lastUpdated,
    })
    .from(nexthubParticipants)
    .leftJoin(
      nexthubParticipantPositions,
      and(
        eq(nexthubParticipantPositions.participantId, nexthubParticipants.id),
        eq(nexthubParticipantPositions.currency, currency),
      ),
    )
    .leftJoin(
      nexthubParticipantLimits,
      and(
        eq(nexthubParticipantLimits.participantId, nexthubParticipants.id),
        eq(nexthubParticipantLimits.currency, currency),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(sql`COALESCE(${nexthubParticipantPositions.ndcUtilisation}, 0)`));

  const summary = {
    total: rows.length,
    breached: rows.filter((r) => r.positionStatus === "BREACHED").length,
    alert: rows.filter((r) => r.positionStatus === "ALERT").length,
    suspended: rows.filter((r) => r.positionStatus === "SUSPENDED").length,
    ok: rows.filter((r) => r.positionStatus === "OK").length,
  };

  return { positions: rows as ParticipantPositionSummary[], summary };
}

// ─── Participant stats ────────────────────────────────────────────────────────

export interface ParticipantStats {
  activeCount: number;
  suspendedCount: number;
  pendingCount: number;
  offboardedCount: number;
  totalCount: number;
}

export async function getParticipantStats(): Promise<ParticipantStats> {
  const db = await getDb();
  if (!db) {
    return { activeCount: 0, suspendedCount: 0, pendingCount: 0, offboardedCount: 0, totalCount: 0 };
  }

  const rows = await db
    .select({
      status: nexthubParticipants.status,
      count: count(),
    })
    .from(nexthubParticipants)
    .groupBy(nexthubParticipants.status);

  const result: ParticipantStats = {
    activeCount: 0,
    suspendedCount: 0,
    pendingCount: 0,
    offboardedCount: 0,
    totalCount: 0,
  };

  for (const row of rows) {
    result.totalCount += row.count;
    switch (row.status) {
      case "ACTIVE":     result.activeCount = row.count; break;
      case "SUSPENDED":  result.suspendedCount = row.count; break;
      case "PENDING":    result.pendingCount = row.count; break;
      case "OFFBOARDED": result.offboardedCount = row.count; break;
    }
  }

  return result;
}
