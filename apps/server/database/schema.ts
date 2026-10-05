import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type {
  FieldConfig,
  PaginationConfig,
  ScraperConfig,
  SelectorKind,
  WaitUntil,
} from "@shared/types.ts";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/** Saved scraper configurations. */
export const scrapers = sqliteTable("scrapers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  itemSelector: text("item_selector").notNull().default(""),
  itemSelectorKind: text("item_selector_kind").$type<SelectorKind>().notNull().default("css"),
  fields: text("fields", { mode: "json" }).$type<FieldConfig[]>().notNull(),
  pagination: text("pagination", { mode: "json" }).$type<PaginationConfig>().notNull(),
  requestDelayMs: integer("request_delay_ms").notNull().default(1000),
  timeoutMs: integer("timeout_ms").notNull().default(30000),
  maxPages: integer("max_pages").notNull().default(5),
  concurrency: integer("concurrency").notNull().default(1),
  maxRetries: integer("max_retries").notNull().default(2),
  userAgent: text("user_agent").notNull().default(""),
  waitUntil: text("wait_until").$type<WaitUntil>().notNull().default("domcontentloaded"),
  waitForSelector: text("wait_for_selector").notNull().default(""),
  waitForTimeoutMs: integer("wait_for_timeout_ms").notNull().default(0),
  respectRobotsTxt: integer("respect_robots_txt", { mode: "boolean" }).notNull().default(true),
  blockResources: integer("block_resources", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

/** One execution of a scraper — this table is the History view. */
export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    // Keep history rows after their scraper is deleted.
    scraperId: text("scraper_id").references(() => scrapers.id, { onDelete: "set null" }),
    scraperName: text("scraper_name").notNull(),
    url: text("url").notNull(),
    status: text("status")
      .$type<"queued" | "running" | "completed" | "stopped" | "failed">()
      .notNull()
      .default("queued"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    totalItems: integer("total_items").notNull().default(0),
    pagesProcessed: integer("pages_processed").notNull().default(0),
    pagesPlanned: integer("pages_planned"),
    errorMessage: text("error_message"),
    /** Frozen copy of the config, so an old run stays reproducible. */
    config: text("config", { mode: "json" }).$type<ScraperConfig>().notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("runs_created_at_idx").on(t.createdAt), index("runs_scraper_id_idx").on(t.scraperId)],
);

/** Extracted records, one row per scraped item. */
export const results = sqliteTable(
  "results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull().default(1),
    pageUrl: text("page_url").notNull().default(""),
    position: integer("position").notNull().default(0),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("results_run_id_idx").on(t.runId)],
);

/** Realtime log lines, persisted so history can replay them. */
export const runLogs = sqliteTable(
  "run_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    level: text("level").$type<"debug" | "info" | "success" | "warn" | "error">().notNull().default("info"),
    message: text("message").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("run_logs_run_id_idx").on(t.runId)],
);

/** Simple key/value store for application settings. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

export type ScraperRow = typeof scrapers.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type ResultRecord = typeof results.$inferSelect;
export type RunLogRow = typeof runLogs.$inferSelect;
