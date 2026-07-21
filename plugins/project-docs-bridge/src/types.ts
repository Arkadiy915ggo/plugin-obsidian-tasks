export type ManagedKind = "document" | "attachment";
export type EntryStatus = "active" | "conflict" | "tombstone";

export interface AttachmentReferenceResolution {
  path?: string;
  warning?: string;
}

export interface SyncConflict {
  sourceHash: string | null;
  mirrorHash: string | null;
  createdAt: string;
  snapshotFolder: string;
  mirrorSnapshotPath?: string;
  mirrorWasTrashedForBootstrap?: boolean;
}

export interface SyncManifestEntry {
  relativePath: string;
  kind: ManagedKind;
  baseHash: string;
  sourceHash: string | null;
  mirrorHash: string | null;
  status: EntryStatus;
  conflict?: SyncConflict;
}

export interface PersistedData {
  schemaVersion: 1;
  initialized: boolean;
  settings: ProjectDocsBridgeSettings;
  entries: Record<string, SyncManifestEntry>;
  lastSuccessfulSync?: string;
}

export interface ProjectDocsBridgeSettings {
  sourceRoot: string;
  mirrorRoot: string;
  excludePatterns: string[];
  assetExtensions: string[];
  syncOnStartup: boolean;
  watchForChanges: boolean;
  debounceMs: number;
}

export type SyncStatus = "uninitialized" | "paused" | "syncing" | "synced" | "conflicts" | "error";
