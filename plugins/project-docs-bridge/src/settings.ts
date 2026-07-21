import { App, PluginSettingTab, Setting } from "obsidian";
import type ProjectDocsBridgePlugin from "../main";
import type { ProjectDocsBridgeSettings } from "./types";

export const DEFAULT_SETTINGS: ProjectDocsBridgeSettings = {
  sourceRoot: "..",
  mirrorRoot: "doc",
  excludePatterns: [".git/**", "node_modules/**", "**/.obsidian/**", ".project-docs-trash/**"],
  assetExtensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf"],
  syncOnStartup: true,
  watchForChanges: true,
  debounceMs: 750
};

export class ProjectDocsBridgeSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ProjectDocsBridgePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Project Docs Bridge" });
    new Setting(containerEl).setName("Source root").setDesc(this.plugin.sourcePathDescription()).addText((text) => text
      .setValue(this.plugin.settings.sourceRoot)
      .onChange(async (value) => this.plugin.updateSettings({ sourceRoot: value })));
    new Setting(containerEl).setName("Mirror root").setDesc("Relative folder inside this vault.").addText((text) => text
      .setValue(this.plugin.settings.mirrorRoot)
      .onChange(async (value) => this.plugin.updateSettings({ mirrorRoot: value })));
    new Setting(containerEl).setName("Ignore patterns").setDesc("One glob per line.").addTextArea((text) => text
      .setValue(this.plugin.settings.excludePatterns.join("\n"))
      .onChange(async (value) => this.plugin.updateSettings({ excludePatterns: value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) })));
    new Setting(containerEl).setName("Attachment extensions").setDesc("Comma-separated image/PDF extensions.").addText((text) => text
      .setValue(this.plugin.settings.assetExtensions.join(", "))
      .onChange(async (value) => this.plugin.updateSettings({ assetExtensions: value.split(",").map((item) => item.trim().replace(/^\./, "")).filter(Boolean) })));
    new Setting(containerEl).setName("Sync on startup").addToggle((toggle) => toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => this.plugin.updateSettings({ syncOnStartup: value })));
    new Setting(containerEl).setName("Watch for changes").addToggle((toggle) => toggle.setValue(this.plugin.settings.watchForChanges).onChange(async (value) => this.plugin.updateSettings({ watchForChanges: value })));
    new Setting(containerEl).setName("Debounce (ms)").addText((text) => text.setValue(String(this.plugin.settings.debounceMs)).onChange(async (value) => this.plugin.updateSettings({ debounceMs: Math.max(100, Number(value) || DEFAULT_SETTINGS.debounceMs) })));
    new Setting(containerEl).setName("Status").setDesc(this.plugin.statusDescription());
    new Setting(containerEl).addButton((button) => button.setButtonText("Validate configuration").onClick(() => this.plugin.validateConfiguration()));
    new Setting(containerEl).addButton((button) => button.setButtonText("Initialize mirror").setCta().onClick(() => this.plugin.initializeMirror()));
    new Setting(containerEl).addButton((button) => button.setButtonText("Sync now").onClick(() => this.plugin.syncNow()));
    new Setting(containerEl).addButton((button) => button.setButtonText(this.plugin.paused ? "Resume" : "Pause").onClick(() => this.plugin.togglePause()));
    new Setting(containerEl).addButton((button) => button.setButtonText("Open conflicts").onClick(() => this.plugin.openConflicts()));
  }
}
