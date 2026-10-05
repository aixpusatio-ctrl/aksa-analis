import { describe, expect, test } from "bun:test";
import { exportRun, parseFormat } from "../apps/server/services/export-service.ts";
import { db, runMigrations, runs, results } from "../apps/server/database/index.ts";
import { normalizeConfig } from "../apps/server/services/scraper-service.ts";
import { HttpError } from "../apps/server/utils/errors.ts";
import type { Run } from "../packages/shared/types.ts";
import { eq } from "drizzle-orm";

runMigrations();

/** Insert a run with a few awkward rows, so the exporters get a real workout. */
function seedRun(): Run {
  const config = normalizeConfig({
    name: "Export fixture",
    url: "https://example.com/products",
    itemSelector: ".product",
    fields: [
      { name: "name", selector: ".n", type: "text" },
      { name: "price", selector: ".p", type: "text" },
      { name: "tags", selector: ".t", type: "text", multiple: true },
    ],
  });

  const id = `test-${crypto.randomUUID()}`;
  db.insert(runs)
    .values({
      id,
      scraperId: null,
      scraperName: config.name,
      url: config.url,
      status: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:01:00.000Z",
      totalItems: 3,
      pagesProcessed: 1,
      config,
      createdAt: "2026-01-01T00:00:00.000Z",
    })
    .run();

  db.insert(results)
    .values([
      { runId: id, pageNumber: 1, pageUrl: config.url, position: 0, data: { name: "Plain", price: "$1.00", tags: ["a", "b"] } },
      // Commas, quotes and newlines are exactly what breaks a naive CSV writer.
      { runId: id, pageNumber: 1, pageUrl: config.url, position: 1, data: { name: 'He said "hi", loudly', price: "$2,000", tags: [] } },
      { runId: id, pageNumber: 1, pageUrl: config.url, position: 2, data: { name: "Line\nbreak", price: null, tags: ["x"] } },
    ])
    .run();

  return db.select().from(runs).where(eq(runs.id, id)).get() as unknown as Run;
}

describe("parseFormat", () => {
  test("defaults to csv and accepts the three supported formats", () => {
    expect(parseFormat(null)).toBe("csv");
    expect(parseFormat("JSON")).toBe("json");
    expect(parseFormat("xlsx")).toBe("xlsx");
  });

  test("rejects anything else with a 400", () => {
    expect(() => parseFormat("pdf")).toThrow(HttpError);
  });
});

describe("CSV export", () => {
  const run = seedRun();

  test("writes a header from the configured fields, in order", async () => {
    const { body, filename, contentType } = await exportRun(run, "csv");
    const text = body as string;
    const header = text.split("\r\n")[0]!;
    expect(header).toBe("﻿#,name,price,tags,page,source_url");
    expect(filename).toEndWith(".csv");
    expect(contentType).toStartWith("text/csv");
  });

  test("quotes and escapes values that contain commas, quotes or newlines", async () => {
    const text = (await exportRun(run, "csv")).body as string;
    expect(text).toContain('"He said ""hi"", loudly"');
    expect(text).toContain('"$2,000"');
    expect(text).toContain('"Line\nbreak"');
  });

  test("flattens arrays and renders null as an empty cell", async () => {
    const text = (await exportRun(run, "csv")).body as string;
    expect(text).toContain("a | b");
    expect(text).toMatch(/Line\nbreak",,x/);
  });

  test("every data row is present", async () => {
    const text = (await exportRun(run, "csv")).body as string;
    // 1 header + 3 rows, and the trailing CRLF makes one empty element.
    expect(text.trimEnd().split("\r\n").length).toBeGreaterThanOrEqual(4);
  });
});

describe("JSON export", () => {
  const run = seedRun();

  test("wraps the rows in run metadata", async () => {
    const parsed = JSON.parse((await exportRun(run, "json")).body as string);
    expect(parsed.scraper).toBe("Export fixture");
    expect(parsed.runId).toBe(run.id);
    expect(parsed.totalItems).toBe(3);
    expect(parsed.data).toBeArrayOfSize(3);
  });

  test("keeps native types rather than stringifying them", async () => {
    const parsed = JSON.parse((await exportRun(run, "json")).body as string);
    expect(parsed.data[0].tags).toEqual(["a", "b"]);
    expect(parsed.data[2].price).toBeNull();
    expect(parsed.data[0]._sourceUrl).toBe("https://example.com/products");
  });
});

describe("XLSX export", () => {
  const run = seedRun();

  test("produces a real xlsx package", async () => {
    const { body, filename, contentType } = await exportRun(run, "xlsx");
    const bytes = body as Uint8Array;
    // xlsx is a zip archive, so it must start with the PK local-file header.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(filename).toEndWith(".xlsx");
    expect(contentType).toContain("spreadsheetml");
  });
});

describe("empty run", () => {
  test("a run with no results still exports a valid file", async () => {
    const config = normalizeConfig({ url: "https://example.com", fields: [{ name: "a", selector: "h1" }] });
    const id = `test-empty-${crypto.randomUUID()}`;
    db.insert(runs)
      .values({ id, scraperId: null, scraperName: "Empty", url: config.url, status: "completed", config, createdAt: "2026-01-01T00:00:00.000Z" })
      .run();
    const run = db.select().from(runs).where(eq(runs.id, id)).get() as unknown as Run;

    expect((await exportRun(run, "csv")).body as string).toContain("#,a,page,source_url");
    expect(JSON.parse((await exportRun(run, "json")).body as string).data).toBeArrayOfSize(0);
    expect(((await exportRun(run, "xlsx")).body as Uint8Array).byteLength).toBeGreaterThan(1000);
  });
});
