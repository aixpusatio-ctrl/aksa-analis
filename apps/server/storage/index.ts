import { LocalArtifactStore } from "./local-store.ts";
import type { ArtifactStore } from "./types.ts";

/**
 * The process-wide artifact store. Swapping in S3 or another backend means
 * returning a different implementation here; nothing else needs to change.
 */
export const artifactStore: ArtifactStore = new LocalArtifactStore();

export type { ArtifactStore, StoredObject } from "./types.ts";
export { LocalArtifactStore } from "./local-store.ts";
