import { CheckCircle2, Crosshair, Layers, Plus, Target } from "lucide-react";
import type { FieldType, PickedElement, SelectorKind } from "@shared/types.ts";
import { Button } from "../ui/Button.tsx";
import { Badge } from "../ui/Badge.tsx";
import { cx } from "../../services/cx.ts";

/**
 * What the picker found when an element was clicked: the selectors it can
 * offer, how many elements each one matches, and the two things worth doing
 * with it — make it the repeating item, or make it a field.
 */
export function PickPanel({
  picked,
  selectorKind,
  hasItemSelector,
  onUseAsItem,
  onAddField,
  onHighlight,
}: {
  picked: PickedElement;
  selectorKind: SelectorKind;
  hasItemSelector: boolean;
  onUseAsItem: (selector: string) => void;
  onAddField: (field: { name: string; selector: string; type: FieldType }) => void;
  onHighlight: (selector: string) => void;
}) {
  const exact = selectorKind === "xpath" ? picked.xpath : picked.css;
  const all = selectorKind === "xpath" ? picked.xpathAll : picked.cssAll;
  const item = picked.itemCandidate;

  // Inside a list, a field selector should be relative to the item element.
  const fieldSelector = hasItemSelector && item?.relative ? item.relative : all;

  const suggestedName =
    picked.classes.find((c) => /name|title|price|date|author|img|image|link|desc/i.test(c))?.replace(/[^A-Za-z0-9]+/g, "_").toLowerCase() ||
    picked.classes[0]?.replace(/[^A-Za-z0-9]+/g, "_").toLowerCase() ||
    picked.tag;

  return (
    <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
            <Crosshair className="size-3.5" />
            Selected element
          </p>
          <p className="mt-1 truncate font-mono text-xs text-slate-600 dark:text-slate-300">
            &lt;{picked.tag}&gt;
            {picked.classes.length > 0 ? `.${picked.classes.slice(0, 3).join(".")}` : ""}
          </p>
        </div>
        <Badge tone="brand">{picked.suggestedType}</Badge>
      </div>

      {picked.preview ? (
        <p className="line-clamp-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs break-words text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
          {picked.preview}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <SelectorRow label="This one" selector={exact} count={picked.countExact} onHighlight={onHighlight} />
        {all !== exact ? (
          <SelectorRow label="All similar" selector={all} count={picked.countAll} onHighlight={onHighlight} highlightCount />
        ) : null}
      </div>

      {item ? (
        <div className="rounded-lg border border-slate-200 bg-white/70 p-2.5 dark:border-slate-700 dark:bg-slate-900/60">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
            <Layers className="size-3.5 text-slate-400" />
            Part of a repeating list
          </p>
          <p className="mt-1 font-mono text-xs break-all text-slate-500 dark:text-slate-400">
            {item.selector} <span className="text-emerald-600 dark:text-emerald-400">· {item.count} items</span>
          </p>
          {!hasItemSelector ? (
            <Button
              size="sm"
              variant="primary"
              className="mt-2 w-full"
              onClick={() => onUseAsItem(item.selector)}
              icon={<Target className="size-3.5" />}
            >
              Use as item selector
            </Button>
          ) : (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3" /> Item selector already set
            </p>
          )}
        </div>
      ) : null}

      <Button
        size="sm"
        variant={hasItemSelector || !item ? "primary" : "secondary"}
        className="w-full"
        onClick={() => onAddField({ name: suggestedName, selector: fieldSelector, type: picked.suggestedType })}
        icon={<Plus className="size-3.5" />}
      >
        Add as field
      </Button>
    </div>
  );
}

function SelectorRow({
  label,
  selector,
  count,
  onHighlight,
  highlightCount = false,
}: {
  label: string;
  selector: string;
  count: number;
  onHighlight: (selector: string) => void;
  highlightCount?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onHighlight(selector)}
      title="Highlight in the preview"
      className="flex w-full items-center gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-left transition-colors hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-900"
    >
      <span className="w-20 shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">{selector}</code>
      <span
        className={cx(
          "shrink-0 rounded-full px-1.5 py-0.5 text-xs tabular-nums",
          highlightCount && count > 1
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        )}
      >
        {count}
      </span>
    </button>
  );
}
