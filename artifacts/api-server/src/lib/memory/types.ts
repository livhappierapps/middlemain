/** Shapes returned by the Memory Machine API (livhappierapps/memory-machine). */
export type MemoryKind = "note" | "document" | "conversation" | "image" | "audio" | "video" | "other";

export interface Memory {
  id: string;
  kind: MemoryKind | string;
  title: string;
  body: string | null;
  sourcePath?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  occurredAt: string | null;
  createdAt: string;
}

export interface Profile {
  id?: string;
  title?: string;
  body: string | null;
  metadata: Record<string, unknown>;
  updatedAt?: string;
}

/** Source path the API uses for the per-user standing profile row. */
export const PROFILE_SOURCE_PATH = "mm://profile";
