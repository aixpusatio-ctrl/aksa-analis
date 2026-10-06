import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Eye,
  Globe,
  MousePointerClick,
  Play,
  RefreshCw,
  Save,
  Target,
  Trash2,
  Wand2,
} from "lucide-react";
import type {
  DetectedSchema,
  FieldConfig,
  FieldType,
  PickedElement,
  ScraperConfig,
  SelectorKind,
  SnapshotInfo,
} from "@shared/types.ts";
import { defaultScraperConfig, emptyField } from "@shared/defaults.ts";
import { api, ApiError } from "../services/api.ts";
import { usePicker } from "../hooks/usePicker.ts";
import { useToast } from "../hooks/useToast.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Card, CardBody, CardHeader } from "../components/ui/Card.tsx";
import { Input, Select } from "../components/ui/Field.tsx";
import { Badge } from "../components/ui/Badge.tsx";
import { EmptyState, Spinner } from "../components/ui/States.tsx";
import { PickPanel } from "../components/inspector/PickPanel.tsx";
import { DetectModal } from "../components/inspector/DetectPanel.tsx";
import { cx } from "../services/cx.ts";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "link", label: "Link" },
  { value: "image", label: "Image" },
  { value: "title", label: "Title" },
  { value: "attribute", label: "Attribute" },
  { value: "html", label: "HTML" },
];

/**
 * Point-and-click scraper building.
 *
 * The page is rendered server-side by Playwright, sanitized, and served back
 * from our own origin so it can be iframed and talked to. Clicking an element
 * in that frame produces a selector; the field list and the live preview are
 * resolved in the same frame, so feedback costs nothing.
 */
