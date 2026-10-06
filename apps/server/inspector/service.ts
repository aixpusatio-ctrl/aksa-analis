import type { Page } from "playwright-core";
import type { FieldConfig, SelectorKind, WaitUntil } from "@shared/types.ts";
import { browserManager } from "../scraper/browser.ts";
import { countMatches, extractFromPage } from "../scraper/extract.ts";
import { assertPublicUrl } from "../security/ssrf.ts";
import { artifactStore } from "../storage/index.ts";
import { getRobotsPolicy, isAllowedByPolicy } from "../scraper/robots.ts";
import { serializeDocument, type SnapshotResult } from "./serialize.ts";
import { detectSchema, type DetectedSchema } from "./detect.ts";
import { PICKER_SCRIPT } from "./picker-script.ts";
import { DEFAULT_USER_AGENT } from "@shared/defaults.ts";
import { badRequest, notFound } from "../utils/errors.ts";
import { newId, nowIso } from "../utils/ids.ts";

export interface SnapshotRecord {
  id: string;
  url: string;
  title: string;
  elementCount: number;
  robotsAllowed: boolean;
  createdAt: string;
  storageKey: string;
}

/** Snapshots are a scratch resource; they expire rather than accumulate. */
const SNAPSHOT_TTL_MS = 60 * 60 * 1000;
const MAX_SNAPSHOTS = 40;

const snapshots = new Map<string, SnapshotRecord>();

function evictExpired(): void {
  const cutoff = Date.now() - SNAPSHOT_TTL_MS;
  for (const [id, record] of snapshots) {
    if (new Date(record.createdAt).getTime() < cutoff) {
      snapshots.delete(id);
      void artifactStore.delete(record.storageKey);
    }
  }
  while (snapshots.size > MAX_SNAPSHOTS) {
    const oldest = snapshots.keys().next().value;
    if (!oldest) break;
    const record = snapshots.get(oldest);
    snapshots.delete(oldest);
    if (record) void artifactStore.delete(record.storageKey);
  }
}

export interface OpenOptions {
  url: string;
  userAgent?: string;
  timeoutMs?: number;
  waitUntil?: WaitUntil;
  waitForSelector?: string;
  blockResources?: boolean;
}

/**
 * Open a page in the shared browser, run `work`, and always tear the context
 * down afterwards. Every inspector action goes through here so the SSRF guard
 * and the context lifecycle live in exactly one place.
 */
