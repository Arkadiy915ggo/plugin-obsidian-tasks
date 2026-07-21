import type { ManagedKind, SyncManifestEntry } from "./types";

export async function writeThenCommit(
  write: () => Promise<void>,
  entries: Record<string, SyncManifestEntry>,
  key: string,
  relativePath: string,
  kind: ManagedKind,
  hash: string
): Promise<void> {
  await write();
  entries[key] = { relativePath, kind, baseHash: hash, sourceHash: hash, mirrorHash: hash, status: "active" };
}
