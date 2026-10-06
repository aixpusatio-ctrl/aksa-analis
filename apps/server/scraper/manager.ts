import type { LogLevel, Run, RunMode, RunProgress, ScraperConfig } from "@shared/types.ts";
import { ScrapeRunner, type RunSink } from "./engine.ts";
import { eventBus } from "../utils/event-bus.ts";
import { conflict, errorMessage, notFound } from "../utils/errors.ts";
import { nowIso } from "../utils/ids.ts";
import * as runService from "../services/run-service.ts";

interface ActiveRun {
  runner: ScrapeRunner;
  run: Run;
  progress: RunProgress;
  finished: Promise<void>;
}

/**
 * Owns the lifecycle of every in-flight scrape: it wires the engine to the
 * database and to the SSE event bus, and is the only place that knows whether
 * a run is still going.
 */
class ScrapeManager {
  #active = new Map<string, ActiveRun>();

  /** Kick off a run. Resolves as soon as the run is registered, not when it ends. */
  start(options: { scraperId: string | null; config: ScraperConfig; mode?: RunMode; maxItems?: number }): Run {
    if (options.scraperId) {
      const existing = this.activeRunForScraper(options.scraperId);
      if (existing) throw conflict(`This scraper is already running (run ${existing.id})`);
    }

    const mode: RunMode = options.mode ?? "normal";
    const run = runService.createRun({ scraperId: options.scraperId, config: options.config, mode });
    let nextPosition = 0;

    const progress: RunProgress = {
      ...runService.runProgress(run),
      status: "running",
      startedAt: nowIso(),
    };

    const emitProgress = (type: "progress" | "status") => {
      eventBus.emit({ type, runId: run.id, payload: { ...progress } });
    };

    const sink: RunSink = {
      log: (level: LogLevel, message: string) => {
        const createdAt = nowIso();
        try {
          runService.appendLog(run.id, level, message, createdAt);
        } catch (error) {
          console.error("[scrape] failed to persist log line:", error);
        }
        eventBus.emit({ type: "log", runId: run.id, payload: { runId: run.id, level, message, createdAt } });
      },

      saveItems: (pageNumber, pageUrl, items) => {
        runService.insertResults(run.id, pageNumber, pageUrl, items, nextPosition);
        nextPosition += items.length;
        eventBus.emit({
          type: "items",
          runId: run.id,
          payload: { pageNumber, count: items.length, sample: items.slice(0, 3) },
        });
      },

      onArtifact: (artifact) => {
        try {
          runService.recordArtifact({ ...artifact, runId: run.id });
        } catch (error) {
          console.error("[scrape] failed to record debug artifact:", error);
        }
      },

      onProgress: (update) => {
        progress.pagesProcessed = update.pagesProcessed;
        progress.totalItems = update.totalItems;
        progress.currentUrl = update.currentUrl;
        progress.pagesPlanned = update.pagesPlanned;
        progress.percent =
          update.pagesPlanned && update.pagesPlanned > 0
            ? Math.min(100, Math.round((update.pagesProcessed / update.pagesPlanned) * 100))
            : null;

        runService.updateRun(run.id, {
          pagesProcessed: update.pagesProcessed,
          totalItems: update.totalItems,
          pagesPlanned: update.pagesPlanned,
        });
        emitProgress("progress");
      },
    };

    const runner = new ScrapeRunner(options.config, sink, {
      runId: run.id,
      // A test run is capped, and always leaves a selector report behind so
      // the result can be understood without re-running anything.
      ...(mode === "test" ? { maxItems: options.maxItems ?? 5, alwaysCaptureReport: true } : {}),
    });

    runService.updateRun(run.id, { status: "running", startedAt: progress.startedAt });
    const registered: Run = { ...run, status: "running", startedAt: progress.startedAt, mode };
    emitProgress("status");

    const finished = this.#execute(registered, runner, sink, progress, emitProgress);
    this.#active.set(run.id, { runner, run: registered, progress, finished });
    return registered;
  }

  async #execute(
    run: Run,
    runner: ScrapeRunner,
    sink: RunSink,
    progress: RunProgress,
    emitProgress: (type: "progress" | "status") => void,
  ): Promise<void> {
    try {
      const summary = await runner.run();
      progress.status = summary.stopped ? "stopped" : "completed";
      progress.totalItems = summary.totalItems;
      progress.pagesProcessed = summary.pagesProcessed;
      if (progress.percent !== null && !summary.stopped) progress.percent = 100;
    } catch (error) {
      const message = errorMessage(error);
      progress.status = runner.stopped ? "stopped" : "failed";
      progress.errorMessage = runner.stopped ? null : message;
      if (!runner.stopped) sink.log("error", message);
    } finally {
      progress.finishedAt = nowIso();
      progress.currentUrl = null;

      runService.updateRun(run.id, {
        status: progress.status,
        finishedAt: progress.finishedAt,
        totalItems: progress.totalItems,
        pagesProcessed: progress.pagesProcessed,
        errorMessage: progress.errorMessage,
      });
      emitProgress("status");

      // Keep the finished snapshot around briefly so a client polling right
      // after completion still sees the terminal state from memory.
      setTimeout(() => this.#active.delete(run.id), 30_000);
    }
  }

  stop(runId: string): RunProgress {
    const active = this.#active.get(runId);
    if (!active) {
      const run = runService.findRun(runId);
      if (!run) throw notFound(`Run ${runId} does not exist`);
      if (run.status === "running" || run.status === "queued") {
        // The run died with the previous server process.
        runService.updateRun(runId, { status: "stopped", finishedAt: nowIso() });
        return runService.runProgress({ ...run, status: "stopped" });
      }
      throw conflict(`Run ${runId} is not running (status: ${run.status})`);
    }

    // A finished snapshot lingers in `#active` for a short while, so a stop
    // that arrives just after completion must not look like a success.
    if (active.progress.status !== "running" && active.progress.status !== "queued") {
      throw conflict(`Run ${runId} is not running (status: ${active.progress.status})`);
    }

    active.runner.stop();
    return { ...active.progress };
  }

  /** Stop whatever is running for a scraper. Returns null when nothing was. */
  stopByScraper(scraperId: string): RunProgress | null {
    const active = this.activeRunForScraper(scraperId);
    return active ? this.stop(active.id) : null;
  }

  isActive(runId: string): boolean {
    return this.#active.has(runId);
  }

  /** The genuinely in-flight run for a scraper, ignoring finished snapshots. */
  activeRunForScraper(scraperId: string): Run | null {
    for (const entry of this.#active.values()) {
      const live = entry.progress.status === "running" || entry.progress.status === "queued";
      if (live && entry.run.scraperId === scraperId) return entry.run;
    }
    return null;
  }

  /** Live progress when the run is in flight, otherwise the stored snapshot. */
  progressFor(runId: string): RunProgress {
    const active = this.#active.get(runId);
    if (active) return { ...active.progress };
    return runService.runProgress(runService.getRun(runId));
  }

  activeRuns(): Run[] {
    return [...this.#active.values()].filter((entry) => entry.progress.status === "running").map((entry) => entry.run);
  }

  /** Stop everything and wait for the runners to unwind — used on shutdown. */
  async shutdown(): Promise<void> {
    const pending = [...this.#active.values()];
    for (const entry of pending) entry.runner.stop();
    await Promise.allSettled(pending.map((entry) => entry.finished));
  }
}

export const scrapeManager = new ScrapeManager();
