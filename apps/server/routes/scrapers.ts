import type { ScraperInput } from "@shared/types.ts";
import { handler, json, noContent, readJson, searchParams } from "../utils/http.ts";
import { badRequest } from "../utils/errors.ts";
import { clampInt } from "../utils/validate.ts";
import * as scraperService from "../services/scraper-service.ts";
import * as runService from "../services/run-service.ts";
import { scrapeManager } from "../scraper/manager.ts";

export const scraperRoutes = {
  "/api/scrapers": {
    GET: handler(() => json({ items: scraperService.listScrapers() })),
    POST: handler(async (req) => {
      const body = await readJson<ScraperInput>(req);
      const scraper = scraperService.createScraper(body);
      return json(scraper, { status: 201 });
    }),
  },

  "/api/scrapers/:id": {
    GET: handler((req) => json(scraperService.getScraper(req.params.id))),
    PUT: handler(async (req) => {
      const body = await readJson<ScraperInput>(req);
      return json(scraperService.updateScraper(req.params.id, body));
    }),
    DELETE: handler((req) => {
      const active = scrapeManager.activeRunForScraper(req.params.id);
      if (active) {
        // The run may finish between the lookup and the stop; that is fine.
        try {
          scrapeManager.stop(active.id);
        } catch {
          /* already finished */
        }
      }
      scraperService.deleteScraper(req.params.id);
      return noContent();
    }),
  },

  "/api/scrapers/:id/duplicate": {
    POST: handler((req) => json(scraperService.duplicateScraper(req.params.id), { status: 201 })),
  },

  /** Start a run. The response carries the new run id to subscribe to. */
  "/api/scrapers/:id/start": {
    POST: handler(async (req) => {
      const scraper = scraperService.getScraper(req.params.id);
      // Allow one-off overrides (e.g. a different maxPages) without saving them.
      const overrides = await readJson<Partial<ScraperInput>>(req);
      const config = scraperService.normalizeConfig({ ...scraper, ...overrides });
      const run = scrapeManager.start({ scraperId: scraper.id, config });
      return json({ run, progress: scrapeManager.progressFor(run.id) }, { status: 202 });
    }),
  },

  "/api/scrapers/:id/stop": {
    POST: handler((req) => {
      const scraper = scraperService.getScraper(req.params.id);
      const progress = scrapeManager.stopByScraper(scraper.id);
      if (!progress) throw badRequest("This scraper has no run in progress");
      return json({ progress });
    }),
  },

  /** Status of the scraper's most recent run. */
  "/api/scrapers/:id/status": {
    GET: handler((req) => {
      const scraper = scraperService.getScraper(req.params.id);
      const active = scrapeManager.activeRunForScraper(scraper.id);
      const run = active ?? runService.latestRunForScraper(scraper.id);
      if (!run) return json({ run: null, progress: null, running: false });
      return json({
        run,
        progress: scrapeManager.progressFor(run.id),
        running: scrapeManager.isActive(run.id) && run.status === "running",
      });
    }),
  },

  /** Results of the scraper's most recent run. */
  "/api/scrapers/:id/results": {
    GET: handler((req) => {
      const scraper = scraperService.getScraper(req.params.id);
      const run = scrapeManager.activeRunForScraper(scraper.id) ?? runService.latestRunForScraper(scraper.id);
      if (!run) return json({ items: [], total: 0, page: 1, pageSize: 50, columns: [], runId: null });

      const params = searchParams(req);
      const page = Number.parseInt(params.get("page") ?? "1", 10);
      const pageSize = Number.parseInt(params.get("pageSize") ?? "50", 10);
      const results = runService.listResults(run.id, {
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 50,
        search: params.get("search") ?? undefined,
      });
      return json({ ...results, runId: run.id });
    }),
  },

  /**
   * Test run: a capped scrape that validates a configuration cheaply, and
   * always leaves a selector report behind.
   */
  "/api/scrapers/:id/test": {
    POST: handler(async (req) => {
      const scraper = scraperService.getScraper(req.params.id);
      const body = await readJson<Partial<ScraperInput> & { maxItems?: number }>(req);
      const config = scraperService.normalizeConfig({ ...scraper, ...body });
      const run = scrapeManager.start({
        scraperId: scraper.id,
        config,
        mode: "test",
        maxItems: clampInt(body.maxItems, { min: 1, max: 100 }, 5),
      });
      return json({ run, progress: scrapeManager.progressFor(run.id) }, { status: 202 });
    }),
  },

  /** Test an unsaved configuration — what the visual builder uses. */
  "/api/scrape/test": {
    POST: handler(async (req) => {
      const body = await readJson<ScraperInput & { maxItems?: number }>(req);
      const config = scraperService.normalizeConfig(body);
      const run = scrapeManager.start({
        scraperId: null,
        config,
        mode: "test",
        maxItems: clampInt(body.maxItems, { min: 1, max: 100 }, 5),
      });
      return json({ run, progress: scrapeManager.progressFor(run.id) }, { status: 202 });
    }),
  },

  /** Run an ad-hoc configuration without saving it first. */
  "/api/scrape": {
    POST: handler(async (req) => {
      const body = await readJson<ScraperInput>(req);
      const config = scraperService.normalizeConfig(body);
      const run = scrapeManager.start({ scraperId: null, config });
      return json({ run, progress: scrapeManager.progressFor(run.id) }, { status: 202 });
    }),
  },
};
