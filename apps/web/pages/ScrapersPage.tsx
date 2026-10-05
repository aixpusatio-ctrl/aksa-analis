import { useCallback, useState } from "react";
import { Copy, MoreVertical, Pencil, Play, Plus, Trash2, Workflow } from "lucide-react";
import type { Scraper } from "@shared/types.ts";
import { api, ApiError } from "../services/api.ts";
import { useAsync } from "../hooks/useAsync.ts";
import { useToast } from "../hooks/useToast.tsx";
import { Button } from "../components/ui/Button.tsx";
import { Card } from "../components/ui/Card.tsx";
import { Badge } from "../components/ui/Badge.tsx";
import { Dropdown, DropdownItem, DropdownSeparator } from "../components/ui/Dropdown.tsx";
import { ConfirmModal } from "../components/ui/Modal.tsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.tsx";
import { Input } from "../components/ui/Field.tsx";

export function ScrapersPage({ navigate }: { navigate: (to: string) => void }) {
  const toast = useToast();
  const scrapers = useAsync<Scraper[]>(() => api.listScrapers(), []);
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Scraper | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const start = useCallback(
    async (scraper: Scraper) => {
      setBusy(scraper.id);
      try {
        const { run } = await api.startScraper(scraper.id);
        toast.success("Scraping started", scraper.name);
        navigate(`results/${run.id}`);
      } catch (error) {
        toast.error("Could not start the scraper", error instanceof ApiError ? error.message : String(error));
      } finally {
        setBusy(null);
      }
    },
    [toast, navigate],
  );

  const duplicate = useCallback(
    async (scraper: Scraper) => {
      try {
        await api.duplicateScraper(scraper.id);
        toast.success("Scraper duplicated");
        scrapers.reload();
      } catch (error) {
        toast.error("Could not duplicate", error instanceof ApiError ? error.message : String(error));
      }
    },
    [toast, scrapers],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setBusy(pendingDelete.id);
    try {
      await api.deleteScraper(pendingDelete.id);
      toast.success("Scraper deleted", pendingDelete.name);
      setPendingDelete(null);
      scrapers.reload();
    } catch (error) {
      toast.error("Could not delete", error instanceof ApiError ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [pendingDelete, toast, scrapers]);

  if (scrapers.loading) return <LoadingState label="Loading scrapers…" />;
  if (scrapers.error) return <ErrorState message={scrapers.error} onRetry={scrapers.reload} />;

  const all = scrapers.data ?? [];
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? all.filter((scraper) => `${scraper.name} ${scraper.url}`.toLowerCase().includes(needle))
    : all;

  if (all.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Workflow className="size-6" />}
          title="No scrapers yet"
          description="A scraper is a saved recipe: a URL, the element that repeats, and the fields to pull out of it."
          action={
            <Button variant="primary" onClick={() => navigate("new")} icon={<Plus className="size-4" />}>
              Create your first scraper
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search scrapers…"
          className="max-w-xs"
          aria-label="Search scrapers"
        />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {visible.length} of {all.length}
        </span>
        <Button variant="primary" className="ml-auto" onClick={() => navigate("new")} icon={<Plus className="size-4" />}>
          New scraper
        </Button>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState title="No scrapers match your search" description={`Nothing found for “${search}”.`} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((scraper) => (
            <Card key={scraper.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2 px-5 pt-4">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{scraper.name}</h3>
                  <a
                    href={scraper.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-0.5 block truncate font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                    title={scraper.url}
                  >
                    {scraper.url}
                  </a>
                </div>
                <Dropdown
                  trigger={({ toggle }) => (
                    <Button variant="ghost" size="icon" onClick={toggle} aria-label={`Actions for ${scraper.name}`}>
                      <MoreVertical className="size-4" />
                    </Button>
                  )}
                >
                  <DropdownItem icon={<Play className="size-4" />} onClick={() => void start(scraper)}>
                    Start scraping
                  </DropdownItem>
                  <DropdownItem icon={<Pencil className="size-4" />} onClick={() => navigate(`scrapers/${scraper.id}`)}>
                    Edit
                  </DropdownItem>
                  <DropdownItem icon={<Copy className="size-4" />} onClick={() => void duplicate(scraper)}>
                    Duplicate
                  </DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem icon={<Trash2 className="size-4" />} destructive onClick={() => setPendingDelete(scraper)}>
                    Delete
                  </DropdownItem>
                </Dropdown>
              </div>

              <div className="flex-1 px-5 py-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="brand">{scraper.fields.length} field{scraper.fields.length === 1 ? "" : "s"}</Badge>
                  <Badge tone="neutral">{scraper.pagination.mode}</Badge>
                  <Badge tone="neutral">max {scraper.maxPages}p</Badge>
                  <Badge tone="neutral">{scraper.requestDelayMs}ms delay</Badge>
                  {scraper.respectRobotsTxt ? <Badge tone="success">robots.txt</Badge> : <Badge tone="warning">robots off</Badge>}
                </div>
                <p className="mt-3 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                  {scraper.itemSelector || "— whole page —"}
                </p>
                <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">
                  {scraper.fields.map((field) => field.name).join(" · ")}
                </p>
              </div>

              <div className="flex gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  onClick={() => void start(scraper)}
                  loading={busy === scraper.id}
                  icon={<Play className="size-3.5" />}
                >
                  Start
                </Button>
                <Button size="sm" onClick={() => navigate(`scrapers/${scraper.id}`)} icon={<Pencil className="size-3.5" />}>
                  Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this scraper?"
        message={
          <>
            <strong>{pendingDelete?.name}</strong> will be removed. Past runs and their results stay in History.
          </>
        }
        confirmLabel="Delete scraper"
        destructive
        loading={busy === pendingDelete?.id}
      />
    </div>
  );
}
