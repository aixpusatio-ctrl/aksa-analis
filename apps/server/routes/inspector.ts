import type { FieldConfig, SelectorKind, WaitUntil } from "@shared/types.ts";
import { handler, json, readJson } from "../utils/http.ts";
import { badRequest } from "../utils/errors.ts";
import { oneOf } from "../utils/validate.ts";
import {
  autoDetect,
  createSnapshot,
  getSnapshot,
  previewExtraction,
  snapshotResponse,
  testSelector,
  type OpenOptions,
} from "../inspector/service.ts";

interface BaseBody {
  url?: string;
  userAgent?: string;
  timeoutMs?: number;
  waitUntil?: WaitUntil;
  waitForSelector?: string;
}

const WAIT_UNTIL = ["load", "domcontentloaded", "networkidle", "commit"] as const;

/** Shared shape of every inspector request: where to look, and how long to wait. */
function openOptions(body: BaseBody): OpenOptions {
  const url = (body.url ?? "").trim();
  if (!url) throw badRequest("A URL is required");

  return {
    url,
    userAgent: body.userAgent?.trim() || undefined,
    timeoutMs: body.timeoutMs,
    waitUntil: oneOf(body.waitUntil, WAIT_UNTIL, "domcontentloaded"),
    waitForSelector: body.waitForSelector?.trim() || undefined,
  };
}

export const inspectorRoutes = {
  /** Render a page and keep an inert copy the dashboard can iframe. */
  "/api/inspector/snapshots": {
    POST: handler(async (req) => {
      const body = await readJson<BaseBody>(req);
      const snapshot = await createSnapshot(openOptions(body));
      return json(
        {
          id: snapshot.id,
          url: snapshot.url,
          title: snapshot.title,
          elementCount: snapshot.elementCount,
          robotsAllowed: snapshot.robotsAllowed,
          createdAt: snapshot.createdAt,
          pageUrl: `/api/inspector/snapshots/${snapshot.id}/page`,
        },
        { status: 201 },
      );
    }),
  },

  "/api/inspector/snapshots/:id": {
    GET: handler((req) => {
      const snapshot = getSnapshot(req.params.id);
      const { storageKey, ...rest } = snapshot;
      return json({ ...rest, pageUrl: `/api/inspector/snapshots/${snapshot.id}/page` });
    }),
  },

  /** The snapshot itself, served same-origin under a strict CSP. */
  "/api/inspector/snapshots/:id/page": {
    GET: handler((req) => snapshotResponse(req.params.id)),
  },

  "/api/inspector/test-selector": {
    POST: handler(async (req) => {
      const body = await readJson<BaseBody & { selector?: string; selectorKind?: SelectorKind }>(req);
      const selector = (body.selector ?? "").trim();
      if (!selector) throw badRequest("A selector is required");

      return json(
        await testSelector({
          ...openOptions(body),
          selector,
          selectorKind: oneOf(body.selectorKind, ["css", "xpath"] as const, "css"),
        }),
      );
    }),
  },

  /** Run a full field plan against the live page and return the first rows. */
  "/api/inspector/preview": {
    POST: handler(async (req) => {
      const body = await readJson<
        BaseBody & {
          itemSelector?: string;
          itemSelectorKind?: SelectorKind;
          fields?: FieldConfig[];
          limit?: number;
        }
      >(req);

      const fields = Array.isArray(body.fields) ? body.fields : [];
      if (fields.length === 0) throw badRequest("At least one field is required to preview");

      return json(
        await previewExtraction({
          ...openOptions(body),
          itemSelector: (body.itemSelector ?? "").trim(),
          itemSelectorKind: oneOf(body.itemSelectorKind, ["css", "xpath"] as const, "css"),
          fields,
          limit: body.limit,
        }),
      );
    }),
  },

  /** Guess the page's repeated structure and what its parts mean. */
  "/api/inspector/detect": {
    POST: handler(async (req) => {
      const body = await readJson<BaseBody>(req);
      return json(await autoDetect(openOptions(body)));
    }),
  },
};
