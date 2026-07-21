import { App, Modal, Notice } from "obsidian";
import type { SyncEngine } from "./sync-engine";
import type { SyncManifestEntry } from "./types";

export class ConflictModal extends Modal {
  constructor(app: App, private readonly engine: SyncEngine) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Project Docs Bridge conflicts" });
    const conflicts = Object.values(this.engine.entries).filter((entry) => entry.status === "conflict");
    if (!conflicts.length) {
      this.contentEl.createEl("p", { text: "No unresolved conflicts." });
      return;
    }
    for (const entry of conflicts) this.renderConflict(entry);
  }

  private renderConflict(entry: SyncManifestEntry): void {
    const row = this.contentEl.createDiv({ cls: "project-docs-bridge-conflict" });
    row.createEl("h3", { text: entry.relativePath });
    row.createEl("p", { text: `Snapshots: ${entry.conflict?.snapshotFolder ?? "unavailable"}` });
    const source = row.createEl("button", { text: entry.conflict?.sourceHash ? "Keep source" : "Keep source deletion" });
    source.onclick = () => this.resolve(entry.relativePath, "source");
    const vault = row.createEl("button", { text: entry.conflict?.mirrorHash ? "Keep vault" : "Keep vault deletion" });
    vault.onclick = () => this.resolve(entry.relativePath, "vault");
    if (entry.conflict?.sourceHash) this.snapshotButton(row, entry, "source");
    if (entry.conflict?.mirrorHash) this.snapshotButton(row, entry, "vault");
  }

  private async resolve(relativePath: string, keep: "source" | "vault"): Promise<void> {
    try {
      await this.engine.resolveConflict(relativePath, keep);
      new Notice(`Resolved conflict for ${relativePath}`);
      this.onOpen();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  private snapshotButton(row: HTMLElement, entry: SyncManifestEntry, side: "source" | "vault"): void {
    if (!this.engine.conflictSnapshotPath(entry.relativePath, side)) return;
    const button = row.createEl("button", { text: `Open ${side} snapshot` });
    button.onclick = () => void this.app.workspace.openLinkText(this.engine.conflictSnapshotPath(entry.relativePath, side) ?? "", "", false);
  }
}
