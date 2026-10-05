import { desc, eq } from "drizzle-orm";
import { db, scrapers as scrapersTable, type ScraperRow } from "../database/index.ts";
import { LIMITS } from "@shared/defaults.ts";
import type {
  FieldConfig,
  PaginationConfig,
  Scraper,
  ScraperConfig,
  ScraperInput,
  SelectorKind,
} from "@shared/types.ts";
import { badRequest, notFound } from "../utils/errors.ts";
import { asBool, assertHttpUrl, assertSelectorShape, clampInt, oneOf } from "../utils/validate.ts";
import { newId, nowIso } from "../utils/ids.ts";
import { getSettings } from "./settings-service.ts";

const SELECTOR_KINDS = ["css", "xpath"] as const;
const FIELD_TYPES = ["text", "html", "link", "image", "title", "attribute"] as const;
const PAGINATION_MODES = ["none", "selector", "url-pattern", "scroll"] as const;
const WAIT_UNTIL = ["load", "domcontentloaded", "networkidle", "commit"] as const;

function normalizeField(raw: unknown, index: number): FieldConfig {
  const input = (raw ?? {}) as Partial<FieldConfig>;
  const name = (input.name ?? "").trim();
  if (!name) throw badRequest(`Field ${index + 1} needs a name`);
  if (!/^[A-Za-z0-9_][A-Za-z0-9_ .-]*$/.test(name)) {
    throw badRequest(`Field name "${name}" may only contain letters, numbers, spaces, dots, dashes and underscores`);
  }

  const type = oneOf(input.type, FIELD_TYPES, "text");
  const attribute = (input.attribute ?? "").trim();
  if (type === "attribute" && !attribute) {
    throw badRequest(`Field "${name}" is set to "attribute" — give it an attribute name (e.g. data-id)`);
  }

  const selector = (input.selector ?? "").trim();
  assertSelectorShape(selector, `Selector for field "${name}"`);

  return {
    id: input.id || newId(),
    name,
    selector,
    selectorKind: oneOf(input.selectorKind, SELECTOR_KINDS, "css"),
    type,
    ...(type === "attribute" ? { attribute } : {}),
    multiple: asBool(input.multiple, false),
    trim: asBool(input.trim, true),
    required: asBool(input.required, false),
  };
}

function normalizePagination(raw: unknown): PaginationConfig {
  const input = (raw ?? {}) as Partial<PaginationConfig>;
  const mode = oneOf(input.mode, PAGINATION_MODES, "none");

  const nextSelector = (input.nextSelector ?? "").trim();
  const urlPattern = (input.urlPattern ?? "").trim();

  if (mode === "selector" && !nextSelector) {
    throw badRequest('Pagination mode "next button" needs a selector for the next-page element');
  }
  if (mode === "url-pattern") {
    if (!urlPattern) throw badRequest('Pagination mode "URL pattern" needs a URL pattern');
    if (!urlPattern.includes("{page}")) throw badRequest('The URL pattern must contain the "{page}" placeholder');
    assertHttpUrl(urlPattern.replaceAll("{page}", "1"), "Pagination URL pattern");
  }

  return {
    mode,
    nextSelector,
    nextSelectorKind: oneOf(input.nextSelectorKind, SELECTOR_KINDS, "css"),
    urlPattern,
    startPage: clampInt(input.startPage, { min: 0, max: 1_000_000 }, 1),
    step: clampInt(input.step, { min: 1, max: 1000 }, 1),
    scrollTimes: clampInt(input.scrollTimes, LIMITS.scrollTimes, 3),
    scrollDelayMs: clampInt(input.scrollDelayMs, { min: 0, max: 60_000 }, 600),
    stopWhenNoNewItems: asBool(input.stopWhenNoNewItems, true),
  };
}

/**
 * Turn an untrusted payload into a config the engine can run, filling blanks
 * from the user's saved defaults and clamping every number to a sane range.
 */
