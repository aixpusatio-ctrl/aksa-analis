import { and, asc, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import {
  db,
  runLogs as runLogsTable,
  runs as runsTable,
  results as resultsTable,
  type RunRow,
} from "../database/index.ts";
import type { LogEntry, LogLevel, Paginated, ResultRow, Run, RunProgress, RunStatus, ScraperConfig } from "@shared/types.ts";
import { notFound } from "../utils/errors.ts";
import { newId, nowIso } from "../utils/ids.ts";

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    scraperId: row.scraperId,
    scraperName: row.scraperName,
    url: row.url,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    totalItems: row.totalItems,
    pagesProcessed: row.pagesProcessed,
    pagesPlanned: row.pagesPlanned,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    config: row.config,
  };
}

export function createRun(input: { scraperId: string | null; config: ScraperConfig }): Run {
  const id = newId();
  db.insert(runsTable)
    .values({
      id,
      scraperId: input.scraperId,
      scraperName: input.config.name,
      url: input.config.url,
      status: "queued",
      config: input.config,
      createdAt: nowIso(),
    })
    .run();
  return getRun(id);
}

export function getRun(id: string): Run {
  const row = db.select().from(runsTable).where(eq(runsTable.id, id)).get();
  if (!row) throw notFound(`Run ${id} does not exist`);
  return toRun(row);
}

export function findRun(id: string): Run | null {
  const row = db.select().from(runsTable).where(eq(runsTable.id, id)).get();
  return row ? toRun(row) : null;
}

export function updateRun(
  id: string,
  patch: Partial<{
    status: RunStatus;
    startedAt: string | null;
    finishedAt: string | null;
    totalItems: number;
    pagesProcessed: number;
    pagesPlanned: number | null;
    errorMessage: string | null;
  }>,
): void {
  db.update(runsTable).set(patch).where(eq(runsTable.id, id)).run();
}

/** Progress snapshot used by `GET /api/scrapers/:id/status` and SSE. */
export function runProgress(run: Run): RunProgress {
  const percent =
    run.pagesPlanned && run.pagesPlanned > 0
      ? Math.min(100, Math.round((run.pagesProcessed / run.pagesPlanned) * 100))
      : run.status === "completed"
        ? 100
        : null;

  return {
    runId: run.id,
    status: run.status,
    pagesProcessed: run.pagesProcessed,
    pagesPlanned: run.pagesPlanned,
    totalItems: run.totalItems,
    currentUrl: null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    errorMessage: run.errorMessage,
    percent,
  };
}

export interface HistoryQuery {
  page?: number;
  pageSize?: number;
  status?: RunStatus | "all";
  search?: string;
  scraperId?: string;
}

