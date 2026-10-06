/**
 * Types shared by the Bun server and the React client.
 *
 * This file is the single source of truth for the shape of a scraper
 * configuration, so the form in the UI and the engine that executes it can
 * never drift apart.
 */

/* ------------------------------------------------------------------ */
/* Scraper configuration                                              */
/* ------------------------------------------------------------------ */

/** How a selector string should be interpreted. */
export type SelectorKind = "css" | "xpath";

/**
 * What to pull out of a matched element.
 *
 * - `text`      – visible text (`innerText`, falling back to `textContent`).
 *                 `innerText` is what the page renders, so the browser has
 *                 already collapsed runs of whitespace before `trim` applies.
 * - `html`      – the element's `innerHTML`
 * - `link`      – `href`, resolved against the page URL to an absolute URL
 * - `image`     – `src` / `data-src` / first `srcset` candidate, resolved absolute
 * - `title`     – `title` attribute, falling back to `aria-label`, `alt`, then text
 * - `attribute` – an arbitrary attribute named by `attribute`
 */
export type FieldType = "text" | "html" | "link" | "image" | "title" | "attribute";

export interface FieldConfig {
  /** Stable id, used as a React key and to reorder fields. */
  id: string;
  /** Output column name, e.g. `price`. */
  name: string;
  /**
   * Selector for the value, evaluated *relative to the item element* when an
   * item selector is configured, otherwise relative to the document.
   * Leave empty to read the item element itself.
   */
  selector: string;
  selectorKind: SelectorKind;
  type: FieldType;
  /** Attribute name — only used when `type` is `attribute`. */
  attribute?: string;
  /** Collect every match into an array instead of taking the first. */
  multiple?: boolean;
  /** Collapse whitespace and trim. Defaults to true. */
  trim?: boolean;
  /** Drop the whole item when this field resolves to nothing. */
  required?: boolean;
}

export type PaginationMode = "none" | "selector" | "url-pattern" | "scroll";

export interface PaginationConfig {
  mode: PaginationMode;
  /** `selector` mode: element to click to advance to the next page. */
  nextSelector?: string;
  nextSelectorKind?: SelectorKind;
  /**
   * `url-pattern` mode: a URL containing `{page}`, which is replaced with the
   * page number, e.g. `https://example.com/products?page={page}`.
   */
  urlPattern?: string;
  /** `url-pattern` mode: first page number. Defaults to 1. */
  startPage?: number;
  /** `url-pattern` mode: increment between pages. Defaults to 1. */
  step?: number;
  /** `scroll` mode: how many times to scroll to the bottom. */
  scrollTimes?: number;
  /** `scroll` mode: pause between scrolls, ms. */
  scrollDelayMs?: number;
  /** Stop early when a page yields no rows we haven't already seen. */
  stopWhenNoNewItems?: boolean;
}

export type WaitUntil = "load" | "domcontentloaded" | "networkidle" | "commit";

export interface ScraperConfig {
  name: string;
  url: string;
  /**
   * Selector matching one repeated record on the page (e.g. `.product`).
   * When empty the page is treated as a single record and every field is
   * resolved against the document.
   */
  itemSelector: string;
  itemSelectorKind: SelectorKind;
  fields: FieldConfig[];
  pagination: PaginationConfig;
  /** Pause between page requests, ms. */
  requestDelayMs: number;
  /** Navigation timeout, ms. */
  timeoutMs: number;
  /** Hard cap on pages visited in one run. */
  maxPages: number;
  /** Pages fetched in parallel. Only applies to `url-pattern` pagination. */
  concurrency: number;
  /** Attempts per page before giving up on it. */
  maxRetries: number;
  userAgent: string;
  waitUntil: WaitUntil;
  /** Optional selector to wait for after navigation. */
  waitForSelector?: string;
  /** Extra settle time after navigation, ms. */
  waitForTimeoutMs?: number;
  /** Refuse to fetch URLs disallowed by the target's robots.txt. */
  respectRobotsTxt: boolean;
  /** Skip downloading images/fonts/media. Faster, lighter on the target. */
  blockResources: boolean;
}

