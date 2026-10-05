import type { RunStatus } from "@shared/types.ts";
import { handler, intParam, json, noContent, searchParams } from "../utils/http.ts";
import * as runService from "../services/run-service.ts";
import { scrapeManager } from "../scraper/manager.ts";
import { exportRun, parseFormat, toDownloadResponse } from "../services/export-service.ts";
import { listScrapers } from "../services/scraper-service.ts";
import { openEventStream } from "./sse.ts";

const historyFromRequest = (req: Request) => {
  const params = searchParams(req);
  return {
    page: intParam(params, "page", 1),
    pageSize: intParam(params, "pageSize", 20),
    status: (params.get("status") as RunStatus | "all" | null) ?? "all",
    search: params.get("search") ?? undefined,
    scraperId: params.get("scraperId") ?? undefined,
  };
};

const resultsFromRequest = (req: Request) => {
  const params = searchParams(req);
  return {
    page: intParam(params, "page", 1),
    pageSize: intParam(params, "pageSize", 50),
    search: params.get("search") ?? undefined,
  };
};

export const runRoutes = {
  /** Scraping history. */
  "/api/history": {
    GET: handler((req) => json(runService.listRuns(historyFromRequest(req)))),
  },

  "/api/runs": {
    GET: handler((req) => json(runService.listRuns(historyFromRequest(req)))),
  },

  "/api/runs/:id": {
    GET: handler((req) => {
      const run = runService.getRun(req.params.id);
      return json({
        run,
        progress: scrapeManager.progressFor(run.id),
        running: scrapeManager.isActive(run.id) && run.status === "running",
      });
    }),
    DELETE: handler((req) => {
      if (scrapeManager.isActive(req.params.id)) scrapeManager.stop(req.params.id);
      runService.deleteRun(req.params.id);
      return noContent();
    }),
  },

  "/api/runs/:id/stop": {
    POST: handler((req) => json({ progress: scrapeManager.stop(req.params.id) })),
  },

  "/api/runs/:id/status": {
    GET: handler((req) => json({ progress: scrapeManager.progressFor(req.params.id) })),
  },

  "/api/runs/:id/results": {
    GET: handler((req) => json(runService.listResults(req.params.id, resultsFromRequest(req)))),
  },

  "/api/runs/:id/logs": {
    GET: handler((req) => {
      const params = searchParams(req);
      const afterId = params.get("afterId");
      return json({
        items: runService.listLogs(req.params.id, {
          limit: intParam(params, "limit", 1000),
          ...(afterId ? { afterId: Number.parseInt(afterId, 10) } : {}),
        }),
      });
    }),
  },

  /** Per-run realtime stream. */
  "/api/runs/:id/events": {
    GET: handler((req) => openEventStream(req, req.params.id)),
  },

  /** Export a run's results: `?format=csv|json|xlsx`. */
  "/api/runs/:id/export": {
    GET: handler(async (req) => {
      const run = runService.getRun(req.params.id);
      const format = parseFormat(searchParams(req).get("format"));
      return toDownloadResponse(await exportRun(run, format));
    }),
  },

  /**
   * Spec-mandated alias for the export endpoint — `:id` is the run id, since a
   * run is what owns a result set.
   */
  "/api/results/:id/export": {
    GET: handler(async (req) => {
      const run = runService.getRun(req.params.id);
      const format = parseFormat(searchParams(req).get("format"));
      return toDownloadResponse(await exportRun(run, format));
    }),
  },

  "/api/results/:id": {
    GET: handler((req) => json(runService.listResults(req.params.id, resultsFromRequest(req)))),
  },

  /** Global realtime stream, used by the dashboard. */
  "/api/events": {
    GET: handler((req) => openEventStream(req, searchParams(req).get("runId"))),
  },

  "/api/stats": {
    GET: handler(() => {
      const stats = runService.dashboardStats();
      return json({
        ...stats,
        savedScrapers: listScrapers().length,
        activeRuns: scrapeManager.activeRuns().length,
        recentRuns: runService.listRuns({ pageSize: 5 }).items,
      });
    }),
  },
};
