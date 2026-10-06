import { describe, expect, test } from "bun:test";
import type { LogLevel } from "../packages/shared/types.ts";
import { ScrapeRunner, type RunSink } from "../apps/server/scraper/engine.ts";
import { normalizeConfig } from "../apps/server/services/scraper-service.ts";
import { LocalArtifactStore } from "../apps/server/storage/local-store.ts";
import { runMigrations } from "../apps/server/database/index.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// normalizeConfig reads the saved defaults, so the schema has to exist.
runMigrations();

/** Collects what a run reports, so assertions read like the UI would. */
function recordingSink() {
  const logs: { level: LogLevel; message: string }[] = [];
  const items: Record<string, unknown>[] = [];
  const pages: number[] = [];

  const sink: RunSink = {
    log: (level, message) => logs.push({ level, message }),
    saveItems: (pageNumber, _url, batch) => {
      pages.push(pageNumber);
      items.push(...batch);
    },
    onProgress: () => {},
  };
  return { sink, logs, items, pages };
}

const fixture = (products: number, pages: number) => {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const page = Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10) || 1;
      if (page > pages) return new Response("<html><body></body></html>", { headers: { "content-type": "text/html" } });
      const cards = Array.from({ length: products }, (_, i) => {
        const id = (page - 1) * products + i + 1;
        return `<div class="product"><span class="n">Item ${id}</span></div>`;
      }).join("");
      return new Response(`<html><body>${cards}</body></html>`, { headers: { "content-type": "text/html" } });
    },
  });
  return { url: `http://localhost:${server.port}`, stop: () => server.stop(true) };
};

const configFor = (base: string, maxPages = 5) =>
  normalizeConfig({
    name: "Test mode fixture",
    url: `${base}/?page=1`,
    itemSelector: ".product",
    fields: [{ name: "n", selector: ".n", type: "text" }],
    pagination: { mode: "url-pattern", urlPattern: `${base}/?page={page}`, stopWhenNoNewItems: true },
    maxPages,
    requestDelayMs: 0,
    respectRobotsTxt: false,
    timeoutMs: 15_000,
  });

describe("test mode", () => {
  test("stops on the exact record asked for, mid-page", async () => {
    const site = fixture(6, 5);
    try {
      const { sink, items } = recordingSink();
      // 6 records per page, asking for 4 — it must not round up to the page.
      const summary = await new ScrapeRunner(configFor(site.url), sink, { maxItems: 4 }).run();

      expect(summary.totalItems).toBe(4);
      expect(items).toHaveLength(4);
      expect(summary.pagesProcessed).toBe(1);
      expect(summary.reachedItemLimit).toBe(true);
    } finally {
      site.stop();
    }
  }, 60_000);

  test("spans pages when the limit needs more than one", async () => {
    const site = fixture(4, 5);
    try {
      const { sink, items } = recordingSink();
      const summary = await new ScrapeRunner(configFor(site.url), sink, { maxItems: 10 }).run();

      expect(summary.totalItems).toBe(10);
      expect(items).toHaveLength(10);
      expect(summary.pagesProcessed).toBe(3); // 4 + 4 + 2
    } finally {
      site.stop();
    }
  }, 60_000);

  test("without a limit it runs the whole configuration", async () => {
    const site = fixture(4, 3);
    try {
      const { sink } = recordingSink();
      const summary = await new ScrapeRunner(configFor(site.url, 3), sink).run();

      expect(summary.totalItems).toBe(12);
      expect(summary.reachedItemLimit).toBe(false);
    } finally {
      site.stop();
    }
  }, 60_000);

  test("says it was a test run, not a completed scrape", async () => {
    const site = fixture(6, 2);
    try {
      const { sink, logs } = recordingSink();
      await new ScrapeRunner(configFor(site.url), sink, { maxItems: 3 }).run();
      expect(logs.some((entry) => entry.message.includes("Test run complete"))).toBe(true);
    } finally {
      site.stop();
    }
  }, 60_000);
});

describe("artifact store", () => {
  test("round-trips a blob and reports its size", async () => {
    const root = await mkdtemp(join(tmpdir(), "aksa-store-"));
    try {
      const store = new LocalArtifactStore(root);
      const stored = await store.put("runs/abc/page.html", "<p>hello</p>", "text/html");
      expect(stored.size).toBe(12);
      expect(await store.exists("runs/abc/page.html")).toBe(true);

      const read = await store.get("runs/abc/page.html");
      expect(new TextDecoder().decode(read!.body)).toBe("<p>hello</p>");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a key cannot escape the store root", async () => {
    const root = await mkdtemp(join(tmpdir(), "aksa-store-"));
    try {
      const store = new LocalArtifactStore(root);
      // Traversal segments are stripped, so this lands inside the root.
      await store.put("../../escaped.txt", "x", "text/plain");
      expect(await store.exists("../../escaped.txt")).toBe(true);
      expect(await Bun.file(join(root, "..", "..", "escaped.txt")).exists()).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("missing keys read as null rather than throwing", async () => {
    const root = await mkdtemp(join(tmpdir(), "aksa-store-"));
    try {
      const store = new LocalArtifactStore(root);
      expect(await store.get("nope.txt")).toBeNull();
      expect(await store.response("nope.txt")).toBeNull();
      expect(await store.exists("nope.txt")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("deletePrefix removes a whole run's artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "aksa-store-"));
    try {
      const store = new LocalArtifactStore(root);
      await store.put("runs/r1/a.txt", "a", "text/plain");
      await store.put("runs/r1/b.txt", "b", "text/plain");
      await store.put("runs/r2/c.txt", "c", "text/plain");

      await store.deletePrefix("runs/r1");
      expect(await store.exists("runs/r1/a.txt")).toBe(false);
      expect(await store.exists("runs/r2/c.txt")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
