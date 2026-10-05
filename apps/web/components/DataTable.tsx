import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Eye,
  Filter,
  Search,
  X,
} from "lucide-react";
import type { ResultRow } from "@shared/types.ts";
import { cx } from "../services/cx.ts";
import { Button } from "./ui/Button.tsx";
import { Dropdown, DropdownLabel, DropdownSeparator } from "./ui/Dropdown.tsx";
import { Input, Select } from "./ui/Field.tsx";
import { EmptyState, LoadingState } from "./ui/States.tsx";
import { Modal } from "./ui/Modal.tsx";
import { Badge } from "./ui/Badge.tsx";

type SortDirection = "asc" | "desc";

export interface DataTableProps {
  rows: ResultRow[];
  columns: string[];
  loading?: boolean;
  /** Server-side paging info. Omit for a fully client-side table. */
  total: number;
  page: number;
  pageSize: number;
  search: string;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onCopyAll?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(cellToText).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const isUrl = (value: string): boolean => /^https?:\/\//i.test(value);
const isImageUrl = (value: string): boolean => isUrl(value) && /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(value);

/**
 * Results table: server-driven search and paging, client-side sorting and
 * per-column filters over the current page, column visibility, row copy and a
 * detail dialog.
 */
export function DataTable({
  rows,
  columns,
  loading = false,
  total,
  page,
  pageSize,
  search,
  onSearchChange,
  onPageChange,
  onPageSizeChange,
  onCopyAll,
  emptyTitle = "No results yet",
  emptyDescription = "Run a scraper to collect data.",
}: DataTableProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ column: string; direction: SortDirection } | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<ResultRow | null>(null);
  const [searchDraft, setSearchDraft] = useState(search);

