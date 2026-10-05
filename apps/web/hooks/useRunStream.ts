import { useCallback, useEffect, useRef, useState } from "react";
import type { LogEntry, RunProgress, ScraperEvent } from "@shared/types.ts";
import { API_BASE, api } from "../services/api.ts";

const MAX_LOG_LINES = 2000;

export interface RunStream {
  logs: LogEntry[];
  progress: RunProgress | null;
  connected: boolean;
  /** Bumps whenever a batch of items lands, so result tables can refetch. */
  itemsVersion: number;
  clearLogs: () => void;
}

/**
 * Subscribe to a run's realtime stream.
 *
 * Existing log lines are loaded once over HTTP so a page reload mid-run shows
 * the full history, then SSE takes over for everything new.
 */
export function useRunStream(runId: string | null): RunStream {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [connected, setConnected] = useState(false);
  const [itemsVersion, setItemsVersion] = useState(0);
  const syntheticId = useRef(-1);

  const clearLogs = useCallback(() => setLogs([]), []);

  useEffect(() => {
    setLogs([]);
    setProgress(null);
    setConnected(false);
    if (!runId) return;

    let cancelled = false;

    // Backfill, then stream. Both paths append, and the stream only adds lines
    // created after the backfill, so ordering stays correct.
    void (async () => {
      try {
        const [existing, status] = await Promise.all([api.runLogs(runId, { limit: MAX_LOG_LINES }), api.runStatus(runId)]);
        if (cancelled) return;
        setLogs(existing);
        setProgress(status.progress);
      } catch {
        /* a brand-new run has nothing to backfill */
      }
    })();

    const source = new EventSource(`${API_BASE}/api/runs/${runId}/events`);

    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("open", () => setConnected(true));

    const onEvent = (raw: MessageEvent<string>) => {
      let event: ScraperEvent;
      try {
        event = JSON.parse(raw.data) as ScraperEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case "log":
          setLogs((current) => {
            const entry: LogEntry = { id: syntheticId.current--, ...event.payload };
            const next = [...current, entry];
            return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
          });
          break;
        case "progress":
        case "status":
          setProgress(event.payload);
          break;
        case "items":
          setItemsVersion((value) => value + 1);
          break;
      }
    };

    source.addEventListener("log", onEvent);
    source.addEventListener("progress", onEvent);
    source.addEventListener("status", onEvent);
    source.addEventListener("items", onEvent);
    source.addEventListener("error", () => setConnected(false));

    return () => {
      cancelled = true;
      source.close();
      setConnected(false);
    };
  }, [runId]);

  return { logs, progress, connected, itemsVersion, clearLogs };
}
