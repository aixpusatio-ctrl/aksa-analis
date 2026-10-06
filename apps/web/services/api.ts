import type {
  AppSettings,
  DetectedSchema,
  ExportFormat,
  FieldConfig,
  LogEntry,
  Paginated,
  PreviewResult,
  ResultRow,
  Run,
  RunArtifact,
  RunMode,
  RunProgress,
  RunStatus,
  Scraper,
  ScraperConfig,
  SelectorKind,
  SelectorTestResult,
  SnapshotInfo,
  WaitUntil,
} from "@shared/types.ts";

/** Same origin by default; override to point the UI at a remote API. */
export const API_BASE = (import.meta.env?.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let details: unknown;
    try {
      const body = (await response.json()) as { error?: string; details?: unknown };
      if (body?.error) message = body.error;
      details = body?.details;
    } catch {
      /* non-JSON error body — keep the status line */
    }
    throw new ApiError(response.status, message, details);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const query = (params: Record<string, string | number | undefined | null>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

export interface StatusResponse {
  run: Run | null;
  progress: RunProgress | null;
  running: boolean;
}

export interface ResultsResponse extends Paginated<ResultRow> {
  columns: string[];
  runId?: string | null;
}

export const api = {
  /* Scrapers ------------------------------------------------------- */
  listScrapers: () => request<{ items: Scraper[] }>("/api/scrapers").then((body) => body.items),
  getScraper: (id: string) => request<Scraper>(`/api/scrapers/${id}`),
  createScraper: (config: Partial<ScraperConfig>) =>
    request<Scraper>("/api/scrapers", { method: "POST", body: JSON.stringify(config) }),
  updateScraper: (id: string, config: Partial<ScraperConfig>) =>
    request<Scraper>(`/api/scrapers/${id}`, { method: "PUT", body: JSON.stringify(config) }),
  deleteScraper: (id: string) => request<void>(`/api/scrapers/${id}`, { method: "DELETE" }),
  duplicateScraper: (id: string) => request<Scraper>(`/api/scrapers/${id}/duplicate`, { method: "POST" }),

  /* Running -------------------------------------------------------- */
  startScraper: (id: string, overrides: Partial<ScraperConfig> = {}) =>
    request<{ run: Run; progress: RunProgress }>(`/api/scrapers/${id}/start`, {
      method: "POST",
      body: JSON.stringify(overrides),
    }),
  stopScraper: (id: string) => request<{ progress: RunProgress }>(`/api/scrapers/${id}/stop`, { method: "POST" }),
  scraperStatus: (id: string) => request<StatusResponse>(`/api/scrapers/${id}/status`),
  scraperResults: (id: string, params: { page?: number; pageSize?: number; search?: string } = {}) =>
    request<ResultsResponse>(`/api/scrapers/${id}/results${query(params)}`),

  /** Run a configuration without saving it. */
  scrapeNow: (config: Partial<ScraperConfig>) =>
    request<{ run: Run; progress: RunProgress }>("/api/scrape", { method: "POST", body: JSON.stringify(config) }),

  /* Runs ----------------------------------------------------------- */
  getRun: (id: string) => request<StatusResponse>(`/api/runs/${id}`),
  stopRun: (id: string) => request<{ progress: RunProgress }>(`/api/runs/${id}/stop`, { method: "POST" }),
  runStatus: (id: string) => request<{ progress: RunProgress }>(`/api/runs/${id}/status`),
  deleteRun: (id: string) => request<void>(`/api/runs/${id}`, { method: "DELETE" }),
  runResults: (id: string, params: { page?: number; pageSize?: number; search?: string } = {}) =>
    request<ResultsResponse>(`/api/runs/${id}/results${query(params)}`),
  runLogs: (id: string, params: { limit?: number; afterId?: number } = {}) =>
    request<{ items: LogEntry[] }>(`/api/runs/${id}/logs${query(params)}`).then((body) => body.items),

  runArtifacts: (id: string) =>
    request<{ items: RunArtifact[] }>(`/api/runs/${id}/artifacts`).then((body) => body.items),
  artifactText: (url: string) => fetch(`${API_BASE}${url}`).then((r) => r.text()),
  artifactJson: <T>(url: string) => fetch(`${API_BASE}${url}`).then((r) => r.json() as Promise<T>),

  /* Test runs ------------------------------------------------------- */
  testScraper: (id: string, maxItems = 5) =>
    request<{ run: Run; progress: RunProgress }>(`/api/scrapers/${id}/test`, {
      method: "POST",
      body: JSON.stringify({ maxItems }),
    }),
  testConfig: (config: Partial<ScraperConfig>, maxItems = 5) =>
    request<{ run: Run; progress: RunProgress }>("/api/scrape/test", {
      method: "POST",
      body: JSON.stringify({ ...config, maxItems }),
    }),

  /* Visual inspector ------------------------------------------------ */
  openSnapshot: (input: { url: string; waitForSelector?: string; waitUntil?: WaitUntil; timeoutMs?: number; userAgent?: string }) =>
    request<SnapshotInfo>("/api/inspector/snapshots", { method: "POST", body: JSON.stringify(input) }),

  testSelector: (input: {
    url: string;
    selector: string;
    selectorKind: SelectorKind;
    waitForSelector?: string;
    timeoutMs?: number;
  }) => request<SelectorTestResult>("/api/inspector/test-selector", { method: "POST", body: JSON.stringify(input) }),

  previewExtraction: (input: {
    url: string;
    itemSelector: string;
    itemSelectorKind: SelectorKind;
    fields: FieldConfig[];
    waitForSelector?: string;
    limit?: number;
  }) => request<PreviewResult>("/api/inspector/preview", { method: "POST", body: JSON.stringify(input) }),

  detectSchema: (input: { url: string; waitForSelector?: string; timeoutMs?: number }) =>
    request<{ url: string; schema: DetectedSchema | null }>("/api/inspector/detect", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /* History -------------------------------------------------------- */
  history: (
    params: { page?: number; pageSize?: number; status?: RunStatus | "all"; search?: string; mode?: RunMode | "all" } = {},
  ) => request<Paginated<Run>>(`/api/history${query(params)}`),

  /* Export --------------------------------------------------------- */
  exportUrl: (runId: string, format: ExportFormat) => `${API_BASE}/api/results/${runId}/export?format=${format}`,

  /* Settings & stats ----------------------------------------------- */
  getSettings: () => request<AppSettings>("/api/settings"),
  updateSettings: (patch: Partial<AppSettings>) =>
    request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  resetSettings: () => request<AppSettings>("/api/settings", { method: "DELETE" }),

  stats: () =>
    request<{
      totalRuns: number;
      totalItems: number;
      activeRuns: number;
      failedRuns: number;
      savedScrapers: number;
      recentRuns: Run[];
    }>("/api/stats"),

  health: () => request<{ ok: boolean; runtime: string; chromium: string }>("/api/health"),
};

/** Trigger a browser download for a finished run. */
export function downloadExport(runId: string, format: ExportFormat): void {
  const anchor = document.createElement("a");
  anchor.href = api.exportUrl(runId, format);
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