export function listRuns(query: HistoryQuery = {}): Paginated<Run> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 20));

  const filters = [];
  if (query.status && query.status !== "all") filters.push(eq(runsTable.status, query.status));
  if (query.scraperId) filters.push(eq(runsTable.scraperId, query.scraperId));
  if (query.search?.trim()) {
    const needle = `%${query.search.trim()}%`;
    filters.push(or(like(runsTable.scraperName, needle), like(runsTable.url, needle)));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const total = db.select({ value: count() }).from(runsTable).where(where).get()?.value ?? 0;
  const rows = db
    .select()
    .from(runsTable)
    .where(where)
    .orderBy(desc(runsTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return { items: rows.map(toRun), total, page, pageSize };
}

export function deleteRun(id: string): void {
  getRun(id);
  // results and run_logs cascade via their foreign keys.
  db.delete(runsTable).where(eq(runsTable.id, id)).run();
}

export function latestRunForScraper(scraperId: string): Run | null {
  const row = db
    .select()
    .from(runsTable)
    .where(eq(runsTable.scraperId, scraperId))
    .orderBy(desc(runsTable.createdAt))
    .limit(1)
    .get();
  return row ? toRun(row) : null;
}

/** Runs still marked active after a restart were killed mid-flight. */
export function reconcileInterruptedRuns(): number {
  const stale = db
    .select({ id: runsTable.id })
    .from(runsTable)
    .where(inArray(runsTable.status, ["queued", "running"]))
    .all();

  if (stale.length === 0) return 0;

  db.update(runsTable)
    .set({
      status: "failed",
      finishedAt: nowIso(),
      errorMessage: "Interrupted — the server restarted while this run was active",
    })
    .where(inArray(runsTable.status, ["queued", "running"]))
    .run();

  return stale.length;
}

/* ------------------------------------------------------------------ */
/* Logs                                                               */
/* ------------------------------------------------------------------ */

export function appendLog(runId: string, level: LogLevel, message: string, createdAt = nowIso()): void {
  db.insert(runLogsTable).values({ runId, level, message, createdAt }).run();
}

export function listLogs(runId: string, options: { limit?: number; afterId?: number } = {}): LogEntry[] {
  const limit = Math.min(5000, Math.max(1, options.limit ?? 500));
  const filters = [eq(runLogsTable.runId, runId)];
  if (options.afterId !== undefined) filters.push(sql`${runLogsTable.id} > ${options.afterId}`);

  return db
    .select()
    .from(runLogsTable)
    .where(and(...filters))
    .orderBy(asc(runLogsTable.id))
    .limit(limit)
    .all();
}

/* ------------------------------------------------------------------ */
/* Results                                                            */
/* ------------------------------------------------------------------ */

export function insertResults(
  runId: string,
  pageNumber: number,
  pageUrl: string,
  items: Record<string, unknown>[],
  startPosition: number,
): void {
  if (items.length === 0) return;
  const createdAt = nowIso();
  const rows = items.map((data, index) => ({
    runId,
    pageNumber,
    pageUrl,
    position: startPosition + index,
    data,
    createdAt,
  }));

  // One transaction per page keeps the result table consistent even if the
  // run is stopped halfway through writing.
  db.transaction((tx) => {
    for (let offset = 0; offset < rows.length; offset += 200) {
      tx.insert(resultsTable).values(rows.slice(offset, offset + 200)).run();
    }
  });
}

export function countResults(runId: string): number {
  return db.select({ value: count() }).from(resultsTable).where(eq(resultsTable.runId, runId)).get()?.value ?? 0;
}

export interface ResultQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

export function listResults(runId: string, query: ResultQuery = {}): Paginated<ResultRow> & { columns: string[] } {
  getRun(runId);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(1000, Math.max(1, query.pageSize ?? 50));

  const filters = [eq(resultsTable.runId, runId)];
  if (query.search?.trim()) {
    // The row is stored as JSON, so a LIKE over the raw text is a cheap
    // full-row search that needs no extra index.
    filters.push(like(sql`CAST(${resultsTable.data} AS TEXT)`, `%${query.search.trim()}%`));
  }
  const where = and(...filters);

  const total = db.select({ value: count() }).from(resultsTable).where(where).get()?.value ?? 0;
  const rows = db
    .select()
    .from(resultsTable)
    .where(where)
    .orderBy(asc(resultsTable.pageNumber), asc(resultsTable.position), asc(resultsTable.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return {
    items: rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      pageNumber: row.pageNumber,
      pageUrl: row.pageUrl,
      position: row.position,
      data: row.data,
      createdAt: row.createdAt,
    })),
    total,
    page,
    pageSize,
    columns: resultColumns(runId),
  };
}

/** Column order comes from the run's field configuration, not the data. */
export function resultColumns(runId: string): string[] {
  const run = getRun(runId);
  const configured = run.config.fields.map((field) => field.name).filter(Boolean);
  if (configured.length > 0) return configured;

  const sample = db.select().from(resultsTable).where(eq(resultsTable.runId, runId)).limit(50).all();
  const seen = new Set<string>();
  for (const row of sample) for (const key of Object.keys(row.data ?? {})) seen.add(key);
  return [...seen];
}

/** Stream every result row for a run in batches — used by the exporters. */
export function* iterateResults(runId: string, batchSize = 500): Generator<ResultRow[]> {
  let offset = 0;
  while (true) {
    const rows = db
      .select()
      .from(resultsTable)
      .where(eq(resultsTable.runId, runId))
      .orderBy(asc(resultsTable.pageNumber), asc(resultsTable.position), asc(resultsTable.id))
      .limit(batchSize)
      .offset(offset)
      .all();

    if (rows.length === 0) return;
    yield rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      pageNumber: row.pageNumber,
      pageUrl: row.pageUrl,
      position: row.position,
      data: row.data,
      createdAt: row.createdAt,
    }));

    if (rows.length < batchSize) return;
    offset += batchSize;
  }
}

/** Aggregate numbers for the dashboard cards. */
export function dashboardStats(): {
  totalRuns: number;
  totalItems: number;
  activeRuns: number;
  failedRuns: number;
  savedScrapers: number;
} {
  const totalRuns = db.select({ value: count() }).from(runsTable).get()?.value ?? 0;
  const totalItems =
    db.select({ value: sql<number>`coalesce(sum(${runsTable.totalItems}), 0)` }).from(runsTable).get()?.value ?? 0;
  const activeRuns =
    db.select({ value: count() }).from(runsTable).where(inArray(runsTable.status, ["queued", "running"])).get()?.value ?? 0;
  const failedRuns =
    db.select({ value: count() }).from(runsTable).where(eq(runsTable.status, "failed")).get()?.value ?? 0;

  return { totalRuns, totalItems: Number(totalItems), activeRuns, failedRuns, savedScrapers: 0 };
}
