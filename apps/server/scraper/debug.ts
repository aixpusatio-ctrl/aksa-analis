import type { ConsoleMessage, Page, Request } from "playwright-core";
import type { ArtifactKind, FieldConfig, SelectorKind, SelectorReport } from "@shared/types.ts";
import { artifactStore } from "../storage/index.ts";
import { newId } from "../utils/ids.ts";
import { errorMessage } from "../utils/errors.ts";

export interface CapturedArtifact {
  id: string;
  kind: ArtifactKind;
  label: string;
  pageNumber: number | null;
  pageUrl: string;
  storageKey: string;
  contentType: string;
  size: number;
}

/** Keeps the console and network tail bounded; a failing page can be noisy. */
const MAX_CONSOLE_LINES = 300;
const MAX_NETWORK_LINES = 150;

/**
 * Collects what a person needs to understand a failed scrape: a screenshot of
 * what the browser actually saw, the HTML it was looking at, the console
 * output and the requests that failed.
 *
 * One instance per page. `attach` starts listening; `captureFailure` writes
 * everything out. Capture never throws — a debugger that breaks the run it is
 * debugging would be worse than no debugger.
 */
export class DebugRecorder {
  #console: string[] = [];
  #network: string[] = [];
  #detached: (() => void)[] = [];

  constructor(
    private readonly runId: string,
    private readonly onArtifact: (artifact: CapturedArtifact) => void,
  ) {}

  attach(page: Page): void {
    const onConsole = (message: ConsoleMessage) => {
      if (this.#console.length >= MAX_CONSOLE_LINES) return;
      const location = message.location();
      const where = location.url ? ` (${location.url}:${location.lineNumber})` : "";
      this.#console.push(`[${message.type()}] ${message.text()}${where}`);
    };

    const onPageError = (error: Error) => {
      if (this.#console.length >= MAX_CONSOLE_LINES) return;
      this.#console.push(`[pageerror] ${error.message}`);
    };

    const onRequestFailed = (request: Request) => {
      if (this.#network.length >= MAX_NETWORK_LINES) return;
      const failure = request.failure();
      this.#network.push(`${request.method()} ${request.url()} — ${failure?.errorText ?? "failed"}`);
    };

    const onResponse = (response: { status: () => number; url: () => string }) => {
      const status = response.status();
      if (status < 400 || this.#network.length >= MAX_NETWORK_LINES) return;
      this.#network.push(`HTTP ${status} ${response.url()}`);
    };

    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("requestfailed", onRequestFailed);
    page.on("response", onResponse);

    this.#detached.push(() => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
    });
  }

  detach(): void {
    for (const off of this.#detached) off();
    this.#detached = [];
  }

  async #store(
    kind: ArtifactKind,
    label: string,
    extension: string,
    body: Uint8Array | string,
    contentType: string,
    pageNumber: number | null,
    pageUrl: string,
  ): Promise<void> {
    try {
      const id = newId();
      const storageKey = `runs/${this.runId}/${kind}-${id}.${extension}`;
      const stored = await artifactStore.put(storageKey, body, contentType);
      this.onArtifact({ id, kind, label, pageNumber, pageUrl, storageKey, contentType, size: stored.size });
    } catch (error) {
      console.error(`[debug] could not store ${kind} artifact:`, errorMessage(error));
    }
  }

  /**
   * Snapshot everything about the page's current state.
   *
   * `page` may already be closed or crashed, so every step is independently
   * guarded and a failure in one does not stop the others.
   */
  async captureFailure(options: { page: Page | null; label: string; pageNumber: number | null; pageUrl: string }): Promise<void> {
    const { page, label, pageNumber, pageUrl } = options;

    if (page && !page.isClosed()) {
      try {
        const screenshot = await page.screenshot({ type: "png", fullPage: false, timeout: 10_000 });
        await this.#store("screenshot", label, "png", screenshot, "image/png", pageNumber, pageUrl);
      } catch (error) {
        console.error("[debug] screenshot failed:", errorMessage(error));
      }

      try {
        const html = await page.content();
        await this.#store("html", label, "html", html, "text/html; charset=utf-8", pageNumber, pageUrl);
      } catch (error) {
        console.error("[debug] html capture failed:", errorMessage(error));
      }
    }

    if (this.#console.length > 0) {
      await this.#store("console", label, "txt", this.#console.join("\n"), "text/plain; charset=utf-8", pageNumber, pageUrl);
    }
    if (this.#network.length > 0) {
      await this.#store("network", label, "txt", this.#network.join("\n"), "text/plain; charset=utf-8", pageNumber, pageUrl);
    }
  }

  /**
   * Per-field match counts for the current page — the "expected 10, found 0"
   * table that turns a vague failure into an obvious one.
   */
  async captureSelectorReport(options: {
    page: Page;
    itemSelector: string;
    itemSelectorKind: SelectorKind;
    fields: FieldConfig[];
    pageNumber: number | null;
  }): Promise<SelectorReport | null> {
    try {
      const report = await options.page.evaluate(
        (plan: { itemSelector: string; itemSelectorKind: SelectorKind; fields: FieldConfig[] }) => {
          const queryAll = (selector: string, kind: SelectorKind, scope: Element | Document): Element[] => {
            if (!selector) return scope instanceof Element ? [scope] : [];
            try {
              if (kind === "xpath") {
                const expression = scope instanceof Element && selector.startsWith("//") ? `.${selector}` : selector;
                const result = document.evaluate(expression, scope, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                const nodes: Element[] = [];
                for (let i = 0; i < result.snapshotLength; i++) {
                  const node = result.snapshotItem(i);
                  if (node?.nodeType === 1) nodes.push(node as Element);
                }
                return nodes;
              }
              return Array.from(scope.querySelectorAll(selector));
            } catch {
              return [];
            }
          };

          const items = plan.itemSelector
            ? queryAll(plan.itemSelector, plan.itemSelectorKind, document)
            : [document.documentElement];

          const text = (el: Element) =>
            ((el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim();

          return {
            pageUrl: location.href,
            itemSelector: plan.itemSelector,
            itemsFound: items.length,
            fields: plan.fields.map((field) => {
              // Count across every item, so a field that works on one record
              // and fails on the rest is visible as a partial number.
              let found = 0;
              let sample: string | null = null;
              for (const item of items) {
                const matches = queryAll(field.selector, field.selectorKind, item);
                if (matches.length > 0) {
                  found++;
                  if (sample === null) sample = text(matches[0]!).slice(0, 120) || null;
                }
              }
              return { name: field.name, selector: field.selector, type: field.type, found, sample };
            }),
          };
        },
        {
          itemSelector: options.itemSelector,
          itemSelectorKind: options.itemSelectorKind,
          fields: options.fields,
        },
      );

      await this.#store(
        "selector-report",
        "Selector report",
        "json",
        JSON.stringify(report, null, 2),
        "application/json; charset=utf-8",
        options.pageNumber,
        report.pageUrl,
      );

      return report;
    } catch (error) {
      console.error("[debug] selector report failed:", errorMessage(error));
      return null;
    }
  }
}
