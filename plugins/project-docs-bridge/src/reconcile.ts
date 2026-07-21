import type { EntryStatus } from "./types";

export type ReconcileAction = "accept" | "copy-source-to-mirror" | "copy-mirror-to-source" | "create-mirror" | "create-source" | "trash-mirror" | "quarantine-source" | "tombstone" | "conflict" | "retain-tombstone";

export interface ReconcileInput {
  baseHash: string | null;
  sourceHash: string | null;
  mirrorHash: string | null;
  status?: EntryStatus;
}

export function decideReconcile({ baseHash, sourceHash, mirrorHash, status = "active" }: ReconcileInput): ReconcileAction {
  if (status === "tombstone") {
    if (sourceHash === null && mirrorHash === null) return "retain-tombstone";
    if (sourceHash === null) return "create-source";
    if (mirrorHash === null) return "create-mirror";
    return sourceHash === mirrorHash ? "accept" : "conflict";
  }
  if (status === "conflict") return sourceHash !== null && sourceHash === mirrorHash ? "accept" : "conflict";
  if (baseHash === null) {
    if (sourceHash === null && mirrorHash === null) return "tombstone";
    if (sourceHash === null) return "create-source";
    if (mirrorHash === null) return "create-mirror";
    return sourceHash === mirrorHash ? "accept" : "conflict";
  }
  if (sourceHash === null && mirrorHash === null) return "tombstone";
  if (sourceHash === null) return mirrorHash === baseHash ? "trash-mirror" : "conflict";
  if (mirrorHash === null) return sourceHash === baseHash ? "quarantine-source" : "conflict";
  if (sourceHash === mirrorHash) return "accept";
  if (sourceHash === baseHash) return "copy-mirror-to-source";
  if (mirrorHash === baseHash) return "copy-source-to-mirror";
  return "conflict";
}