export function normalizeConfig(input: ScraperInput): ScraperConfig {
  const settings = getSettings();
  const url = assertHttpUrl((input.url ?? "").trim(), "Target URL");

  const rawFields = Array.isArray(input.fields) ? input.fields : [];
  const fields = rawFields.map(normalizeField);
  if (fields.length === 0) throw badRequest("Add at least one field to extract");

  const duplicate = fields.map((f) => f.name).find((name, index, all) => all.indexOf(name) !== index);
  if (duplicate) throw badRequest(`Duplicate field name: "${duplicate}"`);

  const itemSelector = (input.itemSelector ?? "").trim();
  assertSelectorShape(itemSelector, "Item selector");

  return {
    name: (input.name ?? "").trim() || new URL(url).hostname,
    url,
    itemSelector,
    itemSelectorKind: oneOf(input.itemSelectorKind, SELECTOR_KINDS, "css"),
    fields,
    pagination: normalizePagination(input.pagination),
    requestDelayMs: clampInt(input.requestDelayMs, LIMITS.requestDelayMs, settings.defaultRequestDelayMs),
    timeoutMs: clampInt(input.timeoutMs, LIMITS.timeoutMs, settings.defaultTimeoutMs),
    maxPages: clampInt(input.maxPages, LIMITS.maxPages, settings.defaultMaxPages),
    // Never let a scraper exceed the global concurrency ceiling in Settings.
    concurrency: Math.min(
      clampInt(input.concurrency, LIMITS.concurrency, 1),
      clampInt(settings.maxConcurrentPages, LIMITS.concurrency, 2),
    ),
    maxRetries: clampInt(input.maxRetries, LIMITS.maxRetries, settings.defaultMaxRetries),
    userAgent: (input.userAgent ?? "").trim() || settings.defaultUserAgent,
    waitUntil: oneOf(input.waitUntil, WAIT_UNTIL, "domcontentloaded"),
    waitForSelector: (input.waitForSelector ?? "").trim(),
    waitForTimeoutMs: clampInt(input.waitForTimeoutMs, { min: 0, max: 120_000 }, 0),
    respectRobotsTxt: asBool(input.respectRobotsTxt, settings.respectRobotsTxt),
    blockResources: asBool(input.blockResources, settings.blockResources),
  };
}

function toScraper(row: ScraperRow): Scraper {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    itemSelector: row.itemSelector,
    itemSelectorKind: row.itemSelectorKind,
    fields: row.fields,
    pagination: row.pagination,
    requestDelayMs: row.requestDelayMs,
    timeoutMs: row.timeoutMs,
    maxPages: row.maxPages,
    concurrency: row.concurrency,
    maxRetries: row.maxRetries,
    userAgent: row.userAgent,
    waitUntil: row.waitUntil,
    waitForSelector: row.waitForSelector,
    waitForTimeoutMs: row.waitForTimeoutMs,
    respectRobotsTxt: row.respectRobotsTxt,
    blockResources: row.blockResources,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listScrapers(): Scraper[] {
  return db.select().from(scrapersTable).orderBy(desc(scrapersTable.updatedAt)).all().map(toScraper);
}

export function getScraper(id: string): Scraper {
  const row = db.select().from(scrapersTable).where(eq(scrapersTable.id, id)).get();
  if (!row) throw notFound(`Scraper ${id} does not exist`);
  return toScraper(row);
}

export function createScraper(input: ScraperInput): Scraper {
  const config = normalizeConfig(input);
  const id = newId();
  const timestamp = nowIso();

  db.insert(scrapersTable)
    .values({ id, ...config, waitForSelector: config.waitForSelector ?? "", createdAt: timestamp, updatedAt: timestamp })
    .run();

  return getScraper(id);
}

export function updateScraper(id: string, input: ScraperInput): Scraper {
  const existing = getScraper(id);
  const config = normalizeConfig({ ...existing, ...input });

  db.update(scrapersTable)
    .set({ ...config, waitForSelector: config.waitForSelector ?? "", updatedAt: nowIso() })
    .where(eq(scrapersTable.id, id))
    .run();

  return getScraper(id);
}

export function deleteScraper(id: string): void {
  getScraper(id);
  db.delete(scrapersTable).where(eq(scrapersTable.id, id)).run();
}

/** Save a copy, so a user can fork a working configuration. */
export function duplicateScraper(id: string): Scraper {
  const source = getScraper(id);
  return createScraper({
    ...source,
    name: `${source.name} (copy)`,
    fields: source.fields.map((field) => ({ ...field, id: newId() })),
  });
}
