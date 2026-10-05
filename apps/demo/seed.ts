/**
 * Create the demo scrapers in a running app: `bun run demo:seed`.
 *
 * Re-running replaces the previous demo scrapers rather than duplicating them,
 * so it is safe to run as often as you like.
 */
import { DEMO_PRESETS } from "./presets.ts";
import type { Scraper } from "@shared/types.ts";

const APP = process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const DEMO = process.env.DEMO_URL ?? `http://localhost:${process.env.DEMO_PORT ?? 3100}`;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${APP}${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : {},
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function main(): Promise<void> {
  try {
    await requestJson("/api/health");
  } catch {
    console.error(`✗ The scraper app is not reachable at ${APP}.\n  Start it first with:  bun run dev`);
    process.exit(1);
  }

  const demoReachable = await fetch(`${DEMO}/robots.txt`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!demoReachable) {
    console.error(`✗ The demo site is not reachable at ${DEMO}.\n  Start it first with:  bun run demo`);
    process.exit(1);
  }

  const existing = await requestJson<{ items: Scraper[] }>("/api/scrapers");
  const names = new Set(DEMO_PRESETS.map((preset) => preset.config(DEMO).name));

  for (const scraper of existing.items) {
    if (names.has(scraper.name)) {
      await requestJson(`/api/scrapers/${scraper.id}`, { method: "DELETE" });
    }
  }

  console.log(`Creating ${DEMO_PRESETS.length} demo scrapers against ${DEMO}…\n`);
  for (const preset of DEMO_PRESETS) {
    const created = await requestJson<Scraper>("/api/scrapers", {
      method: "POST",
      body: JSON.stringify(preset.config(DEMO)),
    });
    console.log(`  ✓ ${created.name.padEnd(36)} ${created.fields.length} fields · ${created.pagination.mode}`);
  }

  console.log(`\nOpen ${APP} and press Start on any of them.`);
}

await main();
