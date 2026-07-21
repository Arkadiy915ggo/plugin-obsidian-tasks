import * as path from "node:path";
import chokidar from "chokidar";
import { TFile, Vault, type EventRef } from "obsidian";
import { extractLocalReferences, resolveLocalReference } from "./asset-references";
import { findCaseCollisions, isIgnored, manifestKey, mirrorRelative, sourceRelative, type PathPolicy } from "./path-policy";
import { decideReconcile, type ReconcileAction } from "./reconcile";
import { ExpectedHashSuppressor, ReconcileQueue } from "./reconcile-queue";
import { fileKind, sha256, SourceStore, type SourceFile } from "./source-store";
import { writeThenCommit } from "./sync-write";
import type { ManagedKind, ProjectDocsBridgeSettings, SyncManifestEntry, SyncStatus } from "./types";
import { VaultStore } from "./vault-store";

type LogLevel = "info" | "warn" | "error";

export interface SyncEngineOptions {
  vault: Vault;
  vaultStore: VaultStore;
  sourceStore: SourceStore;
  policy: PathPolicy;
  settings: () => ProjectDocsBridgeSettings;
  entries: Record<string, SyncManifestEntry>;
  onStateChange: () => Promise<void>;
  onSuccessfulSync?: () => Promise<void>;
  onStatus: (status: SyncStatus, conflicts: number) => void;
  onLog?: (level: LogLevel, message: string) => void;
}

export class SyncEngine {
  readonly entries: Record<string, SyncManifestEntry>;
  private readonly sourceExpected = new ExpectedHashSuppressor();
  private readonly mirrorExpected = new ExpectedHashSuppressor();
  private readonly queue: ReconcileQueue;
  private sourceWatcher: { close(): void | Promise<void> } | null = null;
  private vaultEvents: EventRef[] = [];
  private paused = false;
  private initialized = false;
  private initializing: Promise<void> | null = null;

