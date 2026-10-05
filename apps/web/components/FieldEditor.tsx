import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import type { FieldConfig, FieldType, SelectorKind } from "@shared/types.ts";
import { emptyField } from "@shared/defaults.ts";
import { Button } from "./ui/Button.tsx";
import { Input, Select } from "./ui/Field.tsx";
import { EmptyState } from "./ui/States.tsx";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "link", label: "Link (href)" },
  { value: "image", label: "Image (src)" },
  { value: "title", label: "Title" },
  { value: "attribute", label: "Attribute" },
  { value: "html", label: "Inner HTML" },
];

const SELECTOR_KINDS: { value: SelectorKind; label: string }[] = [
  { value: "css", label: "CSS" },
  { value: "xpath", label: "XPath" },
];

/**
 * Editor for the list of output columns. Each row maps one selector to one
 * field name, which is exactly the mental model in the docs:
 *
 *   name  → .product-name
 *   price → .product-price
 *   image → img → src
 */
export function FieldEditor({
  fields,
  onChange,
  disabled = false,
}: {
  fields: FieldConfig[];
  onChange: (fields: FieldConfig[]) => void;
  disabled?: boolean;
}) {
  const update = (id: string, patch: Partial<FieldConfig>) =>
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));

  const remove = (id: string) => onChange(fields.filter((field) => field.id !== id));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    onChange(next);
  };

  if (fields.length === 0) {
    return (
      <EmptyState
        title="No fields yet"
        description="Add one field per column you want in the results."
        action={
          <Button variant="primary" size="sm" onClick={() => onChange([emptyField()])} icon={<Plus className="size-4" />}>
            Add field
          </Button>
        }
        className="rounded-xl border border-dashed border-slate-300 py-10 dark:border-slate-700"
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {fields.map((field, index) => (
        <div
          key={field.id}
          className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40"
        >
          <div className="flex items-start gap-2">
            <div className="flex shrink-0 flex-col items-center gap-0.5 pt-1.5">
              <GripVertical className="size-4 text-slate-300 dark:text-slate-600" aria-hidden />
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={disabled || index === 0}
                aria-label="Move field up"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={disabled || index === fields.length - 1}
                aria-label="Move field down"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </div>

            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Field name</label>
                <Input
                  value={field.name}
                  onChange={(event) => update(field.id, { name: event.target.value })}
                  placeholder="price"
                  disabled={disabled}
                  className="h-9 font-mono text-xs"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Selector <span className="font-normal text-slate-400">(relative to item)</span>
                </label>
                <Input
                  value={field.selector}
                  onChange={(event) => update(field.id, { selector: event.target.value })}
                  placeholder=".product-price"
                  disabled={disabled}
                  className="h-9 font-mono text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Syntax</label>
                <Select
                  value={field.selectorKind}
                  onChange={(event) => update(field.id, { selectorKind: event.target.value as SelectorKind })}
                  disabled={disabled}
                  className="h-9 text-xs"
                  options={SELECTOR_KINDS}
                />
              </div>

              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Extract</label>
                <Select
                  value={field.type}
                  onChange={(event) => update(field.id, { type: event.target.value as FieldType })}
                  disabled={disabled}
                  className="h-9 text-xs"
                  options={FIELD_TYPES}
                />
              </div>

              {field.type === "attribute" ? (
                <div className="sm:col-span-4">
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Attribute name
                  </label>
                  <Input
                    value={field.attribute ?? ""}
                    onChange={(event) => update(field.id, { attribute: event.target.value })}
                    placeholder="data-id"
                    disabled={disabled}
                    className="h-9 font-mono text-xs"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 sm:col-span-12">
                <CompactSwitch
                  checked={field.multiple ?? false}
                  onChange={(value) => update(field.id, { multiple: value })}
                  disabled={disabled}
                  label="Collect all matches"
                />
                <CompactSwitch
                  checked={field.trim !== false}
                  onChange={(value) => update(field.id, { trim: value })}
                  disabled={disabled}
                  label="Trim whitespace"
                />
                <CompactSwitch
                  checked={field.required ?? false}
                  onChange={(value) => update(field.id, { required: value })}
                  disabled={disabled}
                  label="Required"
                />
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => remove(field.id)}
              disabled={disabled || fields.length === 1}
              aria-label={`Remove field ${field.name || index + 1}`}
              className="mt-5 shrink-0 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}

      <Button
        size="sm"
        onClick={() => onChange([...fields, emptyField()])}
        disabled={disabled}
        icon={<Plus className="size-4" />}
      >
        Add field
      </Button>
    </div>
  );
}

function CompactSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600 select-none dark:text-slate-400">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
      />
      {label}
    </label>
  );
}
