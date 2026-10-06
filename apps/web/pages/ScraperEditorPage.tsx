import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { ScraperConfig } from "@shared/types.ts";
import { defaultScraperConfig } from "@shared/defaults.ts";
import { api, ApiError } from "../services/api.ts";
import { useToast } from "../hooks/useToast.tsx";
import { Button } from "../components/ui/Button.tsx";
import { ErrorState, LoadingState } from "../components/ui/States.tsx";
import { ScraperForm } from "../components/ScraperForm.tsx";

/** Create a new scraper, or edit an existing one when `scraperId` is given. */
export function ScraperEditorPage({
  scraperId,
  navigate,
}: {
  scraperId?: string;
  navigate: (to: string) => void;
}) {
  const toast = useToast();
  const [config, setConfig] = useState<ScraperConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      if (scraperId) {
        setConfig(await api.getScraper(scraperId));
        return;
      }
      // A new scraper starts from the user's saved defaults.
      const settings = await api.getSettings().catch(() => undefined);
      setConfig(defaultScraperConfig(settings));
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : String(error));
    }
  }, [scraperId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(async (): Promise<string | null> => {
    if (!config) return null;
    try {
      const saved = scraperId
        ? await api.updateScraper(scraperId, config)
        : await api.createScraper(config);
      setConfig(saved);
      return saved.id;
    } catch (error) {
      toast.error("Could not save the scraper", error instanceof ApiError ? error.message : String(error));
      return null;
    }
  }, [config, scraperId, toast]);

  const save = useCallback(async () => {
    setSaving(true);
    const id = await persist();
    setSaving(false);
    if (!id) return;
    toast.success("Scraper saved", config?.name);
    if (!scraperId) navigate(`scrapers/${id}`);
  }, [persist, toast, config?.name, scraperId, navigate]);

  const saveAndRun = useCallback(async () => {
    setRunning(true);
    const id = await persist();
    if (!id) {
      setRunning(false);
      return;
    }
    try {
      const { run } = await api.startScraper(id);
      toast.success("Scraping started", run.url);
      navigate(`results/${run.id}`);
    } catch (error) {
      toast.error("Could not start the scraper", error instanceof ApiError ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  }, [persist, toast, navigate]);

  const runTest = useCallback(async () => {
    setTesting(true);
    const id = await persist();
    if (!id) {
      setTesting(false);
      return;
    }
    try {
      // A test run is capped at five records and always leaves a selector
      // report behind, so a bad configuration explains itself.
      const { run } = await api.testScraper(id, 5);
      toast.info("Test run started", "Capped at 5 records.");
      navigate(`results/${run.id}`);
    } catch (error) {
      toast.error("Could not start the test run", error instanceof ApiError ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }, [persist, toast, navigate]);

  if (loadError) return <ErrorState message={loadError} onRetry={() => void load()} />;
  if (!config) return <LoadingState label="Loading configuration…" />;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("scrapers")} icon={<ArrowLeft className="size-4" />}>
        Back to scrapers
      </Button>

      <ScraperForm
        value={config}
        onChange={setConfig}
        onSave={() => void save()}
        onRun={() => void saveAndRun()}
        onTest={() => void runTest()}
        saving={saving}
        running={running}
        testing={testing}
        saveLabel={scraperId ? "Save changes" : "Save scraper"}
      />
    </div>
  );
}
