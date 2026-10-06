import index from "../web/index.html";
import { apiRoutes } from "./routes/index.ts";
import { runMigrations } from "./database/index.ts";
import { reconcileInterruptedRuns } from "./services/run-service.ts";
import { scrapeManager } from "./scraper/manager.ts";
import { browserManager } from "./scraper/browser.ts";
import { errorResponse } from "./utils/http.ts";
import { policyDescription } from "./security/ssrf.ts";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const isProduction = process.env.NODE_ENV === "production";

runMigrations();

const interrupted = reconcileInterruptedRuns();
if (interrupted > 0) {
  console.log(`[startup] marked ${interrupted} interrupted run(s) as failed`);
}

const server = Bun.serve({
  port: PORT,
  // `development: true` gives React fast refresh and readable stack traces;
  // in production Bun bundles the client once at boot and caches it.
  development: !isProduction,
  idleTimeout: 0,

  routes: {
    ...apiRoutes,
    // Everything else serves the single-page app.
    "/*": index,
  },

  error(error) {
    return errorResponse(error);
  },
});

console.log(`
  web-scraper is running
  ─────────────────────────────────────────────
  URL        http://localhost:${server.port}
  Mode       ${isProduction ? "production" : "development (hot reload)"}
  Runtime    bun ${Bun.version}
  Chromium   ${browserManager.executablePath ?? "downloaded by Playwright on first run"}
  Network    ${policyDescription()}
`);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[shutdown] ${signal} received — stopping active runs…`);

  await scrapeManager.shutdown();
  await browserManager.close();
  await server.stop(true);

  console.log("[shutdown] done");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
