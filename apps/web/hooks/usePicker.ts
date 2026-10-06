import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldConfig, PickedElement, SelectorKind } from "@shared/types.ts";

interface PickerMessage {
  source?: string;
  type: string;
  [key: string]: unknown;
}

export interface PickerPreviewResult {
  rows: Record<string, unknown>[];
  itemCount: number;
  error: string | null;
}

/**
 * Drives the element picker running inside the snapshot iframe.
 *
 * The snapshot is served from our own origin, so the two frames can talk over
 * `postMessage`. Everything the picker reports — selectors, match counts,
 * preview rows — is computed in the frame against the real DOM, which is why
 * feedback is instant and needs no extra page load.
 */
export function usePicker(frameRef: React.RefObject<HTMLIFrameElement | null>) {
  const [ready, setReady] = useState(false);
  const [picked, setPicked] = useState<PickedElement | null>(null);
  const [pickMode, setPickMode] = useState(true);

  // Requests are correlated by id so overlapping calls cannot cross wires.
  const pending = useRef(new Map<string, (value: never) => void>());
  const requestId = useRef(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent<PickerMessage>) => {
      const data = event.data;
      if (!data || data.source !== "aksa-picker") return;

      if (data.type === "ready") {
        setReady(true);
        return;
      }
      if (data.type === "picked") {
        setPicked(data.element as PickedElement);
        return;
      }

      const id = data.requestId as string | undefined;
      if (!id) return;
      const resolve = pending.current.get(id);
      if (!resolve) return;
      pending.current.delete(id);
      resolve(data as never);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const send = useCallback(
    (message: Record<string, unknown>) => {
      frameRef.current?.contentWindow?.postMessage({ target: "aksa-picker", ...message }, "*");
    },
    [frameRef],
  );

  /** Send a message and wait for the reply carrying the same request id. */
  const request = useCallback(
    <T,>(message: Record<string, unknown>, timeoutMs = 8000): Promise<T> => {
      const id = `r${requestId.current++}`;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.current.delete(id);
          reject(new Error("The preview did not respond"));
        }, timeoutMs);

        pending.current.set(id, ((value: T) => {
          clearTimeout(timer);
          resolve(value);
        }) as (value: never) => void);

        send({ ...message, requestId: id });
      });
    },
    [send],
  );

  const reset = useCallback(() => {
    setReady(false);
    setPicked(null);
    pending.current.clear();
  }, []);

  const setHover = useCallback(
    (enabled: boolean) => {
      setPickMode(enabled);
      send({ type: "set-hover", enabled });
    },
    [send],
  );

  /** Outline every element a selector matches, and report how many there are. */
  const highlight = useCallback(
    (selector: string, kind: SelectorKind = "css") =>
      request<{ count: number; error: string | null }>({ type: "highlight", selector, kind }),
    [request],
  );

  const clearHighlight = useCallback(() => send({ type: "clear-highlight" }), [send]);

  /** Resolve a full field plan against the snapshot, for instant feedback. */
  const preview = useCallback(
    (plan: { itemSelector: string; itemSelectorKind: SelectorKind; fields: FieldConfig[]; limit?: number }) =>
      request<PickerPreviewResult & { rows: Record<string, unknown>[] }>({
        type: "preview",
        itemSelector: plan.itemSelector,
        itemKind: plan.itemSelectorKind,
        fields: plan.fields,
        limit: plan.limit ?? 10,
      }),
    [request],
  );

  return { ready, picked, setPicked, pickMode, setHover, highlight, clearHighlight, preview, reset };
}
