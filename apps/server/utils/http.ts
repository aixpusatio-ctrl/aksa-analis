import { HttpError, errorMessage } from "./errors.ts";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.message, details: error.details }, { status: error.status });
  }
  console.error("[api] unhandled error:", error);
  return json({ error: errorMessage(error) }, { status: 500 });
}

/**
 * A request with its path parameters resolved.
 *
 * Declared as a concrete shape rather than an index signature so `params.id`
 * types as `string` under `noUncheckedIndexedAccess`.
 */
export type RouteRequest<P = { id: string }> = Request & { params: P };

/** Wrap a handler so thrown `HttpError`s become proper HTTP responses. */
export function handler<P = { id: string }>(fn: (req: RouteRequest<P>) => Response | Promise<Response>) {
  return async (req: Bun.BunRequest<string>): Promise<Response> => {
    try {
      return await fn(req as unknown as RouteRequest<P>);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Parse a JSON body, tolerating an empty one. */
export async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Request body is not valid JSON");
  }
}

export function searchParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

export function intParam(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export function boolParam(params: URLSearchParams, key: string): boolean | undefined {
  const raw = params.get(key);
  if (raw === null) return undefined;
  return raw === "1" || raw.toLowerCase() === "true";
}
