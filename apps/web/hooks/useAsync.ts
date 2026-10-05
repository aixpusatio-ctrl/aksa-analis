import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../services/api.ts";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Run an async loader on mount (and whenever `deps` change), with a `reload`
 * that is safe to call from event handlers.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> & { reload: () => void; setData: (value: T) => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const mounted = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      if (mounted.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (!mounted.current) return;
      const message = error instanceof ApiError || error instanceof Error ? error.message : String(error);
      setState({ data: null, loading: false, error: message });
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void run();
  }, deps);

  return {
    ...state,
    reload: () => void run(),
    setData: (value: T) => setState({ data: value, loading: false, error: null }),
  };
}
