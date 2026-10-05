import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Copy, Trash2 } from "lucide-react";
import type { LogEntry, LogLevel } from "@shared/types.ts";
import { cx } from "../services/cx.ts";
import { Button } from "./ui/Button.tsx";

const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: "text-slate-400 dark:text-slate-500",
  info: "text-slate-600 dark:text-slate-300",
  success: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-rose-600 dark:text-rose-400",
};

const clockTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "--:--:--" : date.toTimeString().slice(0, 8);
};

/**
 * Realtime log view. It follows the tail automatically, but stops following
 * the moment the user scrolls up so reading older lines is not interrupted.
 */
export function LogConsole({
  logs,
  connected,
  onClear,
  height = "h-72",
}: {
  logs: LogEntry[];
  connected?: boolean;
  onClear?: () => void;
  height?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    if (!follow) return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [logs, follow]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    setFollow(atBottom);
  };

  const copyAll = () => {
    void navigator.clipboard.writeText(logs.map((log) => `[${clockTime(log.createdAt)}] ${log.message}`).join("\n"));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cx(
              "size-2 shrink-0 rounded-full",
              connected ? "animate-pulse bg-emerald-400" : "bg-slate-600",
            )}
            aria-hidden
          />
          <p className="truncate text-xs font-medium text-slate-300">
            Live log
            <span className="ml-2 text-slate-500">
              {connected ? "connected" : "idle"} · {logs.length} line{logs.length === 1 ? "" : "s"}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!follow ? (
            <button
              type="button"
              onClick={() => {
                setFollow(true);
                const element = scrollRef.current;
                if (element) element.scrollTop = element.scrollHeight;
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
            >
              <ArrowDownToLine className="size-3" />
              Follow
            </button>
          ) : null}
          <button
            type="button"
            onClick={copyAll}
            disabled={logs.length === 0}
            aria-label="Copy log"
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
          >
            <Copy className="size-3.5" />
          </button>
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              disabled={logs.length === 0}
              aria-label="Clear log"
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cx("overflow-y-auto px-3 py-2.5 font-mono text-xs leading-relaxed", height)}
      >
        {logs.length === 0 ? (
          <p className="py-6 text-center text-slate-600">Waiting for output…</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2.5 py-px">
              <span className="shrink-0 text-slate-600 select-none">[{clockTime(log.createdAt)}]</span>
              <span className={cx("min-w-0 break-words whitespace-pre-wrap", LEVEL_STYLES[log.level])}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
