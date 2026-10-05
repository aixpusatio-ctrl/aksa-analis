export const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((done) => setTimeout(done, ms)) : Promise.resolve();

/**
 * Run `worker` over `items` with at most `limit` in flight, preserving the
 * order of the returned array.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  const size = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const runners = Array.from({ length: size }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await worker(items[index] as T, index);
    }
  });

  await Promise.all(runners);
  return out;
}

/**
 * Retry `fn` with exponential backoff.
 *
 * `shouldStop` lets a cancelled scrape bail out between attempts instead of
 * sitting through the remaining backoff.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: {
    retries: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (error: unknown, attempt: number, waitMs: number) => void;
    shouldStop?: () => boolean;
  },
): Promise<T> {
  const { retries, baseDelayMs = 500, maxDelayMs = 10_000, onRetry, shouldStop } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    if (shouldStop?.()) break;
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt > retries || shouldStop?.()) break;
      const waitMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      onRetry?.(error, attempt, waitMs);
      await sleep(waitMs);
    }
  }

  throw lastError;
}