export interface Scraper extends ScraperConfig {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** Payload accepted by `POST /api/scrapers` and `PUT /api/scrapers/:id`. */
export type ScraperInput = Partial<ScraperConfig> & Pick<ScraperConfig, "url">;

/* ------------------------------------------------------------------ */
/* Runs, results, logs                                                */
/* ------------------------------------------------------------------ */

export type RunStatus = "queued" | "running" | "completed" | "stopped" | "failed";

export interface Run {
  id: string;
  scraperId: string | null;
  scraperName: string;
  url: string;
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  totalItems: number;
  pagesProcessed: number;
  pagesPlanned: number | null;
  errorMessage: string | null;
  createdAt: string;
  config: ScraperConfig;
  mode: RunMode;
}

export interface ResultRow {
  id: number;
  runId: string;
  pageNumber: number;
  pageUrl: string;
  position: number;
  data: Record<string, unknown>;
  createdAt: string;
}

export type LogLevel = "debug" | "info" | "success" | "warn" | "error";

export interface LogEntry {
  id: number;
  runId: string;
  level: LogLevel;
  message: string;
  createdAt: string;
}

export interface RunProgress {
  runId: string;
  status: RunStatus;
  pagesProcessed: number;
  pagesPlanned: number | null;
  totalItems: number;
  currentUrl: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  /** 0–100 when the total page count is known, otherwise null. */
  percent: number | null;
}

/* ------------------------------------------------------------------ */
/* Realtime events (SSE)                                              */
/* ------------------------------------------------------------------ */

export type ScraperEvent =
  | { type: "log"; runId: string; payload: Omit<LogEntry, "id"> }
  | { type: "progress"; runId: string; payload: RunProgress }
  | { type: "status"; runId: string; payload: RunProgress }
  | { type: "items"; runId: string; payload: { pageNumber: number; count: number; sample: Record<string, unknown>[] } };

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
  theme: ThemeMode;
  defaultRequestDelayMs: number;
  defaultTimeoutMs: number;
  maxConcurrentPages: number;
  defaultUserAgent: string;
  defaultMaxPages: number;
  defaultMaxRetries: number;
  respectRobotsTxt: boolean;
  blockResources: boolean;
}

/* ------------------------------------------------------------------ */
/* API envelopes                                                      */
/* ------------------------------------------------------------------ */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export type ExportFormat = "csv" | "json" | "xlsx";

/* ------------------------------------------------------------------ */
/* Visual inspector                                                   */
/* ------------------------------------------------------------------ */

export interface SnapshotInfo {
  id: string;
  url: string;
  title: string;
  elementCount: number;
  robotsAllowed: boolean;
  createdAt: string;
  /** Same-origin path the dashboard iframes. */
  pageUrl: string;
}

/** What the picker reports when an element is clicked in the preview. */
export interface PickedElement {
  ref: string | null;
  tag: string;
  id: string | null;
  classes: string[];
  /** Selector that matches this one element. */
  css: string;
  /** Selector generalized to match every sibling that looks the same. */
  cssAll: string;
  xpath: string;
  xpathAll: string;
  suggestedType: FieldType;
  text: string;
  preview: string | null;
  countExact: number;
  countAll: number;
  /** The nearest repeating ancestor — the natural item for a list. */
  itemCandidate: { selector: string; count: number; relative: string } | null;
}

export interface SelectorTestResult {
  selector: string;
  selectorKind: SelectorKind;
  count: number;
  valid: boolean;
  error: string | null;
  samples: string[];
}

export interface DetectedField {
  name: string;
  selector: string;
  type: FieldType;
  attribute?: string;
  confidence: number;
  samples: string[];
}

export interface DetectedSchema {
  itemSelector: string;
  itemCount: number;
  confidence: number;
  fields: DetectedField[];
  alternatives: { selector: string; count: number; score: number }[];
}

export interface PreviewResult {
  rows: Record<string, unknown>[];
  itemCount: number;
  matched: number;
  warnings: string[];
  url: string;
}

/* ------------------------------------------------------------------ */
/* Test runs and debugging                                            */
/* ------------------------------------------------------------------ */

export type RunMode = "normal" | "test";

export type ArtifactKind = "screenshot" | "html" | "console" | "network" | "selector-report";

export interface RunArtifact {
  id: string;
  runId: string;
  kind: ArtifactKind;
  label: string;
  pageNumber: number | null;
  pageUrl: string;
  contentType: string;
  size: number;
  createdAt: string;
  /** API path that serves the blob. */
  url: string;
}

/** Per-field match counts, the core of the debugger's "expected vs found". */
export interface SelectorReport {
  pageUrl: string;
  itemSelector: string;
  itemsFound: number;
  fields: { name: string; selector: string; type: FieldType; found: number; sample: string | null }[];
}
