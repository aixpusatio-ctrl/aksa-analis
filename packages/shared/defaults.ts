import type { AppSettings, FieldConfig, ScraperConfig } from "./types.ts";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  defaultRequestDelayMs: 1000,
  defaultTimeoutMs: 30_000,
  maxConcurrentPages: 2,
  defaultUserAgent: DEFAULT_USER_AGENT,
  defaultMaxPages: 5,
  defaultMaxRetries: 2,
  respectRobotsTxt: true,
  blockResources: true,
};

/** Hard ceilings, enforced server-side so a bad payload cannot hammer a site. */
export const LIMITS = {
  requestDelayMs: { min: 0, max: 600_000 },
  timeoutMs: { min: 1_000, max: 300_000 },
  maxPages: { min: 1, max: 1_000 },
  concurrency: { min: 1, max: 8 },
  maxRetries: { min: 0, max: 10 },
  scrollTimes: { min: 0, max: 100 },
} as const;

export function emptyField(overrides: Partial<FieldConfig> = {}): FieldConfig {
  return {
    id: crypto.randomUUID(),
    name: "",
    selector: "",
    selectorKind: "css",
    type: "text",
    trim: true,
    multiple: false,
    required: false,
    ...overrides,
  };
}

export function defaultScraperConfig(settings: AppSettings = DEFAULT_SETTINGS): ScraperConfig {
  return {
    name: "",
    url: "",
    itemSelector: "",
    itemSelectorKind: "css",
    fields: [emptyField({ name: "title", selector: "h2", type: "text" })],
    pagination: {
      mode: "none",
      startPage: 1,
      step: 1,
      scrollTimes: 3,
      scrollDelayMs: 600,
      stopWhenNoNewItems: true,
      nextSelectorKind: "css",
    },
    requestDelayMs: settings.defaultRequestDelayMs,
    timeoutMs: settings.defaultTimeoutMs,
    maxPages: settings.defaultMaxPages,
    concurrency: Math.min(settings.maxConcurrentPages, 2),
    maxRetries: settings.defaultMaxRetries,
    userAgent: settings.defaultUserAgent,
    waitUntil: "domcontentloaded",
    waitForSelector: "",
    waitForTimeoutMs: 0,
    respectRobotsTxt: settings.respectRobotsTxt,
    blockResources: settings.blockResources,
  };
}