  useEffect(() => setSearchDraft(search), [search]);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    if (searchDraft === search) return;
    const timer = setTimeout(() => onSearchChange(searchDraft), 300);
    return () => clearTimeout(timer);
  }, [searchDraft, search, onSearchChange]);

  const visibleColumns = useMemo(() => columns.filter((column) => !hidden.has(column)), [columns, hidden]);
  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, value]) => value.trim() !== ""),
    [filters],
  );

  const displayRows = useMemo(() => {
    let output = rows;

    if (activeFilters.length > 0) {
      output = output.filter((row) =>
        activeFilters.every(([column, needle]) =>
          cellToText(row.data?.[column]).toLowerCase().includes(needle.trim().toLowerCase()),
        ),
      );
    }

    if (sort) {
      const factor = sort.direction === "asc" ? 1 : -1;
      output = [...output].sort((left, right) => {
        const a = cellToText(left.data?.[sort.column]);
        const b = cellToText(right.data?.[sort.column]);
        const numA = Number.parseFloat(a.replace(/[^0-9.-]/g, ""));
        const numB = Number.parseFloat(b.replace(/[^0-9.-]/g, ""));
        // Prices and counts should sort numerically even with currency symbols.
        if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return (numA - numB) * factor;
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }) * factor;
      });
    }

    return output;
  }, [rows, activeFilters, sort]);

  const toggleSort = (column: string) => {
    setSort((current) => {
      if (current?.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  };

  const copyRow = async (row: ResultRow) => {
    await navigator.clipboard.writeText(JSON.stringify(row.data, null, 2));
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(total, page * pageSize);

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search all data…"
            className="pl-9"
            aria-label="Search results"
          />
          {searchDraft ? (
            <button
              type="button"
              onClick={() => setSearchDraft("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <Button
          size="sm"
          variant={filtersOpen || activeFilters.length > 0 ? "primary" : "secondary"}
          onClick={() => setFiltersOpen((value) => !value)}
          icon={<Filter className="size-3.5" />}
        >
          Filter{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
        </Button>

        <Dropdown
          closeOnSelect={false}
          trigger={({ toggle }) => (
            <Button size="sm" onClick={toggle} icon={<Columns3 className="size-3.5" />}>
              Columns
            </Button>
          )}
        >
          <DropdownLabel>Visible columns</DropdownLabel>
          <div className="max-h-64 overflow-y-auto">
            {columns.map((column) => (
              <label
                key={column}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={!hidden.has(column)}
                  onChange={() =>
                    setHidden((current) => {
                      const next = new Set(current);
                      if (next.has(column)) next.delete(column);
                      else next.add(column);
                      return next;
                    })
                  }
                  className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
                />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{column}</span>
              </label>
            ))}
          </div>
          {hidden.size > 0 ? (
            <>
              <DropdownSeparator />
              <button
                type="button"
                onClick={() => setHidden(new Set())}
                className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-brand-600 hover:bg-slate-100 dark:text-brand-400 dark:hover:bg-slate-800"
              >
                Show all columns
              </button>
            </>
          ) : null}
        </Dropdown>

        {onCopyAll ? (
          <Button size="sm" onClick={onCopyAll} icon={<Copy className="size-3.5" />}>
            Copy page
          </Button>
        ) : null}
      </div>

      {/* Per-column filters */}
      {filtersOpen && columns.length > 0 ? (
        <div className="grid gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800 dark:bg-slate-950/40">
          {visibleColumns.map((column) => (
            <label key={column} className="block">
              <span className="mb-1 block truncate font-mono text-xs text-slate-500 dark:text-slate-400">{column}</span>
              <Input
                value={filters[column] ?? ""}
                onChange={(event) => setFilters((current) => ({ ...current, [column]: event.target.value }))}
                placeholder="contains…"
                className="h-8 text-xs"
              />
            </label>
          ))}
          {activeFilters.length > 0 ? (
            <div className="flex items-end">
              <Button size="sm" variant="ghost" onClick={() => setFilters({})} icon={<X className="size-3.5" />}>
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Table */}
      {loading ? (
        <LoadingState label="Loading results…" />
      ) : displayRows.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? emptyTitle : "No rows match your filters"}
          description={rows.length === 0 ? emptyDescription : "Try relaxing the search or column filters."}
          action={
            rows.length > 0 ? (
              <Button
                size="sm"
                onClick={() => {
                  setFilters({});
                  setSearchDraft("");
                  onSearchChange("");
                }}
              >
                Reset filters
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950/40">
              <tr>
                <th className="w-12 px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">#</th>
                {visibleColumns.map((column) => {
                  const isSorted = sort?.column === column;
                  return (
                    <th key={column} className="px-4 py-2.5 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="group inline-flex max-w-[22rem] items-center gap-1.5 font-mono text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                      >
                        <span className="truncate">{column}</span>
                        {isSorted ? (
                          sort.direction === "asc" ? (
                            <ArrowUp className="size-3 shrink-0 text-brand-600 dark:text-brand-400" />
                          ) : (
                            <ArrowDown className="size-3 shrink-0 text-brand-600 dark:text-brand-400" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 shrink-0 text-slate-300 group-hover:text-slate-400 dark:text-slate-600" />
                        )}
                      </button>
                    </th>
                  );
                })}
                <th className="w-24 px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayRows.map((row, index) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                    {(page - 1) * pageSize + index + 1}
                  </td>
                  {visibleColumns.map((column) => (
                    <td key={column} className="max-w-[22rem] px-4 py-2.5 align-top">
                      <Cell value={row.data?.[column]} />
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" onClick={() => setDetail(row)} aria-label="Preview row">
                      <Eye className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => void copyRow(row)} aria-label="Copy row as JSON">
                      <Copy className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {total === 0 ? "No rows" : `${firstRow}–${lastRow} of ${total.toLocaleString()}`}
          {activeFilters.length > 0 ? ` · ${displayRows.length} shown after filters` : ""}
        </p>

        <div className="flex items-center gap-2">
          <Select
            className="h-8 w-auto py-0 text-xs"
            value={String(pageSize)}
            onChange={(event) => onPageSizeChange(Number.parseInt(event.target.value, 10))}
            aria-label="Rows per page"
            options={[25, 50, 100, 250].map((size) => ({ value: String(size), label: `${size} / page` }))}
          />
          <Button
            size="icon"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {page} / {totalPages}
          </span>
          <Button
            size="icon"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <RowDetailModal row={detail} columns={columns} onClose={() => setDetail(null)} onCopy={copyRow} />
    </div>
  );
}

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-xs text-slate-300 italic dark:text-slate-600">empty</span>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.slice(0, 4).map((entry, index) => (
          <Badge key={index} tone="neutral" className="max-w-[12rem]">
            <span className="truncate">{cellToText(entry)}</span>
          </Badge>
        ))}
        {value.length > 4 ? <Badge tone="brand">+{value.length - 4}</Badge> : null}
      </div>
    );
  }

  const text = cellToText(value);

  if (isImageUrl(text)) {
    return (
      <a href={text} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2">
        <img
          src={text}
          alt=""
          loading="lazy"
          className="size-10 shrink-0 rounded-md border border-slate-200 bg-slate-50 object-cover dark:border-slate-700 dark:bg-slate-800"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
        <span className="max-w-[12rem] truncate font-mono text-xs text-brand-600 dark:text-brand-400">{text}</span>
      </a>
    );
  }

  if (isUrl(text)) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noreferrer noopener"
        className="block max-w-full truncate font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
        title={text}
      >
        {text}
      </a>
    );
  }

  return (
    <span className="line-clamp-3 break-words text-slate-700 dark:text-slate-300" title={text}>
      {text}
    </span>
  );
}

function RowDetailModal({
  row,
  columns,
  onClose,
  onCopy,
}: {
  row: ResultRow | null;
  columns: string[];
  onClose: () => void;
  onCopy: (row: ResultRow) => Promise<void>;
}) {
  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title="Row detail"
      description={row ? `Page ${row.pageNumber} · position ${row.position + 1}` : undefined}
      size="lg"
      footer={
        <>
          {row ? (
            <Button onClick={() => void onCopy(row)} icon={<Copy className="size-4" />}>
              Copy JSON
            </Button>
          ) : null}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {row ? (
        <div className="space-y-3">
          <dl className="divide-y divide-slate-100 dark:divide-slate-800">
            {columns.map((column) => (
              <div key={column} className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <dt className="font-mono text-xs text-slate-500 dark:text-slate-400">{column}</dt>
                <dd className="min-w-0 text-sm break-words text-slate-800 dark:text-slate-200">
                  <Cell value={row.data?.[column]} />
                </dd>
              </div>
            ))}
          </dl>

          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/50">
            <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Source</p>
            <a
              href={row.pageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-xs break-all text-brand-600 hover:underline dark:text-brand-400"
            >
              {row.pageUrl}
            </a>
          </div>

          <details className="rounded-lg border border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Raw JSON
            </summary>
            <pre className="overflow-x-auto border-t border-slate-200 px-3 py-2 font-mono text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
              {JSON.stringify(row.data, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </Modal>
  );
}

export { cellToText };
