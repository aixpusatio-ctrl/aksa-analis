import { json } from "../utils/http.ts";
import { scraperRoutes } from "./scrapers.ts";
import { runRoutes } from "./runs.ts";
import { settingsRoutes } from "./settings.ts";
import { inspectorRoutes } from "./inspector.ts";

/** Every API route, in the shape `Bun.serve({ routes })` expects. */
export const apiRoutes = {
  ...scraperRoutes,
  ...runRoutes,
  ...settingsRoutes,
  ...inspectorRoutes,

  // Anything else under /api is a 404 rather than falling through to the SPA.
  "/api/*": () => json({ error: "Unknown API endpoint" }, { status: 404 }),
};