  constructor(private readonly options: SyncEngineOptions) {
    this.entries = options.entries;
    this.queue = new ReconcileQueue(
      () => this.options.settings().debounceMs,
      async () => { await this.reconcile(); },
      (error) => this.log("error", `queued reconcile failed: ${error instanceof Error ? error.message : String(error)}`)
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = this.initializeInternal();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async initializeInternal(): Promise<void> {
    this.options.onStatus("syncing", this.conflictCount());
    const source = await this.sourceInventory();
    const mirror = await this.mirrorInventory();
    const paths = new Set([...source.keys(), ...mirror.keys()]);
    for (const relativePath of paths) {
      const sourceFile = source.get(relativePath);
      const mirrorFile = mirror.get(relativePath);
      if (!sourceFile && mirrorFile) {
        // A mirror-only file may be stale data delivered by Obsidian Sync. Preserve it
        // as an unresolved conflict instead of creating a source file during bootstrap.
        await this.createConflict(relativePath, mirrorFile.kind, null, mirrorFile.hash);
        const conflict = this.entry(relativePath)?.conflict;
        if (conflict) conflict.mirrorWasTrashedForBootstrap = true;
        await this.options.vaultStore.trash(relativePath);
      } else {
        await this.reconcilePath(relativePath, sourceFile, mirrorFile);
      }
    }
    this.initialized = true;
    await this.persist();
    this.options.onStatus(this.conflictCount() ? "conflicts" : "synced", this.conflictCount());
  }

  async reconcile(): Promise<boolean> {
    if (this.paused || !this.initialized) return false;
    this.options.onStatus("syncing", this.conflictCount());
    try {
      const source = await this.sourceInventory();
      const mirror = await this.mirrorInventory();
      await this.reconcileRenames(source, mirror);
      const paths = new Set([...Object.values(this.entries).map((entry) => entry.relativePath), ...source.keys(), ...mirror.keys()]);
      for (const relativePath of paths) {
        if (this.paused) break;
        await this.reconcilePath(relativePath, source.get(relativePath), mirror.get(relativePath));
      }
      await this.persist();
      if (this.paused) {
        this.options.onStatus("paused", this.conflictCount());
        return false;
      }
      await this.options.onSuccessfulSync?.();
      this.options.onStatus(this.conflictCount() ? "conflicts" : "synced", this.conflictCount());
      return true;
    } catch (error) {
      this.log("error", `reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
      this.options.onStatus("error", this.conflictCount());
      throw error;
    }
  }

  start(): void {
    if (this.sourceWatcher || this.vaultEvents.length || !this.options.settings().watchForChanges) return;
    const onSourceEvent = (filename?: string | Buffer): void => {
      if (!filename) return this.queue.request();
      const absolute = path.resolve(this.options.policy.sourceRoot, filename.toString());
      const relative = sourceRelative(this.options.policy, absolute);
      if (!relative) {
        if (path.resolve(absolute) === path.resolve(this.options.policy.sourceRoot)) this.queue.request();
        return;
      }
      void this.options.sourceStore.hash(relative).then((hash) => {
        if (!this.sourceExpected.consume(relative, hash)) this.queue.request();
      }).catch(() => this.queue.request());
    };
    this.sourceWatcher = chokidar.watch(this.options.policy.sourceRoot, {
      ignoreInitial: true,
      followSymlinks: false,
      ignored: (absolutePath: string) => {
        const relative = sourceRelative(this.options.policy, absolutePath);
        return relative === null || isIgnored(relative, this.options.settings().excludePatterns);
      }
    }).on("all", (_event: string, filename: string) => onSourceEvent(filename));
    this.vaultEvents = [
      this.options.vault.on("create", (file) => this.onVaultFile(file)),
      this.options.vault.on("modify", (file) => this.onVaultFile(file)),
      this.options.vault.on("delete", (file) => this.onVaultFile(file)),
      this.options.vault.on("rename", (file, oldPath) => this.onVaultRename(file, oldPath))
    ];
  }

  async stop(): Promise<void> {
    await this.queue.stop();
    await this.stopWatching();
  }

  async stopWatching(): Promise<void> {
    await this.sourceWatcher?.close();
    this.sourceWatcher = null;
    for (const ref of this.vaultEvents) this.options.vault.offref(ref);
    this.vaultEvents = [];
  }

  setPaused(value: boolean): void {
    this.paused = value;
    this.options.onStatus(value ? "paused" : "synced", this.conflictCount());
    if (!value) this.queue.request();
  }

  requestSync(): void {
    this.queue.request();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  restoreInitialized(): void {
    this.initialized = true;
  }

  async resolveConflict(relativePath: string, keep: "source" | "vault"): Promise<void> {
    if (this.paused) throw new Error("Resume sync before resolving a conflict.");
    const entry = this.entry(relativePath);
    if (!entry?.conflict) return;
    const sourceHash = await this.options.sourceStore.hash(relativePath);
    const mirrorHash = await this.options.vaultStore.hash(relativePath, sha256);
    const mirrorMatches = mirrorHash === entry.conflict.mirrorHash || (entry.conflict.mirrorWasTrashedForBootstrap && mirrorHash === null);
    if (sourceHash !== entry.conflict.sourceHash || !mirrorMatches) {
      this.queue.request();
      throw new Error("Conflict changed since its snapshot; reconcile again before resolving it.");
    }
    const kind = entry.kind;
    if (keep === "source") {
      if (sourceHash) await this.copySourceToMirror(relativePath, kind, sourceHash);
      else {
        await this.options.vaultStore.trash(relativePath);
        this.tombstone(relativePath, kind);
      }
    } else if (mirrorHash) {
      await this.copyMirrorToSource(relativePath, kind, mirrorHash);
    } else if (entry.conflict.mirrorWasTrashedForBootstrap && entry.conflict.mirrorSnapshotPath && entry.conflict.mirrorHash) {
      const content = await this.options.vaultStore.readConflictSnapshot(entry.conflict.mirrorSnapshotPath);
      if (!content) throw new Error("Vault snapshot is unavailable.");
      await writeThenCommit(async () => {
        this.sourceExpected.expect(relativePath, entry.conflict!.mirrorHash!);
        try {
          await this.options.sourceStore.writeAtomic(relativePath, content);
        } catch (error) {
          this.sourceExpected.cancel(relativePath);
          throw error;
        }
      }, this.entries, manifestKey(relativePath, this.options.policy.caseInsensitive), relativePath, kind, entry.conflict.mirrorHash);
    } else {
      await this.options.sourceStore.moveToQuarantine(relativePath);
      this.tombstone(relativePath, kind);
    }
    await this.persist();
  }

  conflictSnapshotPath(relativePath: string, side: "source" | "vault"): string | null {
    const conflict = this.entry(relativePath)?.conflict;
    if (!conflict || (side === "source" ? !conflict.sourceHash : !conflict.mirrorHash)) return null;
    return `${this.options.policy.mirrorRoot}/${conflict.snapshotFolder}/${snapshotName(path.posix.basename(relativePath), side)}`;
  }

  private async reconcilePath(relativePath: string, sourceFile?: SourceFile, mirrorFile?: SourceFile): Promise<void> {
    if (this.paused) return;
    const entry = this.entry(relativePath);
    const kind = entry?.kind ?? sourceFile?.kind ?? mirrorFile?.kind ?? "document";
    const action = decideReconcile({ baseHash: entry?.baseHash ?? null, sourceHash: sourceFile?.hash ?? null, mirrorHash: mirrorFile?.hash ?? null, status: entry?.status });
    await this.apply(action, relativePath, kind, sourceFile?.hash ?? null, mirrorFile?.hash ?? null);
  }

  private async apply(action: ReconcileAction, relativePath: string, kind: ManagedKind, sourceHash: string | null, mirrorHash: string | null): Promise<void> {
    if (this.paused) return;
    switch (action) {
      case "accept":
        if (sourceHash) this.accept(relativePath, kind, sourceHash);
        return;
      case "create-mirror":
      case "copy-source-to-mirror":
        if (sourceHash) await this.copySourceToMirror(relativePath, kind, sourceHash);
        return;
      case "create-source":
      case "copy-mirror-to-source":
        if (mirrorHash) await this.copyMirrorToSource(relativePath, kind, mirrorHash);
        return;
      case "trash-mirror":
        await this.options.vaultStore.trash(relativePath);
        this.tombstone(relativePath, kind);
        return;
      case "quarantine-source":
        await this.options.sourceStore.moveToQuarantine(relativePath);
        this.tombstone(relativePath, kind);
        return;
      case "tombstone":
        this.tombstone(relativePath, kind);
        return;
      case "conflict":
        await this.createConflict(relativePath, kind, sourceHash, mirrorHash);
        return;
      case "retain-tombstone":
        return;
    }
  }

  private async copySourceToMirror(relativePath: string, kind: ManagedKind, hash: string): Promise<void> {
    if (this.paused) return;
    const content = await this.options.sourceStore.read(relativePath);
    await writeThenCommit(async () => {
      this.mirrorExpected.expect(relativePath, hash);
      try {
        await this.options.vaultStore.write(relativePath, content, kind);
      } catch (error) {
        this.mirrorExpected.cancel(relativePath);
        throw error;
      }
    }, this.entries, manifestKey(relativePath, this.options.policy.caseInsensitive), relativePath, kind, hash);
  }

  private async copyMirrorToSource(relativePath: string, kind: ManagedKind, hash: string): Promise<void> {
    if (this.paused) return;
    const content = await this.options.vaultStore.read(relativePath);
    if (!content) throw new Error(`Mirror disappeared while copying: ${relativePath}`);
    await writeThenCommit(async () => {
      this.sourceExpected.expect(relativePath, hash);
      try {
        await this.options.sourceStore.writeAtomic(relativePath, content);
      } catch (error) {
        this.sourceExpected.cancel(relativePath);
        throw error;
      }
    }, this.entries, manifestKey(relativePath, this.options.policy.caseInsensitive), relativePath, kind, hash);
  }

  private accept(relativePath: string, kind: ManagedKind, hash: string): void {
    const key = manifestKey(relativePath, this.options.policy.caseInsensitive);
    this.entries[key] = { relativePath, kind, baseHash: hash, sourceHash: hash, mirrorHash: hash, status: "active" };
  }

  private tombstone(relativePath: string, kind: ManagedKind): void {
    const key = manifestKey(relativePath, this.options.policy.caseInsensitive);
    const previous = this.entries[key];
    this.entries[key] = { relativePath, kind, baseHash: previous?.baseHash ?? "", sourceHash: null, mirrorHash: null, status: "tombstone" };
  }

  private async createConflict(relativePath: string, kind: ManagedKind, sourceHash: string | null, mirrorHash: string | null): Promise<void> {
    const existing = this.entry(relativePath);
    if (existing?.status === "conflict" && existing.conflict?.sourceHash === sourceHash && existing.conflict.mirrorHash === mirrorHash) return;
    const root = `_project-docs-conflicts/${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const parent = path.posix.dirname(relativePath);
    const folder = parent === "." ? root : `${root}/${parent}`;
    const basename = path.posix.basename(relativePath);
    if (sourceHash) await this.options.vaultStore.write(`${folder}/${snapshotName(basename, "source")}`, await this.options.sourceStore.read(relativePath), kind, true);
    const mirrorSnapshotPath = `${folder}/${snapshotName(basename, "vault")}`;
    if (mirrorHash) {
      const content = await this.options.vaultStore.read(relativePath);
      if (content) await this.options.vaultStore.write(mirrorSnapshotPath, content, kind, true);
    }
    const conflict = { sourceHash, mirrorHash, createdAt: new Date().toISOString(), snapshotFolder: folder, ...(mirrorHash ? { mirrorSnapshotPath } : {}) };
    await this.options.vaultStore.write(`${folder}/conflict.json`, new TextEncoder().encode(JSON.stringify({ relativePath, ...conflict }, null, 2)), "document", true);
    const key = manifestKey(relativePath, this.options.policy.caseInsensitive);
    this.entries[key] = { relativePath, kind, baseHash: existing?.baseHash ?? "", sourceHash, mirrorHash, status: "conflict", conflict };
    this.log("warn", `conflict: ${relativePath}`);
  }

  private async sourceInventory(): Promise<Map<string, SourceFile>> {
    const all = await this.options.sourceStore.scan();
    const documents = all.filter((file) => file.kind === "document");
    const sourceFiles = all.map((file) => file.relativePath);
    const selected = new Map(documents.map((file) => [file.relativePath, file]));
    for (const document of documents) {
      const content = new TextDecoder().decode(await this.options.sourceStore.read(document.relativePath));
      for (const reference of extractLocalReferences(content)) {
        const resolved = resolveLocalReference(document.relativePath, reference, sourceFiles, this.options.settings().assetExtensions);
        if (resolved.path) {
          const file = all.find((candidate) => candidate.relativePath === resolved.path);
          if (file?.kind === "attachment") selected.set(file.relativePath, file);
        } else if (resolved.warning) this.log("warn", resolved.warning);
      }
    }
    for (const entry of Object.values(this.entries)) {
      if (entry.kind !== "attachment") continue;
      const file = all.find((candidate) => candidate.relativePath === entry.relativePath);
      if (file) selected.set(file.relativePath, file);
    }
    this.assertNoCaseCollisions(selected.values(), (file) => file.relativePath, "source");
    return selected;
  }

  private async mirrorInventory(): Promise<Map<string, SourceFile>> {
    const result = new Map<string, SourceFile>();
    for (const relativePath of this.options.vaultStore.listRelativeFiles()) {
      const kind = fileKind(relativePath, this.options.settings().assetExtensions);
      if (!kind) continue;
      const hash = await this.options.vaultStore.hash(relativePath, sha256);
      if (hash) result.set(relativePath, { relativePath, kind, hash });
    }
    this.assertNoCaseCollisions(result.values(), (file) => file.relativePath, "mirror");
    return result;
  }

  private async reconcileRenames(source: Map<string, SourceFile>, mirror: Map<string, SourceFile>): Promise<void> {
    const active = Object.values(this.entries).filter((entry) => entry.status === "active");
    for (const oldEntry of active) {
      if (!source.has(oldEntry.relativePath) && mirror.has(oldEntry.relativePath)) {
        const sourceMatches = [...source.values()].filter((file) => (!this.entry(file.relativePath) || this.entry(file.relativePath) === oldEntry) && file.hash === oldEntry.baseHash);
        if (sourceMatches.length !== 1) continue;
        await this.renameMirror(oldEntry.relativePath, sourceMatches[0].relativePath);
        delete this.entries[manifestKey(oldEntry.relativePath, this.options.policy.caseInsensitive)];
        this.accept(sourceMatches[0].relativePath, oldEntry.kind, oldEntry.baseHash);
        mirror.delete(oldEntry.relativePath);
        mirror.set(sourceMatches[0].relativePath, sourceMatches[0]);
        continue;
      }
      if (source.has(oldEntry.relativePath) && !mirror.has(oldEntry.relativePath)) {
        const mirrorMatches = [...mirror.values()].filter((file) => (!this.entry(file.relativePath) || this.entry(file.relativePath) === oldEntry) && file.hash === oldEntry.baseHash);
        if (mirrorMatches.length !== 1) continue;
        await this.options.sourceStore.rename(oldEntry.relativePath, mirrorMatches[0].relativePath);
        delete this.entries[manifestKey(oldEntry.relativePath, this.options.policy.caseInsensitive)];
        this.accept(mirrorMatches[0].relativePath, oldEntry.kind, oldEntry.baseHash);
        source.delete(oldEntry.relativePath);
        source.set(mirrorMatches[0].relativePath, mirrorMatches[0]);
      }
    }
  }

  private onVaultFile(file: unknown): void {
    const vaultPath = typeof file === "object" && file !== null && "path" in file && typeof (file as { path?: unknown }).path === "string" ? (file as { path: string }).path : null;
    if (!vaultPath || !this.isMirrorBoundary(vaultPath)) return;
    if (!(file instanceof TFile)) {
      this.queue.request();
      return;
    }
    const relative = mirrorRelative(this.options.policy, vaultPath);
    if (!relative) return this.queue.request();
    void this.options.vaultStore.hash(relative, sha256).then((hash) => {
      if (!this.mirrorExpected.consume(relative, hash)) this.queue.request();
    });
  }

  private onVaultRename(file: unknown, oldPath: string): void {
    const newPath = typeof file === "object" && file !== null && "path" in file && typeof (file as { path?: unknown }).path === "string" ? (file as { path: string }).path : null;
    if (this.isMirrorBoundary(oldPath) || (newPath !== null && this.isMirrorBoundary(newPath))) this.queue.request();
  }

  private entry(relativePath: string): SyncManifestEntry | undefined {
    return this.entries[manifestKey(relativePath, this.options.policy.caseInsensitive)];
  }

  private async persist(): Promise<void> {
    await this.options.onStateChange();
  }

  private async renameMirror(relativeFrom: string, relativeTo: string): Promise<void> {
    if (!this.options.policy.caseInsensitive || relativeFrom === relativeTo || relativeFrom.toLowerCase() !== relativeTo.toLowerCase()) {
      await this.options.vaultStore.rename(relativeFrom, relativeTo);
      return;
    }
    const temporary = `${relativeFrom}.project-docs-case-${Date.now()}`;
    await this.options.vaultStore.rename(relativeFrom, temporary);
    await this.options.vaultStore.rename(temporary, relativeTo);
  }

  private assertNoCaseCollisions<T>(items: Iterable<T>, getPath: (item: T) => string, side: string): void {
    const collisions = findCaseCollisions([...items].map(getPath), this.options.policy.caseInsensitive);
    if (collisions.length) throw new Error(`Case-colliding ${side} paths cannot be synchronized: ${collisions[0].join(", ")}`);
  }

  private isMirrorBoundary(vaultPath: string): boolean {
    const normalized = vaultPath.replace(/\\/g, "/").replace(/^\/+/, "");
    return normalized === this.options.policy.mirrorRoot || normalized.startsWith(`${this.options.policy.mirrorRoot}/`);
  }

  private conflictCount(): number {
    return Object.values(this.entries).filter((entry) => entry.status === "conflict").length;
  }

  private log(level: LogLevel, message: string): void {
    (this.options.onLog ?? ((logLevel, text) => console[logLevel](`[Project Docs Bridge] ${text}`)))(level, message);
  }
}

function snapshotName(basename: string, side: "source" | "vault"): string {
  const extension = path.posix.extname(basename);
  return extension ? `${basename.slice(0, -extension.length)}.${side}${extension}` : `${basename}.${side}`;
}
