import { useState } from "react";
import { Globe, ListTree, Play, Save, Settings2, Sparkles } from "lucide-react";
import type { PaginationMode, ScraperConfig, SelectorKind, WaitUntil } from "@shared/types.ts";
import { LIMITS } from "@shared/defaults.ts";
import { Card, CardBody, CardHeader } from "./ui/Card.tsx";
import { Button } from "./ui/Button.tsx";
import { FormRow, Input, Select, Switch } from "./ui/Field.tsx";
import { FieldEditor } from "./FieldEditor.tsx";

const PAGINATION_MODES: { value: PaginationMode; label: string }[] = [
  { value: "none", label: "None — single page" },
  { value: "url-pattern", label: "URL pattern (?page={page})" },
  { value: "selector", label: "Click a next-page element" },
  { value: "scroll", label: "Infinite scroll" },
];

const WAIT_UNTIL: { value: WaitUntil; label: string }[] = [
  { value: "domcontentloaded", label: "DOM content loaded (fast)" },
  { value: "load", label: "Load event" },
  { value: "networkidle", label: "Network idle (slowest, most complete)" },
  { value: "commit", label: "Commit (earliest)" },
];

const SELECTOR_KINDS: { value: SelectorKind; label: string }[] = [
  { value: "css", label: "CSS" },
  { value: "xpath", label: "XPath" },
];

const EXAMPLE: Partial<ScraperConfig> = {
  name: "Example products",
  url: "https://example.com/products",
  itemSelector: ".product",
  fields: [
    { id: "f1", name: "name", selector: ".product-name", selectorKind: "css", type: "text", trim: true },
    { id: "f2", name: "price", selector: ".product-price", selectorKind: "css", type: "text", trim: true },
    { id: "f3", name: "image", selector: "img", selectorKind: "css", type: "image", trim: true },
    { id: "f4", name: "url", selector: "a", selectorKind: "css", type: "link", trim: true },
  ],
};

export interface ScraperFormProps {
  value: ScraperConfig;
  onChange: (next: ScraperConfig) => void;
  onSave?: () => void;
  onRun?: () => void;
  saving?: boolean;
  running?: boolean;
  saveLabel?: string;
  disabled?: boolean;
}