async function withPage<T>(options: OpenOptions, work: (page: Page) => Promise<T>): Promise<T> {
  const url = await assertPublicUrl(options.url, "URL");
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 30_000, 1000), 120_000);

  const context = await browserManager.createContext({
    userAgent: options.userAgent || DEFAULT_USER_AGENT,
    timeoutMs,
    // Images stay on for the inspector: a preview without them is useless.
    blockResources: options.blockResources ?? false,
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    const response = await page.goto(url.toString(), {
      waitUntil: options.waitUntil ?? "domcontentloaded",
      timeout: timeoutMs,
    });

    const status = response?.status();
    if (status !== undefined && status >= 400) {
      throw badRequest(`The page returned HTTP ${status} ${response?.statusText() ?? ""}`.trim());
    }

    if (options.waitForSelector?.trim()) {
      await page.waitForSelector(options.waitForSelector, { timeout: timeoutMs, state: "attached" }).catch(() => {});
    }
    // Client-rendered pages need a beat before the DOM is worth reading.
    await page.waitForTimeout(400);

    return await work(page);
  } finally {
    await context.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                           */
/* ------------------------------------------------------------------ */

/**
 * Render a page and store an inert copy that the dashboard can iframe from
 * our own origin — which is what makes click-to-pick possible at all.
 */
export async function createSnapshot(options: OpenOptions): Promise<SnapshotRecord> {
  evictExpired();

  const result = await withPage(options, async (page) => {
    const serialized: SnapshotResult = await page.evaluate(serializeDocument);
    return serialized;
  });

  const policy = await getRobotsPolicy(result.url, options.userAgent || DEFAULT_USER_AGENT).catch(() => null);
  const robotsAllowed = policy ? isAllowedByPolicy(policy, result.url) : true;

  const id = newId();
  const storageKey = `snapshots/${id}.html`;
  await artifactStore.put(storageKey, result.html, "text/html; charset=utf-8");

  const record: SnapshotRecord = {
    id,
    url: result.url,
    title: result.title,
    elementCount: result.elementCount,
    robotsAllowed,
    createdAt: nowIso(),
    storageKey,
  };
  snapshots.set(id, record);
  return record;
}

export function getSnapshot(id: string): SnapshotRecord {
  const record = snapshots.get(id);
  if (!record) throw notFound("That preview has expired — open the page again");
  return record;
}

/**
 * Serve the snapshot with the picker injected.
 *
 * The CSP is the real protection here: the snapshot is sanitized when it is
 * created, but it is still third-party HTML served from our origin, so only
 * the nonce-carrying picker script is allowed to execute.
 */
export async function snapshotResponse(id: string): Promise<Response> {
  const record = getSnapshot(id);
  const stored = await artifactStore.get(record.storageKey);
  if (!stored) throw notFound("That preview is no longer available");

  const nonce = crypto.randomUUID().replaceAll("-", "");
  const html = new TextDecoder().decode(stored.body);
  const injected = `<script nonce="${nonce}">${PICKER_SCRIPT}</script>`;

  const withPicker = html.includes("</body>")
    ? html.replace("</body>", `${injected}</body>`)
    : `${html}${injected}`;

  // The snapshot keeps a <base> pointing at the original site so anything we
  // did not rewrite — a url() inside a stylesheet, say — still resolves. CSP
  // has to permit exactly that origin and nothing else.
  let baseOrigin = "'none'";
  try {
    baseOrigin = new URL(record.url).origin;
  } catch {
    /* keep base-uri locked down */
  }

  return new Response(withPicker, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        "style-src 'unsafe-inline' https: http:",
        "img-src data: blob: https: http:",
        "font-src data: https: http:",
        "frame-ancestors 'self'",
        "form-action 'none'",
        `base-uri ${baseOrigin}`,
      ].join("; "),
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

/* ------------------------------------------------------------------ */
/* Selector testing                                                   */
/* ------------------------------------------------------------------ */

export interface SelectorTestResult {
  selector: string;
  selectorKind: SelectorKind;
  count: number;
  valid: boolean;
  error: string | null;
  samples: string[];
}

/** Count and sample what a selector matches on a freshly rendered page. */
export async function testSelector(
  options: OpenOptions & { selector: string; selectorKind: SelectorKind },
): Promise<SelectorTestResult> {
  return withPage(options, async (page) => {
    const count = await countMatches(page, options.selector, options.selectorKind);
    if (count === -1) {
      return {
        selector: options.selector,
        selectorKind: options.selectorKind,
        count: 0,
        valid: false,
        error: "That selector is not valid",
        samples: [],
      };
    }

    const samples = await page.evaluate(
      ({ selector, kind }: { selector: string; kind: SelectorKind }) => {
        let nodes: Element[] = [];
        try {
          if (kind === "xpath") {
            const result = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < result.snapshotLength; i++) {
              const node = result.snapshotItem(i);
              if (node?.nodeType === 1) nodes.push(node as Element);
            }
          } else {
            nodes = Array.from(document.querySelectorAll(selector));
          }
        } catch {
          return [];
        }
        return nodes
          .slice(0, 5)
          .map((node) => ((node as HTMLElement).innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120))
          .filter(Boolean);
      },
      { selector: options.selector, kind: options.selectorKind },
    );

    return { selector: options.selector, selectorKind: options.selectorKind, count, valid: true, error: null, samples };
  });
}

/* ------------------------------------------------------------------ */
/* Live extraction preview                                            */
/* ------------------------------------------------------------------ */

export interface PreviewResult {
  rows: Record<string, unknown>[];
  itemCount: number;
  matched: number;
  warnings: string[];
  url: string;
}

/**
 * Run a full field plan against a live page and return the first few rows.
 *
 * This deliberately reuses the production extractor rather than a lookalike,
 * so what the preview shows is what a real run would save.
 */
export async function previewExtraction(
  options: OpenOptions & {
    itemSelector: string;
    itemSelectorKind: SelectorKind;
    fields: FieldConfig[];
    limit?: number;
  },
): Promise<PreviewResult> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);

  return withPage(options, async (page) => {
    const outcome = await extractFromPage(page, {
      itemSelector: options.itemSelector,
      itemSelectorKind: options.itemSelectorKind,
      fields: options.fields,
    });

    return {
      rows: outcome.items.slice(0, limit),
      itemCount: outcome.items.length,
      matched: outcome.matched,
      warnings: outcome.warnings,
      url: page.url(),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Auto detect                                                        */
/* ------------------------------------------------------------------ */

export interface DetectResult {
  url: string;
  schema: DetectedSchema | null;
}

export async function autoDetect(options: OpenOptions): Promise<DetectResult> {
  return withPage(options, async (page) => ({
    url: page.url(),
    schema: await detectSchema(page),
  }));
}
