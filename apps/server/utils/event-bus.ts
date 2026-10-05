import type { ScraperEvent } from "@shared/types.ts";

type Listener = (event: ScraperEvent) => void;

/**
 * Tiny in-process pub/sub that carries scraper progress from the engine to any
 * open SSE connection. Subscribers can filter by run id.
 */
class EventBus {
  #listeners = new Set<{ runId: string | null; listener: Listener }>();

  subscribe(listener: Listener, runId: string | null = null): () => void {
    const entry = { runId, listener };
    this.#listeners.add(entry);
    return () => this.#listeners.delete(entry);
  }

  emit(event: ScraperEvent): void {
    for (const { runId, listener } of this.#listeners) {
      if (runId !== null && runId !== event.runId) continue;
      try {
        listener(event);
      } catch (error) {
        console.error("[events] listener failed:", error);
      }
    }
  }

  get subscriberCount(): number {
    return this.#listeners.size;
  }
}

export const eventBus = new EventBus();
