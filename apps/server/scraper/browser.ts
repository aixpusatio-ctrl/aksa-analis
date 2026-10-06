import { chromium, type Browser, type BrowserContext, type LaunchOptions } from "playwright-core";
import { existsSync } from "node:fs";
import { isRequestUrlAllowed } from "../security/ssrf.ts";

/**
 * Chromium binaries that containers commonly pre-install. When one of these
 * exists we use it instead of asking Playwright to download its own, which is
 * what makes the app work in a fresh container with no `playwright install`.
 */
const KNOWN_CHROMIUM_PATHS = [
  "/opt/pw-browsers/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function resolveExecutablePath(): string | undefined {
  const explicit = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (explicit) return explicit;
  return KNOWN_CHROMIUM_PATHS.find((path) => existsSync(path));
}

function launchOptions(): LaunchOptions {
  const executablePath = resolveExecutablePath();
  const args = ["--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"];

  // Chromium's sandbox needs privileges most containers do not grant.
  if (process.env.CHROMIUM_NO_SANDBOX === "1" || process.getuid?.() === 0) {
    args.push("--no-sandbox", "--disable-setuid-sandbox");
  }

  return { headless: true, args, ...(executablePath ? { executablePath } : {}) };
}

/**
 * One shared Chromium process for the whole server. Launching Chromium costs
 * ~300ms, so runs reuse it and only pay for a fresh browser *context* each.
 */
class BrowserManager {
  #browser: Browser | null = null;
  #starting: Promise<Browser> | null = null;
  #contexts = 0;

  async browser(): Promise<Browser> {
    if (this.#browser?.isConnected()) return this.#browser;
    this.#starting ??= chromium
      .launch(launchOptions())
      .then((browser) => {
        this.#browser = browser;
        browser.on("disconnected", () => {
          if (this.#browser === browser) this.#browser = null;
        });
        return browser;
      })
      .finally(() => {
        this.#starting = null;
      });
    return this.#starting;
  }

  async createContext(options: {
    userAgent?: string;
    timeoutMs: number;
    blockResources: boolean;
  }): Promise<BrowserContext> {
    const browser = await this.browser();
    const context = await browser.newContext({
      ...(options.userAgent ? { userAgent: options.userAgent } : {}),
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
    });

    context.setDefaultTimeout(options.timeoutMs);
    context.setDefaultNavigationTimeout(options.timeoutMs);

    // Every navigation is re-checked here, not just the URL we were handed:
    // a redirect can land on a private address the pre-flight check never saw.
    await context.route("**/*", async (route) => {
      const request = route.request();
      const type = request.resourceType();

      if (options.blockResources && (type === "image" || type === "media" || type === "font")) {
        return route.abort();
      }

      if (type === "document" || type === "subdocument") {
        if (!(await isRequestUrlAllowed(request.url()))) return route.abort("blockedbyclient");
      }

      return route.continue();
    });

    this.#contexts++;
    context.on("close", () => {
      this.#contexts = Math.max(0, this.#contexts - 1);
    });
    return context;
  }

  get openContexts(): number {
    return this.#contexts;
  }

  get executablePath(): string | undefined {
    return resolveExecutablePath();
  }

  async close(): Promise<void> {
    const browser = this.#browser;
    this.#browser = null;
    await browser?.close().catch(() => {});
  }
}

export const browserManager = new BrowserManager();
