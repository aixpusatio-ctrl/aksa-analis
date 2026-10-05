import type { BrowserContext, Page } from "playwright-core";
import type { LogLevel, ScraperConfig } from "@shared/types.ts";
import { browserManager } from "./browser.ts";
import { countMatches, extractFromPage, type ExtractionPlan } from "./extract.ts";
import { getRobotsPolicy, isAllowedByPolicy } from "./robots.ts";
import { mapWithConcurrency, sleep, withRetry } from "../utils/async.ts";
import { errorMessage } from "../utils/errors.ts";

/** Everything the engine needs from the outside world. */
export interface RunSink {
  log(level: LogLevel, message: string): void;
  saveItems(pageNumber: number, pageUrl: string, items: Record<string, unknown>[]): void;
  onProgress(update: { pagesProcessed: number; totalItems: number; currentUrl: string | null; pagesPlanned: number | null }): void;
}

export interface ScrapeSummary {
  totalItems: number;
  pagesProcessed: number;
  pagesFailed: number;
  stopped: boolean;
}

/** Three consecutive page failures end the run rather than grinding on. */
const CONSECUTIVE_FAILURE_LIMIT = 3;

export class ScrapeRunner {
  #stopRequested = false;
  #context: BrowserContext | null = null;
  #seen = new Set<string>();
  #totalItems = 0;
  #pagesProcessed = 0;
  #pagesFailed = 0;
  #consecutiveFailures = 0;
  #effectiveDelayMs: number;

  constructor(
    private readonly config: ScraperConfig,
    private readonly sink: RunSink,
  ) {
    this.#effectiveDelayMs = config.requestDelayMs;
  }

  /** Cooperative cancellation: closing the context aborts in-flight navigation. */
  stop(): void {
    if (this.#stopRequested) return;
    this.#stopRequested = true;
    this.sink.log("warn", "Stop requested — finishing current page…");
    void this.#context?.close().catch(() => {});
  }

  get stopped(): boolean {
    return this.#stopRequested;
  }

  async run(): Promise<ScrapeSummary> {
    const { config } = this;
    const plan: ExtractionPlan = {
      itemSelector: config.itemSelector,
      itemSelectorKind: config.itemSelectorKind,
      fields: config.fields,
    };

    this.sink.log("info", "Starting scraper…");
    if (browserManager.executablePath) {
      this.sink.log("debug", `Using Chromium at ${browserManager.executablePath}`);
    }

    await this.#applyRobotsPolicy();
    if (this.#stopRequested) return this.#summary();

    this.#context = await browserManager.createContext({
      userAgent: config.userAgent,
      timeoutMs: config.timeoutMs,
      blockResources: config.blockResources,
    });

    try {
      const pagesPlanned = this.#plannedPages();
      this.sink.onProgress({
        pagesProcessed: 0,
        totalItems: 0,
        currentUrl: config.url,
        pagesPlanned,
      });

      switch (config.pagination.mode) {
        case "url-pattern":
          await this.#runUrlPattern(plan);
          break;
        case "selector":
          await this.#runNextSelector(plan);
          break;
        case "scroll":
          await this.#runInfiniteScroll(plan);
          break;
        default:
          await this.#runSinglePage(plan);
      }
    } finally {
      await this.#context?.close().catch(() => {});
      this.#context = null;
    }

    if (this.#stopRequested) this.sink.log("warn", "Scraping stopped by user");
    else this.sink.log("success", `Scraping completed — ${this.#totalItems} item(s) from ${this.#pagesProcessed} page(s)`);

    return this.#summary();
  }

  /* ---------------------------------------------------------------- */
  /* robots.txt                                                       */
  /* ---------------------------------------------------------------- */

  async #applyRobotsPolicy(): Promise<void> {
    if (!this.config.respectRobotsTxt) {
      this.sink.log("warn", "robots.txt checks are disabled for this scraper");
      return;
    }

    const policy = await getRobotsPolicy(this.config.url, this.config.userAgent);
    if (policy.source === "fetched") {
      this.sink.log("info", `Loaded robots.txt for ${new URL(this.config.url).origin}`);
    } else {
      this.sink.log("debug", `No usable robots.txt (${policy.source}) — proceeding`);
    }

    if (!isAllowedByPolicy(policy, this.config.url)) {
      // Deliberately not a stop: this is a refusal, and the run must surface
      // it as a failure with the reason attached.
      throw new Error(
        `robots.txt disallows crawling ${this.config.url} for user agent "${this.config.userAgent}"`,
      );
    }

    // A site asking for a slower crawl always wins over the configured delay.
    if (policy.crawlDelayMs !== null && policy.crawlDelayMs > this.#effectiveDelayMs) {
      this.#effectiveDelayMs = policy.crawlDelayMs;
      this.sink.log("info", `Honouring robots.txt Crawl-delay: ${Math.round(policy.crawlDelayMs)}ms between requests`);
    }
  }