export function VisualBuilderPage({ navigate }: { navigate: (to: string) => void }) {
  const toast = useToast();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const picker = usePicker(frameRef);

  const [url, setUrl] = useState("");
  const [waitForSelector, setWaitForSelector] = useState("");
  const [snapshot, setSnapshot] = useState<SnapshotInfo | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [itemSelector, setItemSelector] = useState("");
  const [selectorKind, setSelectorKind] = useState<SelectorKind>("css");
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [itemCount, setItemCount] = useState<number | null>(null);

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectedSchema | null>(null);
  const [detectOpen, setDetectOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  /* ---------------------------------------------------------------- */
  /* Opening a page                                                   */
  /* ---------------------------------------------------------------- */

  const open = useCallback(async () => {
    const target = url.trim();
    if (!target) return;

    setOpening(true);
    setOpenError(null);
    picker.reset();
    setRows([]);
    setItemCount(null);

    try {
      const info = await api.openSnapshot({
        url: target.startsWith("http") ? target : `https://${target}`,
        waitForSelector: waitForSelector.trim() || undefined,
      });
      setSnapshot(info);
      setUrl(info.url);
      if (!name) setName(info.title || new URL(info.url).hostname);
      if (!info.robotsAllowed) {
        toast.warning("robots.txt disallows this page", "You can still build a scraper, but running it will be refused.");
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : String(error);
      setOpenError(message);
      setSnapshot(null);
    } finally {
      setOpening(false);
    }
  }, [url, waitForSelector, name, picker, toast]);

  /* ---------------------------------------------------------------- */
  /* Live preview, resolved inside the snapshot frame                 */
  /* ---------------------------------------------------------------- */

  const refreshPreview = useCallback(async () => {
    if (!picker.ready) return;
    const usable = fields.filter((field) => field.name.trim());
    if (usable.length === 0) {
      setRows([]);
      setPreviewError(null);
      return;
    }
    try {
      const result = await picker.preview({ itemSelector, itemSelectorKind: selectorKind, fields: usable, limit: 10 });
      setRows(result.rows);
      setItemCount(result.itemCount);
      setPreviewError(result.error);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : String(error));
    }
  }, [picker, fields, itemSelector, selectorKind]);

  // Debounced so typing in a selector box does not fire a resolve per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void refreshPreview(), 250);
    return () => clearTimeout(timer);
  }, [refreshPreview]);

  useEffect(() => {
    if (!picker.ready || !itemSelector) return;
    void picker.highlight(itemSelector, selectorKind).then((result) => setItemCount(result.count));
  }, [picker.ready, itemSelector, selectorKind, picker]);

  /* ---------------------------------------------------------------- */
  /* Field editing                                                    */
  /* ---------------------------------------------------------------- */

  const addField = useCallback(
    (input: { name: string; selector: string; type: FieldType }) => {
      setFields((current) => {
        // Keep names unique without silently overwriting an existing column.
        let unique = input.name || "field";
        let suffix = 2;
        while (current.some((field) => field.name === unique)) unique = `${input.name}_${suffix++}`;
        return [
          ...current,
          emptyField({ name: unique, selector: input.selector, selectorKind: selectorKind, type: input.type }),
        ];
      });
      picker.setPicked(null);
    },
    [picker, selectorKind],
  );

  const updateField = (id: string, patch: Partial<FieldConfig>) =>
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));

  const removeField = (id: string) => setFields((current) => current.filter((field) => field.id !== id));

  /* ---------------------------------------------------------------- */
  /* Auto detect                                                      */
  /* ---------------------------------------------------------------- */

  const detect = useCallback(async () => {
    if (!snapshot) return;
    setDetecting(true);
    try {
      const result = await api.detectSchema({
        url: snapshot.url,
        waitForSelector: waitForSelector.trim() || undefined,
      });
      setDetected(result.schema);
      setDetectOpen(true);
    } catch (error) {
      toast.error("Auto detect failed", error instanceof ApiError ? error.message : String(error));
    } finally {
      setDetecting(false);
    }
  }, [snapshot, waitForSelector, toast]);

  const acceptDetected = useCallback(
    (schema: DetectedSchema) => {
      setSelectorKind("css");
      setItemSelector(schema.itemSelector);
      setFields(
        schema.fields.map((field) =>
          emptyField({
            name: field.name,
            selector: field.selector,
            selectorKind: "css",
            type: field.type,
            ...(field.attribute ? { attribute: field.attribute } : {}),
          }),
        ),
      );
      setDetectOpen(false);
      toast.success(`Applied ${schema.fields.length} detected fields`, "Edit anything that is not quite right.");
    },
    [toast],
  );

  /* ---------------------------------------------------------------- */
  /* Saving and testing                                               */
  /* ---------------------------------------------------------------- */

  const buildConfig = useCallback((): Partial<ScraperConfig> => {
    const base = defaultScraperConfig();
    return {
      ...base,
      name: name.trim() || (snapshot ? new URL(snapshot.url).hostname : "Untitled scraper"),
      url: snapshot?.url ?? url.trim(),
      itemSelector,
      itemSelectorKind: selectorKind,
      fields: fields.filter((field) => field.name.trim()),
      ...(waitForSelector.trim() ? { waitForSelector: waitForSelector.trim() } : {}),
      pagination: { mode: "none" },
    };
  }, [name, snapshot, url, itemSelector, selectorKind, fields, waitForSelector]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const saved = await api.createScraper(buildConfig());
      toast.success("Scraper saved", "Add pagination and pacing in the editor.");
      navigate(`scrapers/${saved.id}`);
    } catch (error) {
      toast.error("Could not save", error instanceof ApiError ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [buildConfig, toast, navigate]);

  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      const { run } = await api.testConfig(buildConfig(), 5);
      toast.info("Test run started", "Capped at 5 records.");
      navigate(`results/${run.id}`);
    } catch (error) {
      toast.error("Could not start the test", error instanceof ApiError ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }, [buildConfig, toast, navigate]);

  const columns = useMemo(() => fields.filter((field) => field.name.trim()).map((field) => field.name), [fields]);
  const canSave = Boolean(snapshot) && columns.length > 0;

  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-4">
      {/* Address bar */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="builder-url" className="field-label">
              Page to inspect
            </label>
            <div className="relative">
              <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="builder-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void open();
                }}
                placeholder="https://example.com/products"
                className="pl-9"
                inputMode="url"
              />
            </div>
          </div>

          <div className="w-44">
            <label htmlFor="builder-wait" className="field-label">
              Wait for <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <Input
              id="builder-wait"
              value={waitForSelector}
              onChange={(event) => setWaitForSelector(event.target.value)}
              placeholder=".product"
              className="font-mono text-xs"
            />
          </div>

          <Button variant="primary" onClick={() => void open()} loading={opening} icon={<Eye className="size-4" />}>
            {snapshot ? "Reload" : "Open preview"}
          </Button>
          {snapshot ? (
            <Button onClick={() => void detect()} loading={detecting} icon={<Wand2 className="size-4" />}>
              Auto detect
            </Button>
          ) : null}
        </CardBody>
      </Card>

      {openError ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-rose-800 dark:text-rose-300">Could not open that page</p>
            <p className="mt-0.5 text-sm break-words text-rose-700 dark:text-rose-400">{openError}</p>
          </div>
        </div>
      ) : null}

      {!snapshot ? (
        <Card>
          <EmptyState
            icon={<MousePointerClick className="size-6" />}
            title="Build a scraper by clicking"
            description="Open a page, then click the things you want. Selectors are generated for you, and you can edit any of them by hand."
            className="py-16"
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_26rem]">
          {/* Preview frame */}
          <Card className="overflow-hidden">
            <CardHeader
              title={snapshot.title || "Preview"}
              description={snapshot.url}
              actions={
                <div className="flex items-center gap-2">
                  {!snapshot.robotsAllowed ? <Badge tone="warning">robots.txt disallows</Badge> : null}
                  <Button
                    size="sm"
                    variant={picker.pickMode ? "primary" : "secondary"}
                    onClick={() => picker.setHover(!picker.pickMode)}
                    icon={<MousePointerClick className="size-3.5" />}
                  >
                    {picker.pickMode ? "Picking" : "Pick"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void open()} aria-label="Reload preview">
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
              }
            />
            <div className="relative h-[34rem] bg-white dark:bg-slate-950">
              {!picker.ready ? (
                <div className="absolute inset-0 z-10 grid place-items-center bg-white/80 dark:bg-slate-950/80">
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Spinner /> Loading the page…
                  </div>
                </div>
              ) : null}
              <iframe
                ref={frameRef}
                key={snapshot.id}
                src={snapshot.pageUrl}
                title="Page preview"
                className="size-full border-0"
                // The snapshot is inert and served under a strict CSP; same-origin
                // is what lets the picker talk back to this window.
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          </Card>

          {/* Configuration */}
          <div className="space-y-4">
            {picker.picked ? (
              <PickPanel
                picked={picker.picked as PickedElement}
                selectorKind={selectorKind}
                hasItemSelector={Boolean(itemSelector)}
                onUseAsItem={(selector) => {
                  setItemSelector(selector);
                  picker.setPicked(null);
                }}
                onAddField={addField}
                onHighlight={(selector) => void picker.highlight(selector, selectorKind)}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center dark:border-slate-700">
                <MousePointerClick className="mx-auto size-5 text-slate-400" />
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Click anything in the preview</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Start with one record to set the item selector, then click the parts you want.
                </p>
              </div>
            )}

            <Card>
              <CardHeader title="Scraper" description="Name, item selector and selector syntax" />
              <CardBody className="space-y-3">
                <div>
                  <label htmlFor="builder-name" className="field-label">
                    Name
                  </label>
                  <Input id="builder-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>

                <div>
                  <label htmlFor="builder-item" className="field-label flex items-baseline justify-between gap-2">
                    <span>Item selector</span>
                    {itemCount !== null ? (
                      <span
                        className={cx(
                          "text-xs tabular-nums",
                          itemCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {itemCount} match{itemCount === 1 ? "" : "es"}
                      </span>
                    ) : null}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="builder-item"
                      value={itemSelector}
                      onChange={(event) => setItemSelector(event.target.value)}
                      placeholder="(empty = whole page is one record)"
                      className="font-mono text-xs"
                    />
                    <Button
                      size="icon"
                      onClick={() => void picker.highlight(itemSelector, selectorKind).then((r) => setItemCount(r.count))}
                      aria-label="Highlight item selector"
                      title="Highlight matches"
                    >
                      <Target className="size-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label htmlFor="builder-kind" className="field-label">
                    Selector syntax
                  </label>
                  <Select
                    id="builder-kind"
                    value={selectorKind}
                    onChange={(event) => setSelectorKind(event.target.value as SelectorKind)}
                    options={[
                      { value: "css", label: "CSS" },
                      { value: "xpath", label: "XPath" },
                    ]}
                  />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={`Fields (${fields.length})`}
                description="Each one becomes a column"
                actions={
                  fields.length > 0 ? (
                    <Button size="sm" variant="ghost" onClick={() => setFields([])}>
                      Clear
                    </Button>
                  ) : null
                }
              />
              <CardBody className="space-y-2">
                {fields.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-500 dark:text-slate-400">
                    No fields yet — click an element and choose “Add as field”.
                  </p>
                ) : (
                  fields.map((field) => (
                    <div
                      key={field.id}
                      className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <div className="flex gap-2">
                        <Input
                          value={field.name}
                          onChange={(event) => updateField(field.id, { name: event.target.value })}
                          placeholder="field name"
                          className="h-8 font-mono text-xs"
                          aria-label="Field name"
                        />
                        <Select
                          value={field.type}
                          onChange={(event) => updateField(field.id, { type: event.target.value as FieldType })}
                          options={FIELD_TYPES}
                          className="h-8 w-32 text-xs"
                          aria-label="Field type"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeField(field.id)}
                          aria-label={`Remove ${field.name}`}
                          className="size-8 shrink-0 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={field.selector}
                          onChange={(event) => updateField(field.id, { selector: event.target.value })}
                          placeholder="selector (relative to item)"
                          className="h-8 font-mono text-xs"
                          aria-label="Field selector"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          onClick={() =>
                            void picker.highlight(
                              itemSelector ? `${itemSelector} ${field.selector}` : field.selector,
                              selectorKind,
                            )
                          }
                          aria-label={`Highlight ${field.name}`}
                          title="Highlight matches"
                        >
                          <Target className="size-3.5" />
                        </Button>
                      </div>
                      {field.type === "attribute" ? (
                        <Input
                          value={field.attribute ?? ""}
                          onChange={(event) => updateField(field.id, { attribute: event.target.value })}
                          placeholder="attribute name, e.g. data-id"
                          className="h-8 font-mono text-xs"
                          aria-label="Attribute name"
                        />
                      ) : null}
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => void save()}
                loading={saving}
                disabled={!canSave}
                icon={<Save className="size-4" />}
              >
                Save scraper
              </Button>
              <Button onClick={() => void runTest()} loading={testing} disabled={!canSave} icon={<Play className="size-4" />}>
                Test run
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Live extraction preview */}
      {snapshot && columns.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Live preview"
            description={
              previewError
                ? previewError
                : `${rows.length} of ${itemCount ?? rows.length} record(s), resolved against the page you are looking at`
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950/40">
                <tr>
                  <th className="w-10 px-3 py-2 text-left text-xs font-semibold text-slate-500">#</th>
                  {columns.map((column) => (
                    <th key={column} className="px-3 py-2 text-left font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                      Nothing matched yet — check the item selector and field selectors.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2 text-xs text-slate-400 tabular-nums">{index + 1}</td>
                      {columns.map((column) => {
                        const value = row[column];
                        const text = Array.isArray(value) ? value.join(", ") : value === null || value === undefined ? "" : String(value);
                        return (
                          <td key={column} className="max-w-[18rem] px-3 py-2">
                            {text ? (
                              <span className="line-clamp-2 break-words text-slate-700 dark:text-slate-300" title={text}>
                                {text}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300 italic dark:text-slate-600">empty</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <DetectModal
        open={detectOpen}
        schema={detected}
        onClose={() => setDetectOpen(false)}
        onAccept={acceptDetected}
        onUseAlternative={(selector) => {
          setItemSelector(selector);
          setDetectOpen(false);
        }}
      />
    </div>
  );
}
