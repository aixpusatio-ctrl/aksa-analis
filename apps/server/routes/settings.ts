import type { AppSettings } from "@shared/types.ts";
import { handler, json, readJson } from "../utils/http.ts";
import { getSettings, resetSettings, updateSettings } from "../services/settings-service.ts";
import { browserManager } from "../scraper/browser.ts";

export const settingsRoutes = {
  "/api/settings": {
    GET: handler(() => json(getSettings())),
    PUT: handler(async (req) => json(updateSettings(await readJson<Partial<AppSettings>>(req)))),
    DELETE: handler(() => json(resetSettings())),
  },

  /** Lightweight health probe that also reports the browser setup. */
  "/api/health": {
    GET: handler(() =>
      json({
        ok: true,
        runtime: `bun ${Bun.version}`,
        chromium: browserManager.executablePath ?? "playwright-managed download",
        openBrowserContexts: browserManager.openContexts,
        uptimeSeconds: Math.round(process.uptime()),
      }),
    ),
  },
};
