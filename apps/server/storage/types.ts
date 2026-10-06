/**
 * Binary/blob storage, kept behind an interface so the local-disk
 * implementation can be swapped for object storage later without touching
 * the code that writes screenshots and snapshots.
 */
export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface ArtifactStore {
  put(key: string, body: Uint8Array | string, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  /** A readable Response, so routes can stream without buffering. */
  response(key: string, contentType?: string): Promise<Response | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** Remove everything under a prefix, e.g. all artifacts of one run. */
  deletePrefix(prefix: string): Promise<number>;
}
