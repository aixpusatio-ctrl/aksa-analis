import { eq } from "drizzle-orm";
import { db, settings as settingsTable } from "../database/index.ts";
import { DEFAULT_SETTINGS, LIMITS } from "@shared/defaults.ts";
import type { AppSettings } from "@shared/types.ts";
import { asBool, clampInt, oneOf } from "../utils/validate.ts";
import { nowIso } from "../utils/ids.ts";

const KEY = "app";

function normalize(input: Partial<AppSettings>, base: AppSettings): AppSettings {
  return {
    theme: oneOf(input.theme, ["light", "dark", "system"] as const, base.theme),
    defaultRequestDelayMs: clampInt(input.defaultRequestDelayMs, LIMITS.requestDelayMs, base.defaultRequestDelayMs),
    defaultTimeoutMs: clampInt(input.defaultTimeoutMs, LIMITS.timeoutMs, base.defaultTimeoutMs),
    maxConcurrentPages: clampInt(input.maxConcurrentPages, LIMITS.concurrency, base.maxConcurrentPages),
    defaultMaxPages: clampInt(input.defaultMaxPages, LIMITS.maxPages, base.defaultMaxPages),
    defaultMaxRetries: clampInt(input.defaultMaxRetries, LIMITS.maxRetries, base.defaultMaxRetries),
    defaultUserAgent:
      typeof input.defaultUserAgent === "string" && input.defaultUserAgent.trim()
        ? input.defaultUserAgent.trim()
        : base.defaultUserAgent,
    respectRobotsTxt: asBool(input.respectRobotsTxt, base.respectRobotsTxt),
    blockResources: asBool(input.blockResources, base.blockResources),
  };
}

export function getSettings(): AppSettings {
  const row = db.select().from(settingsTable).where(eq(settingsTable.key, KEY)).get();
  if (!row) return DEFAULT_SETTINGS;
  return normalize((row.value ?? {}) as Partial<AppSettings>, DEFAULT_SETTINGS);
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = normalize(patch, getSettings());
  db.insert(settingsTable)
    .values({ key: KEY, value: next, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: next, updatedAt: nowIso() } })
    .run();
  return next;
}

export function resetSettings(): AppSettings {
  db.delete(settingsTable).where(eq(settingsTable.key, KEY)).run();
  return DEFAULT_SETTINGS;
}