export function ScraperForm({
  value,
  onChange,
  onSave,
  onRun,
  saving = false,
  running = false,
  saveLabel = "Save scraper",
  disabled = false,
}: ScraperFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = <K extends keyof ScraperConfig>(key: K, next: ScraperConfig[K]) => onChange({ ...value, [key]: next });
  const setPagination = (patch: Partial<ScraperConfig["pagination"]>) =>
    onChange({ ...value, pagination: { ...value.pagination, ...patch } });

  const numberInput = (
    key: "requestDelayMs" | "timeoutMs" | "maxPages" | "concurrency" | "maxRetries" | "waitForTimeoutMs",
    range: { min: number; max: number },
  ) => ({
    type: "number" as const,
    min: range.min,
    max: range.max,
    value: String(value[key] ?? 0),
    disabled: disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = Number.parseInt(event.target.value, 10);
      set(key, (Number.isFinite(parsed) ? parsed : range.min) as never);
    },
  });

  return (
    <div className="space-y-5">
      {/* Target --------------------------------------------------------- */}
      <Card>
        <CardHeader
          icon={<Globe className="size-4.5" />}
          title="Target"
          description="Where to scrape and which element repeats for each record."
          actions={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange({ ...value, ...EXAMPLE } as ScraperConfig)}
              disabled={disabled}
              icon={<Sparkles className="size-3.5" />}
            >
              Fill example
            </Button>
          }
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <FormRow label="Scraper name" htmlFor="scraper-name" hint="optional">
            <Input
              id="scraper-name"
              value={value.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Product catalogue"
              disabled={disabled}
            />
          </FormRow>

          <FormRow label="Target URL" htmlFor="scraper-url" help="Must be a public http(s) page.">
            <Input
              id="scraper-url"
              value={value.url}
              onChange={(event) => set("url", event.target.value)}
              placeholder="https://example.com/products"
              inputMode="url"
              disabled={disabled}
            />
          </FormRow>

          <FormRow
            label="Item selector"
            htmlFor="item-selector"
            help="One match per record, e.g. .product. Leave empty to treat the whole page as one record."
          >
            <Input
              id="item-selector"
              value={value.itemSelector}
              onChange={(event) => set("itemSelector", event.target.value)}
              placeholder=".product"
              className="font-mono text-xs"
              disabled={disabled}
            />
          </FormRow>

          <FormRow label="Item selector syntax" htmlFor="item-selector-kind">
            <Select
              id="item-selector-kind"
              value={value.itemSelectorKind}
              onChange={(event) => set("itemSelectorKind", event.target.value as SelectorKind)}
              options={SELECTOR_KINDS}
              disabled={disabled}
            />
          </FormRow>
        </CardBody>
      </Card>

      {/* Fields --------------------------------------------------------- */}
      <Card>
        <CardHeader
          icon={<ListTree className="size-4.5" />}
          title="Fields"
          description="One row per column in the results table."
        />
        <CardBody>
          <FieldEditor fields={value.fields} onChange={(fields) => set("fields", fields)} disabled={disabled} />
        </CardBody>
      </Card>

      {/* Pagination & pacing -------------------------------------------- */}
      <Card>
        <CardHeader
          icon={<Settings2 className="size-4.5" />}
          title="Pagination & pacing"
          description="How to walk through pages, and how gently."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormRow label="Pagination" htmlFor="pagination-mode">
              <Select
                id="pagination-mode"
                value={value.pagination.mode}
                onChange={(event) => setPagination({ mode: event.target.value as PaginationMode })}
                options={PAGINATION_MODES}
                disabled={disabled}
              />
            </FormRow>

            <FormRow
              label="Max pages"
              htmlFor="max-pages"
              help="Hard stop, so a run can never walk a site forever."
            >
              <Input id="max-pages" {...numberInput("maxPages", LIMITS.maxPages)} />
            </FormRow>
          </div>

          {value.pagination.mode === "url-pattern" ? (
            <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-4 dark:bg-slate-950/40">
              <FormRow
                label="URL pattern"
                className="sm:col-span-2"
                htmlFor="url-pattern"
                help="Use {page} where the page number goes."
              >
                <Input
                  id="url-pattern"
                  value={value.pagination.urlPattern ?? ""}
                  onChange={(event) => setPagination({ urlPattern: event.target.value })}
                  placeholder="https://example.com/products?page={page}"
                  className="font-mono text-xs"
                  disabled={disabled}
                />
              </FormRow>
              <FormRow label="Start at" htmlFor="start-page">
                <Input
                  id="start-page"
                  type="number"
                  min={0}
                  value={String(value.pagination.startPage ?? 1)}
                  onChange={(event) => setPagination({ startPage: Number.parseInt(event.target.value, 10) || 0 })}
                  disabled={disabled}
                />
              </FormRow>
              <FormRow label="Step" htmlFor="page-step">
                <Input
                  id="page-step"
                  type="number"
                  min={1}
                  value={String(value.pagination.step ?? 1)}
                  onChange={(event) => setPagination({ step: Number.parseInt(event.target.value, 10) || 1 })}
                  disabled={disabled}
                />
              </FormRow>
            </div>
          ) : null}

          {value.pagination.mode === "selector" ? (
            <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3 dark:bg-slate-950/40">
              <FormRow
                label="Next-page selector"
                className="sm:col-span-2"
                htmlFor="next-selector"
                help="The element to click, e.g. a.next or button[aria-label='Next']."
              >
                <Input
                  id="next-selector"
                  value={value.pagination.nextSelector ?? ""}
                  onChange={(event) => setPagination({ nextSelector: event.target.value })}
                  placeholder="a.next"
                  className="font-mono text-xs"
                  disabled={disabled}
                />
              </FormRow>
              <FormRow label="Syntax" htmlFor="next-selector-kind">
                <Select
                  id="next-selector-kind"
                  value={value.pagination.nextSelectorKind ?? "css"}
                  onChange={(event) => setPagination({ nextSelectorKind: event.target.value as SelectorKind })}
                  options={SELECTOR_KINDS}
                  disabled={disabled}
                />
              </FormRow>
            </div>
          ) : null}

          {value.pagination.mode === "scroll" ? (
            <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 dark:bg-slate-950/40">
              <FormRow label="Scroll rounds" htmlFor="scroll-times" help="How many times to scroll to the bottom.">
                <Input
                  id="scroll-times"
                  type="number"
                  min={LIMITS.scrollTimes.min}
                  max={LIMITS.scrollTimes.max}
                  value={String(value.pagination.scrollTimes ?? 3)}
                  onChange={(event) => setPagination({ scrollTimes: Number.parseInt(event.target.value, 10) || 0 })}
                  disabled={disabled}
                />
              </FormRow>
              <FormRow label="Pause between scrolls (ms)" htmlFor="scroll-delay">
                <Input
                  id="scroll-delay"
                  type="number"
                  min={0}
                  max={60000}
                  value={String(value.pagination.scrollDelayMs ?? 600)}
                  onChange={(event) => setPagination({ scrollDelayMs: Number.parseInt(event.target.value, 10) || 0 })}
                  disabled={disabled}
                />
              </FormRow>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <FormRow label="Request delay (ms)" htmlFor="request-delay" help="Pause between page requests.">
              <Input id="request-delay" {...numberInput("requestDelayMs", LIMITS.requestDelayMs)} />
            </FormRow>
            <FormRow label="Timeout (ms)" htmlFor="timeout">
              <Input id="timeout" {...numberInput("timeoutMs", LIMITS.timeoutMs)} />
            </FormRow>
            <FormRow label="Retries per page" htmlFor="retries">
              <Input id="retries" {...numberInput("maxRetries", LIMITS.maxRetries)} />
            </FormRow>
          </div>

          {value.pagination.mode !== "none" ? (
            <Switch
              checked={value.pagination.stopWhenNoNewItems !== false}
              onChange={(next) => setPagination({ stopWhenNoNewItems: next })}
              disabled={disabled}
              label="Stop when a page adds nothing new"
              description="Ends the run early instead of fetching empty pages up to the limit."
            />
          ) : null}
        </CardBody>
      </Card>

      {/* Advanced ------------------------------------------------------- */}
      <Card>
        <CardHeader
          title="Advanced"
          description="Rendering, politeness and request identity."
          actions={
            <Button size="sm" variant="ghost" onClick={() => setShowAdvanced((open) => !open)}>
              {showAdvanced ? "Hide" : "Show"}
            </Button>
          }
        />
        {showAdvanced ? (
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormRow label="Wait until" htmlFor="wait-until" help="How long to wait for the page before extracting.">
                <Select
                  id="wait-until"
                  value={value.waitUntil}
                  onChange={(event) => set("waitUntil", event.target.value as WaitUntil)}
                  options={WAIT_UNTIL}
                  disabled={disabled}
                />
              </FormRow>

              <FormRow
                label="Wait for selector"
                htmlFor="wait-for-selector"
                hint="optional"
                help="Useful when content is rendered by JavaScript after load."
              >
                <Input
                  id="wait-for-selector"
                  value={value.waitForSelector ?? ""}
                  onChange={(event) => set("waitForSelector", event.target.value)}
                  placeholder=".product"
                  className="font-mono text-xs"
                  disabled={disabled}
                />
              </FormRow>

              <FormRow label="Extra settle time (ms)" htmlFor="wait-timeout">
                <Input id="wait-timeout" {...numberInput("waitForTimeoutMs", { min: 0, max: 120_000 })} />
              </FormRow>

              <FormRow
                label="Parallel pages"
                htmlFor="concurrency"
                help="Only used by URL-pattern pagination. Capped by the global limit in Settings."
              >
                <Input id="concurrency" {...numberInput("concurrency", LIMITS.concurrency)} />
              </FormRow>
            </div>

            <FormRow label="User agent" htmlFor="user-agent" help="Sent with every request and matched against robots.txt.">
              <Input
                id="user-agent"
                value={value.userAgent}
                onChange={(event) => set("userAgent", event.target.value)}
                className="font-mono text-xs"
                disabled={disabled}
              />
            </FormRow>

            <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
              <Switch
                checked={value.respectRobotsTxt}
                onChange={(next) => set("respectRobotsTxt", next)}
                disabled={disabled}
                label="Respect robots.txt"
                description="Skip URLs the site disallows, and honour its Crawl-delay. Leave this on unless you own the target site or have written permission."
              />
              <Switch
                checked={value.blockResources}
                onChange={(next) => set("blockResources", next)}
                disabled={disabled}
                label="Block images, fonts and media"
                description="Faster, and much lighter on the target server. Image URLs are still extracted."
              />
            </div>
          </CardBody>
        ) : null}
      </Card>

      {/* Actions -------------------------------------------------------- */}
      {onSave || onRun ? (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          {onSave ? (
            <Button onClick={onSave} loading={saving} disabled={disabled} icon={<Save className="size-4" />}>
              {saveLabel}
            </Button>
          ) : null}
          {onRun ? (
            <Button variant="primary" onClick={onRun} loading={running} disabled={disabled} icon={<Play className="size-4" />}>
              Save & start scraping
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
