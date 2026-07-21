import { FileSystemAdapter, Notice, Plugin } from "obsidian";
import { ProjectDocsBridgeSettingTab, DEFAULT_SETTINGS } from "./src/settings";
import { createPathPolicy } from "./src/path-policy";
import type { PersistedData, ProjectDocsBridgeSettings, SyncStatus } from "./src/types";
import { SourceStore } from "./src/source-store";
import { VaultStore } from "./src/vault-store";
import { SyncEngine } from "./src/sync-engine";
import { ConflictModal } from "./src/conflict-modal";

export default class ProjectDocsBridgePlugin extends Plugin {
  settings: ProjectDocsBridgeSettings = { ...DEFAULT_SETTINGS };
  paused = false;
  private initialized = false;
  private status: SyncStatus = "uninitialized";
  private statusBar = this.addStatusBarItem();
  private data: PersistedData = { schemaVersion: 1, initialized: false, settings: { ...DEFAULT_SETTINGS }, entries: {} };
  private engine: SyncEngine | null = null;
  private initializing: Promise<void> | null = null;

  async onload(): Promise<void> {
    const data = await this.loadData() as Partial<PersistedData> | null;
    if (data?.schemaVersion === 1) {
      this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      this.initialized = data.initialized === true;
      this.data = { schemaVersion: 1, initialized: this.initialized, settings: this.settings, entries: data.entries ?? {}, lastSuccessfulSync: data.lastSuccessfulSync };
    }
    this.addSettingTab(new ProjectDocsBridgeSettingTab(this.app, this));
    this.addCommand({ id: "initialize-mirror", name: "Initialize mirror", callback: () => this.initializeMirror() });
    this.addCommand({ id: "sync-now", name: "Sync now", callback: () => this.syncNow() });
    this.addCommand({ id: "toggle-pause", name: "Pause sync / Resume sync", callback: () => this.togglePause() });
    this.addCommand({ id: "open-conflicts", name: "Open conflicts", callback: () => this.openConflicts() });
    this.addCommand({ id: "open-mirror-folder", name: "Open mirror folder", callback: () => new Notice(`Mirror folder: ${this.settings.mirrorRoot}`) });
    this.addCommand({ id: "show-sync-status", name: "Show sync status", callback: () => new Notice(this.statusDescription()) });
    this.setStatus(this.initialized ? "synced" : "uninitialized");
    this.app.workspace.onLayoutReady(() => {
      if (!this.initialized) {
        new Notice("Project Docs Bridge is not initialized. Review settings, then run Initialize mirror.");
        return;
      }
      void this.resumeLoadedEngine();
    });
  }

  async onunload(): Promise<void> {
    await this.engine?.stop();
    await this.saveState();
  }

  async updateSettings(update: Partial<ProjectDocsBridgeSettings>): Promise<void> {
    const rootChanged = update.sourceRoot !== undefined && update.sourceRoot !== this.settings.sourceRoot;
    const mirrorChanged = update.mirrorRoot !== undefined && update.mirrorRoot !== this.settings.mirrorRoot;
    const watchingChanged = update.watchForChanges !== undefined && update.watchForChanges !== this.settings.watchForChanges;
    this.settings = { ...this.settings, ...update };
    if (rootChanged || mirrorChanged) {
      this.initialized = false;
      // Entries are bound to the old roots. Retaining them would apply stale hashes
      // and deletions to a newly selected source/mirror pair.
      this.data.entries = {};
      this.setStatus("uninitialized");
      new Notice("Root changed. Validate and explicitly initialize the new mirror; existing files were not removed.");
    }
    this.data.settings = this.settings;
    this.data.initialized = this.initialized;
    if (rootChanged || mirrorChanged) {
      await this.engine?.stop();
      this.engine = null;
    } else if (watchingChanged) {
      await this.engine?.stopWatching();
      if (this.settings.watchForChanges && this.initialized) this.engine?.start();
    }
    await this.saveState();
  }

  sourcePathDescription(): string {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return "Desktop filesystem vault required.";
    return `Resolved path: ${createPathPolicy(adapter.getBasePath(), this.settings.sourceRoot, this.settings.mirrorRoot)?.sourceRoot ?? "invalid"}`;
  }