  async #isUrlAllowed(url: string): Promise<boolean> {
    if (!this.config.respectRobotsTxt) return true;
    const policy = await getRobotsPolicy(url, this.config.userAgent);
    return isAllowedByPolicy(policy, url);
  }

  /* ---------------------------------------------------------------- */
  /* Pagination strategies                                            */
  /* ---------------------------------------------------------------- */

  #plannedPages(): number | null {
    const { pagination, maxPages } = this.config;
    if (pagination.mode === "none") return 1;
    if (pagination.mode === "url-pattern") return maxPages;
    if (pagination.mode === "scroll") return Math.min(maxPages, (pagination.scrollTimes ?? 0) + 1);
    // `selector` mode cannot know the page count up front.
    return null;
  }

  async #runSinglePage(plan: ExtractionPlan): Promise<void> {
    await this.#processUrl(this.config.url, 1, plan, { validate: true });
  }

  async #runUrlPattern(plan: ExtractionPlan): Promise<void> {
    const { pagination, maxPages, concurrency } = this.config;
    const pattern = pagination.urlPattern?.trim() || this.config.url;
    if (!pattern.includes("{page}")) {
      this.sink.log("warn", 'URL pattern has no "{page}" placeholder — falling back to a single page');
      await this.#runSinglePage(plan);
      return;
    }

    const start = pagination.startPage ?? 1;
    const step = pagination.step ?? 1;
    const targets = Array.from({ length: maxPages }, (_, index) => ({
      pageNumber: index + 1,
      pageValue: start + index * step,
      url: pattern.replaceAll("{page}", String(start + index * step)),
    }));

    const batchSize = Math.max(1, Math.min(concurrency, maxPages));

    for (let offset = 0; offset < targets.length; offset += batchSize) {
      if (this.#stopRequested) break;
      const batch = targets.slice(offset, offset + batchSize);
      const before = this.#totalItems;

      // Within a batch the delay is applied as a stagger so parallel pages
      // still arrive spread out rather than all at once.
      const counts = await mapWithConcurrency(batch, batchSize, async (target, index) => {
        if (this.#stopRequested) return 0;
        await sleep(index * this.#effectiveDelayMs);
        return this.#processUrl(target.url, target.pageNumber, plan, { validate: offset === 0 && index === 0 });
      });

      if (this.#consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
        this.sink.log("error", `Stopping after ${CONSECUTIVE_FAILURE_LIMIT} consecutive page failures`);
        break;
      }

      const newItems = this.#totalItems - before;
      if (pagination.stopWhenNoNewItems !== false && counts.some((count) => count === 0) && newItems === 0) {
        this.sink.log("info", "No new items on the last batch — stopping pagination");
        break;
      }

      if (offset + batchSize < targets.length) await sleep(this.#effectiveDelayMs);
    }
  }

  async #runNextSelector(plan: ExtractionPlan): Promise<void> {
    const { pagination, maxPages } = this.config;
    const nextSelector = pagination.nextSelector?.trim();
    if (!nextSelector) {
      this.sink.log("warn", "Pagination is set to 'next button' but no selector was given — scraping one page");
      await this.#runSinglePage(plan);
      return;
    }

    const locatorFor = (page: Page) =>
      pagination.nextSelectorKind === "xpath" ? page.locator(`xpath=${nextSelector}`) : page.locator(nextSelector);

    const page = await this.#newPage();
    try {
      let pageNumber = 1;
      let currentUrl = this.config.url;

      while (pageNumber <= maxPages && !this.#stopRequested) {
        if (pageNumber === 1) {
          const ok = await this.#gotoWithRetry(page, currentUrl, pageNumber);
          if (!ok) return;
        }

        const before = this.#totalItems;
        await this.#extractInto(page, pageNumber, plan, { validate: pageNumber === 1 });
        if (this.#stopRequested || pageNumber >= maxPages) break;

        if (pagination.stopWhenNoNewItems !== false && this.#totalItems === before) {
          this.sink.log("info", "No new items on this page — stopping pagination");
          break;
        }

        const next = locatorFor(page).first();
        const hasNext = await next.count().then((count) => count > 0).catch(() => false);
        if (!hasNext) {
          this.sink.log("info", "No next-page element found — reached the last page");
          break;
        }
        if (await next.isDisabled().catch(() => false)) {
          this.sink.log("info", "Next-page element is disabled — reached the last page");
          break;
        }

        await sleep(this.#effectiveDelayMs);
        if (this.#stopRequested) break;

        const advanced = await this.#clickNext(page, next, currentUrl);
        if (!advanced) break;

        currentUrl = page.url();
        pageNumber++;
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Clicking "next" may navigate, or may swap the list in place. Wait for
   * whichever happens, then confirm something actually changed.
   */
  async #clickNext(page: Page, next: ReturnType<Page["locator"]>, previousUrl: string): Promise<boolean> {
    const beforeHtml = await page
      .evaluate((selector: string) => (selector ? document.querySelector(selector)?.outerHTML?.slice(0, 2000) ?? "" : ""), this.config.itemSelector)
      .catch(() => "");

    try {
      await Promise.all([
        page.waitForLoadState(this.config.waitUntil === "commit" ? "domcontentloaded" : this.config.waitUntil, {
          timeout: this.config.timeoutMs,
        }).catch(() => {}),
        next.click({ timeout: this.config.timeoutMs }),
      ]);
    } catch (error) {
      if (this.#stopRequested) return false;
      this.sink.log("error", `Could not click the next-page element: ${errorMessage(error)}`);
      return false;
    }

    await this.#settle(page);

    if (page.url() !== previousUrl) return true;

    // Same URL: make sure the content really changed before counting a page.
    const afterHtml = await page
      .evaluate((selector: string) => (selector ? document.querySelector(selector)?.outerHTML?.slice(0, 2000) ?? "" : ""), this.config.itemSelector)
      .catch(() => "");

    if (beforeHtml && afterHtml && beforeHtml === afterHtml) {
      this.sink.log("info", "Page content did not change after clicking next — stopping pagination");
      return false;
    }
    return true;
  }

  async #runInfiniteScroll(plan: ExtractionPlan): Promise<void> {
    const { pagination, maxPages } = this.config;
    const scrollTimes = Math.min(pagination.scrollTimes ?? 3, Math.max(0, maxPages - 1));
    const scrollDelayMs = pagination.scrollDelayMs ?? 600;

    const page = await this.#newPage();
    try {
      if (!(await this.#gotoWithRetry(page, this.config.url, 1))) return;
      await this.#extractInto(page, 1, plan, { validate: true });

      for (let round = 1; round <= scrollTimes && !this.#stopRequested; round++) {
        const before = this.#totalItems;
        const grew = await page
          .evaluate(async () => {
            const previousHeight = document.body.scrollHeight;
            window.scrollTo(0, previousHeight);
            await new Promise((done) => setTimeout(done, 150));
            return document.body.scrollHeight > previousHeight;
          })
          .catch(() => false);

        await sleep(scrollDelayMs);
        if (this.#stopRequested) break;

        this.sink.log("info", `Scroll ${round}/${scrollTimes}…`);
        await this.#extractInto(page, round + 1, plan, { validate: false });

        if (pagination.stopWhenNoNewItems !== false && this.#totalItems === before && !grew) {
          this.sink.log("info", "Scrolling produced no new items — stopping");
          break;
        }
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  /* ---------------------------------------------------------------- */
  /* Page plumbing                                                    */
  /* ---------------------------------------------------------------- */

  async #newPage(): Promise<Page> {
    if (!this.#context) throw new Error("Browser context is not available");
    const page = await this.#context.newPage();
    page.setDefaultTimeout(this.config.timeoutMs);
    page.setDefaultNavigationTimeout(this.config.timeoutMs);
    return page;
  }

  /** Fetch one URL in its own page and extract from it. Returns item count. */
  async #processUrl(
    url: string,
    pageNumber: number,
    plan: ExtractionPlan,
    options: { validate: boolean },
  ): Promise<number> {
    if (this.#stopRequested) return 0;

    if (!(await this.#isUrlAllowed(url))) {
      this.sink.log("warn", `Skipped (robots.txt disallows): ${url}`);
      return 0;
    }

    const page = await this.#newPage();
    try {
      if (!(await this.#gotoWithRetry(page, url, pageNumber))) return 0;
      return await this.#extractInto(page, pageNumber, plan, options);
    } finally {
      await page.close().catch(() => {});
    }
  }

  async #gotoWithRetry(page: Page, url: string, pageNumber: number): Promise<boolean> {
    this.sink.log("info", `Opening page ${pageNumber}: ${url}`);

    try {
      await withRetry(
        async (attempt) => {
          if (attempt > 1) this.sink.log("warn", `Retry ${attempt - 1} for page ${pageNumber}`);
          const response = await page.goto(url, {
            waitUntil: this.config.waitUntil,
            timeout: this.config.timeoutMs,
          });
          const status = response?.status();
          if (status !== undefined && status >= 400) {
            throw new Error(`HTTP ${status} ${response?.statusText() ?? ""}`.trim());
          }
          await this.#settle(page);
        },
        {
          retries: this.config.maxRetries,
          shouldStop: () => this.#stopRequested,
          onRetry: (error, attempt, waitMs) =>
            this.sink.log("warn", `Page ${pageNumber} failed (attempt ${attempt}): ${errorMessage(error)} — retrying in ${waitMs}ms`),
        },
      );
      this.#consecutiveFailures = 0;
      return true;
    } catch (error) {
      if (this.#stopRequested) return false;
      this.#pagesFailed++;
      this.#consecutiveFailures++;
      const message = `Page ${pageNumber} failed: ${errorMessage(error)}`;
      if (pageNumber === 1) throw new Error(message);
      this.sink.log("error", message);
      return false;
    }
  }

  /** Wait for the optional selector / settle time after a navigation. */
  async #settle(page: Page): Promise<void> {
    const { waitForSelector, waitForTimeoutMs, timeoutMs } = this.config;
    if (waitForSelector?.trim()) {
      try {
        await page.waitForSelector(waitForSelector, { timeout: timeoutMs, state: "attached" });
      } catch {
        this.sink.log("warn", `Timed out waiting for "${waitForSelector}" — continuing anyway`);
      }
    }
    if (waitForTimeoutMs && waitForTimeoutMs > 0) await sleep(Math.min(waitForTimeoutMs, timeoutMs));
  }

  async #extractInto(
    page: Page,
    pageNumber: number,
    plan: ExtractionPlan,
    options: { validate: boolean },
  ): Promise<number> {
    if (options.validate && plan.itemSelector) {
      const matches = await countMatches(page, plan.itemSelector, plan.itemSelectorKind);
      if (matches === -1) throw new Error(`Item selector "${plan.itemSelector}" is not valid`);
      if (matches === 0) {
        this.sink.log(
          "warn",
          `Item selector "${plan.itemSelector}" matched nothing. The page may render later — try pagination mode "scroll", a "wait for selector", or a different selector.`,
        );
      }
    }

    const pageUrl = page.url();
    const outcome = await extractFromPage(page, plan);
    for (const warning of outcome.warnings) this.sink.log("warn", warning);

    const fresh = outcome.items.filter((item) => {
      const key = String(Bun.hash(JSON.stringify(item)));
      if (this.#seen.has(key)) return false;
      this.#seen.add(key);
      return true;
    });

    const duplicates = outcome.items.length - fresh.length;
    if (fresh.length > 0) this.sink.saveItems(pageNumber, pageUrl, fresh);

    this.#pagesProcessed++;
    this.#totalItems += fresh.length;

    const suffix = duplicates > 0 ? ` (${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped)` : "";
    this.sink.log(fresh.length > 0 ? "success" : "info", `Found ${fresh.length} item(s) on page ${pageNumber}${suffix}`);

    this.sink.onProgress({
      pagesProcessed: this.#pagesProcessed,
      totalItems: this.#totalItems,
      currentUrl: pageUrl,
      pagesPlanned: this.#plannedPages(),
    });

    return fresh.length;
  }

  #summary(): ScrapeSummary {
    return {
      totalItems: this.#totalItems,
      pagesProcessed: this.#pagesProcessed,
      pagesFailed: this.#pagesFailed,
      stopped: this.#stopRequested,
    };
  }
}
