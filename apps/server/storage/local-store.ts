import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ArtifactStore, StoredObject } from "./types.ts";

/**
 * Artifacts on the local filesystem, under `data/artifacts` by default.
 *
 * Keys are slash-separated paths such as `runs/<runId>/page-2.png`. They come
 * from our own code rather than from user input, but they are sanitized
 * anyway so a key can never escape the root.
 */
export class LocalArtifactStore implements ArtifactStore {
  readonly #root: string;

  constructor(root = process.env.ARTIFACTS_PATH ?? "./data/artifacts") {
    this.#root = resolve(root);
  }

  #pathFor(key: string): string {
    const safe = key
      .split("/")
      .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, "_"))
      .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
      .join(sep);

    const target = resolve(join(this.#root, safe));
    if (target !== this.#root && !target.startsWith(this.#root + sep)) {
      throw new Error(`Artifact key escapes the store root: ${key}`);
    }
    return target;
  }

  async put(key: string, body: Uint8Array | string, contentType: string): Promise<StoredObject> {
    const path = this.#pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    const info = await stat(path);
    return { key, size: info.size, contentType };
  }

  async get(key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
    const file = Bun.file(this.#pathFor(key));
    if (!(await file.exists())) return null;
    return { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
  }

  async response(key: string, contentType?: string): Promise<Response | null> {
    const file = Bun.file(this.#pathFor(key));
    if (!(await file.exists())) return null;
    return new Response(file, {
      headers: {
        "content-type": contentType ?? file.type ?? "application/octet-stream",
        "cache-control": "private, max-age=3600",
      },
    });
  }

  async exists(key: string): Promise<boolean> {
    return Bun.file(this.#pathFor(key)).exists();
  }

  async delete(key: string): Promise<void> {
    await rm(this.#pathFor(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<number> {
    await rm(this.#pathFor(prefix), { recursive: true, force: true });
    return 1;
  }
}
