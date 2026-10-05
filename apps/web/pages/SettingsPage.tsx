import { useCallback, useEffect, useState } from "react";
import { Monitor, Moon, RotateCcw, Save, Server, Sun } from "lucide-react";
import type { AppSettings, ThemeMode } from "@shared/types.ts";
import { DEFAULT_USER_AGENT, LIMITS } from "@shared/defaults.ts";
import { api, ApiError } from "../services/api.ts";
import { useAsync } from "../hooks/useAsync.ts";
import { useToast } from "../hooks/useToast.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Card, CardBody, CardFooter, CardHeader } from "../components/ui/Card.tsx";
import { FormRow, Input, Switch } from "../components/ui/Field.tsx";
import { ErrorState, LoadingState } from "../components/ui/States.tsx";
import { cx } from "../services/cx.ts";

const THEMES: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun className="size-4" /> },
  { value: "dark", label: "Dark", icon: <Moon className="size-4" /> },
  { value: "system", label: "System", icon: <Monitor className="size-4" /> },
];

export function SettingsPage({ theme, onThemeChange }: { theme: ThemeMode; onThemeChange: (mode: ThemeMode) => void }) {
  const toast = useToast();
  const remote = useAsync<AppSettings>(() => api.getSettings(), []);
  const health = useAsync(() => api.health(), []);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (remote.data) setDraft(remote.data);
  }, [remote.data]);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await api.updateSettings(draft);
      setDraft(saved);
      remote.setData(saved);
      toast.success("Settings saved", "New scrapers will use these defaults.");
    } catch (error) {
      toast.error("Could not save settings", error instanceof ApiError ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [draft, remote, toast]);

  const reset = useCallback(async () => {
    setSaving(true);
    try {
      const defaults = await api.resetSettings();
      setDraft(defaults);
      remote.setData(defaults);
      toast.info("Settings restored to defaults");
    } catch (error) {
      toast.error("Could not reset settings", error instanceof ApiError ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [remote, toast]);

  if (remote.loading && !draft) return <LoadingState label="Loading settings…" />;
  if (remote.error) return <ErrorState message={remote.error} onRetry={remote.reload} />;
  if (!draft) return null;

  const numberField = (
    key: "defaultRequestDelayMs" | "defaultTimeoutMs" | "maxConcurrentPages" | "defaultMaxPages" | "defaultMaxRetries",
    range: { min: number; max: number },
  ) => ({
    type: "number" as const,
    min: range.min,
    max: range.max,
    value: String(draft[key]),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = Number.parseInt(event.target.value, 10);
      set(key, (Number.isFinite(parsed) ? parsed : range.min) as never);
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card>
        <CardHeader title="Appearance" description="Stored in this browser, so each device can differ." />
        <CardBody>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onThemeChange(option.value);
                  set("theme", option.value);
                }}
                className={cx(
                  "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-colors",
                  theme === option.value
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Scraping defaults"
          description="Pre-filled into every new scraper. Existing scrapers keep their own values."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow
              label="Default request delay (ms)"
              htmlFor="default-delay"
              help="Pause between page requests. Higher is kinder to the target site."
            >
              <Input id="default-delay" {...numberField("defaultRequestDelayMs", LIMITS.requestDelayMs)} />
            </FormRow>

            <FormRow label="Default timeout (ms)" htmlFor="default-timeout" help="How long to wait for one page to load.">
              <Input id="default-timeout" {...numberField("defaultTimeoutMs", LIMITS.timeoutMs)} />
            </FormRow>

            <FormRow
              label="Maximum concurrent pages"
              htmlFor="max-concurrent"
              help="Global ceiling. No scraper can open more pages in parallel than this."
            >
              <Input id="max-concurrent" {...numberField("maxConcurrentPages", LIMITS.concurrency)} />
            </FormRow>

            <FormRow label="Default max pages" htmlFor="default-max-pages">
              <Input id="default-max-pages" {...numberField("defaultMaxPages", LIMITS.maxPages)} />
            </FormRow>

            <FormRow label="Default retries per page" htmlFor="default-retries" className="sm:col-span-2">
              <Input id="default-retries" {...numberField("defaultMaxRetries", LIMITS.maxRetries)} />
            </FormRow>
          </div>

          <FormRow
            label="Default user agent"
            htmlFor="default-user-agent"
            help="Sent with every request, and the identity matched against robots.txt rules."
          >
            <Input
              id="default-user-agent"
              value={draft.defaultUserAgent}
              onChange={(event) => set("defaultUserAgent", event.target.value)}
              className="font-mono text-xs"
            />
          </FormRow>
          {draft.defaultUserAgent !== DEFAULT_USER_AGENT ? (
            <Button size="sm" variant="ghost" onClick={() => set("defaultUserAgent", DEFAULT_USER_AGENT)}>
              Restore the standard user agent
            </Button>
          ) : null}

          <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Switch
              checked={draft.respectRobotsTxt}
              onChange={(next) => set("respectRobotsTxt", next)}
              label="Respect robots.txt by default"
              description="Skip disallowed URLs and honour Crawl-delay. Only turn this off for sites you own or have written permission to crawl."
            />
            <Switch
              checked={draft.blockResources}
              onChange={(next) => set("blockResources", next)}
              label="Block images, fonts and media by default"
              description="Pages load faster and the target server does far less work. Image URLs are still extracted."
            />
          </div>
        </CardBody>
        <CardFooter>
          <Button onClick={() => void reset()} disabled={saving} icon={<RotateCcw className="size-4" />}>
            Restore defaults
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} icon={<Save className="size-4" />}>
            Save settings
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader icon={<Server className="size-4.5" />} title="Server" description="Read-only diagnostics." />
        <CardBody>
          {health.error ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{health.error}</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-slate-500 dark:text-slate-400">Runtime</dt>
                <dd className="font-mono text-xs text-slate-700 dark:text-slate-300">{health.data?.runtime ?? "…"}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-slate-500 dark:text-slate-400">Chromium</dt>
                <dd className="min-w-0 font-mono text-xs break-all text-slate-700 dark:text-slate-300">
                  {health.data?.chromium ?? "…"}
                </dd>
              </div>
            </dl>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Responsible use</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Use this tool only for data that is publicly accessible, and respect each target site's robots.txt, rate
            limits and terms of use. Do not collect personal data without a lawful basis, and keep request rates low
            enough that you never degrade the service for anyone else. You are responsible for how you use it.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