  validateConfiguration(): boolean {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice("Project Docs Bridge requires a desktop filesystem vault.");
      return false;
    }
    const policy = createPathPolicy(adapter.getBasePath(), this.settings.sourceRoot, this.settings.mirrorRoot);
    if (!policy) {
      new Notice("Invalid configuration: vault must be a strict child of source root and mirror root must be a safe relative vault path.");
      return false;
    }
    new Notice(`Configuration valid: ${policy.sourceRoot} -> ${policy.mirrorRoot}`);
    return true;
  }

  async initializeMirror(): Promise<void> {
    if (this.initializing) return this.initializing;
    this.initializing = this.initializeMirrorInternal();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async initializeMirrorInternal(): Promise<void> {
    if (!this.validateConfiguration()) return;
    try {
      const engine = this.createEngine();
      if (!engine) return;
      this.setStatus("syncing");
      await engine.initialize();
      this.engine = engine;
      this.initialized = true;
      this.data.initialized = true;
      this.data.lastSuccessfulSync = new Date().toISOString();
      await this.saveState();
      engine.start();
      new Notice("Project Docs Bridge mirror initialized.");
    } catch (error) {
      this.setStatus("error");
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  async syncNow(): Promise<void> {
    if (!this.initialized) {
      new Notice("Initialize the mirror first.");
      return;
    }
    const engine = this.engine ?? this.createEngine();
    if (!engine) return;
    this.engine = engine;
    engine.restoreInitialized();
    try {
      await engine.reconcile();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  async togglePause(): Promise<void> {
    this.paused = !this.paused;
    this.engine?.setPaused(this.paused);
    this.setStatus(this.paused ? "paused" : "synced");
  }

  openConflicts(): void {
    const engine = this.engine ?? this.createEngine();
    if (!engine) return;
    this.engine = engine;
    new ConflictModal(this.app, engine).open();
  }

  statusDescription(): string {
    return `Project Docs Bridge: ${this.status}${this.paused ? " (paused)" : ""}`;
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    const labels: Record<SyncStatus, string> = { uninitialized: "Docs: uninitialized", paused: "Docs: paused", syncing: "Docs: syncing", synced: "Docs: synced", conflicts: "Docs: conflicts", error: "Docs: error" };
    this.statusBar.setText(labels[status]);
  }

  private createEngine(): SyncEngine | null {
    if (this.engine) return this.engine;
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return null;
    const policy = createPathPolicy(adapter.getBasePath(), this.settings.sourceRoot, this.settings.mirrorRoot);
    if (!policy) return null;
    return new SyncEngine({
      vault: this.app.vault,
      vaultStore: new VaultStore(this.app.vault, this.app.fileManager, policy.mirrorRoot),
      sourceStore: new SourceStore(policy, this.settings.excludePatterns, this.settings.assetExtensions),
      policy,
      settings: () => this.settings,
      entries: this.data.entries,
      onStateChange: () => this.saveState(),
      onSuccessfulSync: () => this.recordSuccessfulSync(),
      onStatus: (status) => this.setStatus(status),
      onLog: (level, message) => console[level](`[Project Docs Bridge] ${message}`)
    });
  }

  private async resumeLoadedEngine(): Promise<void> {
    const engine = this.createEngine();
    if (!engine) {
      this.setStatus("error");
      return;
    }
    this.engine = engine;
    engine.restoreInitialized();
    engine.setPaused(this.paused);
    try {
      if (this.settings.syncOnStartup) await engine.reconcile();
      if (this.settings.watchForChanges) engine.start();
    } catch (error) {
      this.setStatus("error");
      console.error("[Project Docs Bridge] startup reconcile failed", error);
    }
  }

  private async recordSuccessfulSync(): Promise<void> {
    this.data.lastSuccessfulSync = new Date().toISOString();
    await this.saveState();
  }

  private async saveState(): Promise<void> {
    this.data = { ...this.data, schemaVersion: 1, initialized: this.initialized, settings: this.settings, entries: this.data.entries };
    await this.saveData(this.data);
  }
}
