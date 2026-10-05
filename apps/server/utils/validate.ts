import { badRequest } from "./errors.ts";

export function clampInt(value: unknown, range: { min: number; max: number }, fallback: number): number {
  const num = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.trunc(num)));
}

export function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Accept only http(s) URLs. Blocking other schemes keeps `file://` and
 * `javascript:` out of the browser.
 */
export function assertHttpUrl(raw: string, label = "URL"): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw badRequest(`${label} is not a valid URL: ${raw || "(empty)"}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw badRequest(`${label} must use http or https, got "${parsed.protocol}"`);
  }
  return parsed.toString();
}

/**
 * Cheap structural sanity check. Real selector validation happens in the
 * browser when the run starts (see `scraper/extract.ts`), which is the only
 * place that can tell a valid selector from an invalid one for certain.
 */
export function assertSelectorShape(selector: string, label: string): void {
  if (/[{}]/.test(selector)) {
    throw badRequest(`${label} looks like a CSS rule, not a selector: ${selector}`);
  }
}
