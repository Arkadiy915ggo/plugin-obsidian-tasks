"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => RuleBasedDailyTasksPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DATE_FORMAT = "YYYY-MM-DD";
var BLOCK_START = "<!-- rule-based-daily-tasks:start -->";
var BLOCK_END = "<!-- rule-based-daily-tasks:end -->";
var DEFAULT_SETTINGS = {
  sourceFolder: "Task Sources",
  dailyFolder: "",
  dailyDateFormat: DATE_FORMAT,
  generatedHeading: "Generated tasks",
  autoGenerateOnDailyCreate: true
};
var RuleBasedDailyTasksPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new RuleBasedDailyTasksSettingTab(this.app, this));
    this.addCommand({
      id: "generate-tasks-for-current-daily-note",
      name: "Generate tasks for current daily note",
      callback: () => {
        void this.generateForActiveDailyNote();
      }
    });
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        this.handleCreatedFile(file);
      })
    );
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  handleCreatedFile(file) {
    if (!this.settings.autoGenerateOnDailyCreate || !(file instanceof import_obsidian.TFile)) {
      return;
    }
    const dailyDate = this.getDailyDate(file);
    if (!dailyDate) {
      return;
    }
    window.setTimeout(() => {
      const currentFile = this.app.vault.getAbstractFileByPath(file.path);
      if (currentFile instanceof import_obsidian.TFile) {
        void this.generateTasksForNewDailyNote(currentFile, dailyDate);
      }
    }, 750);
  }
  async generateTasksForNewDailyNote(dailyFile, dailyDate) {
    const content = await this.app.vault.read(dailyFile);
    if (this.getExistingGeneratedTaskLines(content).length > 0) {
      return;
    }
    await this.generateTasksForDailyNote(dailyFile, dailyDate, false);
  }
  async generateForActiveDailyNote() {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice("Open a daily note first.");
      return;
    }
    const dailyDate = this.getDailyDate(file);
    if (!dailyDate) {
      new import_obsidian.Notice("Current note does not match daily note settings.");
      return;
    }
    await this.generateTasksForDailyNote(file, dailyDate, true);
  }
  async generateTasksForDailyNote(dailyFile, dailyDate, showNotice) {
    const templates = await this.loadTaskTemplates();
    const tasks = templates.filter((template) => this.ruleMatchesDate(template.rule, dailyDate, template.id)).sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.sourceLine - b.sourceLine);
    const content = await this.app.vault.read(dailyFile);
    const updatedContent = this.upsertGeneratedBlock(
      content,
      this.buildGeneratedTaskLines(content, tasks)
    );
    if (updatedContent !== content) {
      await this.app.vault.modify(dailyFile, updatedContent);
    }
    if (showNotice) {
      new import_obsidian.Notice(`Generated ${tasks.length} task${tasks.length === 1 ? "" : "s"}.`);
    }
  }
  async loadTaskTemplates() {
    const sourceFiles = this.getSourceFiles();
    const sources = await Promise.all(
      sourceFiles.map(async (file) => ({
        file,
        content: await this.app.vault.read(file)
      }))
    );
    return sources.flatMap(({ file, content }) => this.parseTaskTemplates(content, file.path));
  }
  getSourceFiles() {
    const sourceFolder = normalizeFolder(this.settings.sourceFolder);
    return this.app.vault.getMarkdownFiles().filter((file) => {
      if (!sourceFolder) {
        return true;
      }
      return file.path.startsWith(`${sourceFolder}/`);
    });
  }
  buildGeneratedTaskLines(content, tasks) {
    var _a;
    const existingLines = this.getExistingGeneratedTaskLines(content);
    const existingByText = /* @__PURE__ */ new Map();
    for (const line of existingLines) {
      const taskMatch = line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.+?)\s*$/);
      if (!taskMatch) {
        continue;
      }
      const key = normalizeGeneratedTaskText(taskMatch[1]);
      const lines = (_a = existingByText.get(key)) != null ? _a : [];
      lines.push(line.trimEnd().replace(/^\s*[-*]\s+/, "- "));
      existingByText.set(key, lines);
    }
    return tasks.map((task) => {
      const existing = existingByText.get(normalizeGeneratedTaskText(task.text));
      const preservedLine = existing == null ? void 0 : existing.shift();
      return preservedLine != null ? preservedLine : `- [ ] ${task.text}`;
    });
  }
  getExistingGeneratedTaskLines(content) {
    const heading = this.settings.generatedHeading.trim() || DEFAULT_SETTINGS.generatedHeading;
    const headingBlock = new RegExp(
      `(^|
)##\\s+${escapeRegExp(heading)}\\s*
[\\s\\S]*?(?=
#{1,6}\\s+|$)`
    );
    const headingMatch = content.match(headingBlock);
    if (headingMatch) {
      return headingMatch[0].split(/\r?\n/);
    }
    const existingBlock = new RegExp(`${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}`);
    const markerMatch = content.match(existingBlock);
    return markerMatch ? markerMatch[0].split(/\r?\n/) : [];
  }
  parseTaskTemplates(content, sourcePath) {
    const lines = content.split(/\r?\n/);
    const tasks = [];
    let insideGeneratedBlock = false;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.includes(BLOCK_START)) {
        insideGeneratedBlock = true;
        continue;
      }
      if (line.includes(BLOCK_END)) {
        insideGeneratedBlock = false;
        continue;
      }
      if (insideGeneratedBlock) {
        continue;
      }
      const taskMatch = line.match(/^(\s*)[-*]\s+\[[ xX]\]\s+(.+?)\s*$/);
      if (!taskMatch) {
        continue;
      }
      const taskIndent = indentationWidth(taskMatch[1]);
      const ruleText = this.findRuleForTask(lines, index + 1, taskIndent);
      if (!ruleText) {
        continue;
      }
      const rule = parseScheduleRule(ruleText);
      if (!rule) {
        console.warn(`Unsupported task rule in ${sourcePath}:${index + 1}: ${ruleText}`);
        continue;
      }
      const text = taskMatch[2];
      tasks.push({
        id: `${sourcePath}:${index + 1}:${text}:${ruleText}`,
        text,
        sourcePath,
        sourceLine: index + 1,
        ruleText,
        rule
      });
    }
    return tasks;
  }
  findRuleForTask(lines, startIndex, taskIndent) {
    var _a, _b;
    for (let index = startIndex; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim().length === 0) {
        continue;
      }
      if (indentationWidth((_b = (_a = line.match(/^\s*/)) == null ? void 0 : _a[0]) != null ? _b : "") <= taskIndent) {
        return null;
      }
      const ruleMatch = line.match(/^\s*(?:[-*]\s+)?(?:rule|schedule|правило|расписание)\s*:{1,2}\s*(.+?)\s*$/i);
      if (ruleMatch) {
        return ruleMatch[1];
      }
    }
    return null;
  }
  getDailyDate(file) {
    if (file.extension !== "md") {
      return null;
    }
    const dailyFolder = normalizeFolder(this.settings.dailyFolder);
    if (dailyFolder && !file.path.startsWith(`${dailyFolder}/`)) {
      return null;
    }
    if (!dailyFolder && file.path.includes("/")) {
      return null;
    }
    const parsedDate = (0, import_obsidian.moment)(file.basename, this.settings.dailyDateFormat, true);
    return parsedDate.isValid() ? parsedDate.format(DATE_FORMAT) : null;
  }
  ruleMatchesDate(rule, dailyDate, seed) {
    const targetDate = (0, import_obsidian.moment)(dailyDate, DATE_FORMAT, true);
    if (!targetDate.isValid()) {
      return false;
    }
    if (rule.type === "exact-date") {
      return targetDate.isSame((0, import_obsidian.moment)(rule.date, DATE_FORMAT, true), "day");
    }
    if (rule.type === "date-range") {
      return targetDate.isBetween(
        (0, import_obsidian.moment)(rule.start, DATE_FORMAT, true),
        (0, import_obsidian.moment)(rule.end, DATE_FORMAT, true),
        "day",
        "[]"
      );
    }
    const dates = periodDates(targetDate, rule.period);
    const periodKey = rule.period === "week" ? targetDate.format("GGGG-[W]WW") : targetDate.format("YYYY-MM");
    const countRange = rule.max - rule.min + 1;
    const desiredCount = rule.min + hashString(`${seed}:${periodKey}:count`) % countRange;
    const count = Math.min(desiredCount, dates.length);
    const selectedDates = selectSpreadDates(dates, count, seed, periodKey);
    return selectedDates.includes(dailyDate);
  }
  upsertGeneratedBlock(content, taskLines) {
    const heading = this.settings.generatedHeading.trim() || DEFAULT_SETTINGS.generatedHeading;
    const sectionBody = taskLines.join("\n");
    const generatedSection = sectionBody ? `## ${heading}

${sectionBody}` : "";
    const headingBlock = new RegExp(
      `(^|
)##\\s+${escapeRegExp(heading)}\\s*
[\\s\\S]*?(?=
#{1,6}\\s+|$)`
    );
    const existingBlock = new RegExp(`${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}`);
    if (headingBlock.test(content)) {
      return content.replace(headingBlock, (_match, prefix) => {
        if (!generatedSection) {
          return prefix === "\n" ? "" : prefix;
        }
        return `${prefix}${generatedSection}`;
      });
    }
    if (existingBlock.test(content)) {
      return content.replace(existingBlock, sectionBody);
    }
    if (taskLines.length === 0) {
      return content;
    }
    const separator = content.trim().length === 0 ? "" : "\n\n";
    return `${content.trimEnd()}${separator}${generatedSection}
`;
  }
};
var RuleBasedDailyTasksSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Rule Based Daily Tasks" });
    new import_obsidian.Setting(containerEl).setName("Task source folder").setDesc("Folder with notes that contain task templates and rule lines.").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.sourceFolder).setValue(this.plugin.settings.sourceFolder).onChange(async (value) => {
        this.plugin.settings.sourceFolder = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Daily notes folder").setDesc("Leave empty if daily notes are in the vault root.").addText(
      (text) => text.setPlaceholder("Daily").setValue(this.plugin.settings.dailyFolder).onChange(async (value) => {
        this.plugin.settings.dailyFolder = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Daily note date format").setDesc("Moment.js format used in daily note file names.").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.dailyDateFormat).setValue(this.plugin.settings.dailyDateFormat).onChange(async (value) => {
        this.plugin.settings.dailyDateFormat = value.trim() || DEFAULT_SETTINGS.dailyDateFormat;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Generated section heading").setDesc("Heading inserted above generated tasks.").addText(
      (text) => text.setPlaceholder(DEFAULT_SETTINGS.generatedHeading).setValue(this.plugin.settings.generatedHeading).onChange(async (value) => {
        this.plugin.settings.generatedHeading = value.trim() || DEFAULT_SETTINGS.generatedHeading;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Generate when daily note is created").setDesc("Automatically append generated tasks to new daily notes.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoGenerateOnDailyCreate).onChange(async (value) => {
        this.plugin.settings.autoGenerateOnDailyCreate = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
function parseScheduleRule(input) {
  var _a, _b;
  const normalized = input.trim().toLowerCase().replace(/ё/g, "\u0435");
  const dateRangeMatch = normalized.match(
    /(\d{4}-\d{2}-\d{2})\s*(?:\.\.|—|–|\s-\s|до|to)\s*(\d{4}-\d{2}-\d{2})/i
  );
  if (dateRangeMatch) {
    const firstDate = dateRangeMatch[1];
    const secondDate = dateRangeMatch[2];
    if (!isValidDate(firstDate) || !isValidDate(secondDate)) {
      return null;
    }
    return (0, import_obsidian.moment)(firstDate, DATE_FORMAT).isAfter((0, import_obsidian.moment)(secondDate, DATE_FORMAT)) ? { type: "date-range", start: secondDate, end: firstDate } : { type: "date-range", start: firstDate, end: secondDate };
  }
  const exactDateMatch = normalized.match(/(?:^|\D)(\d{4}-\d{2}-\d{2})(?:\D|$)/);
  if (exactDateMatch) {
    const date = exactDateMatch[1];
    return isValidDate(date) ? { type: "exact-date", date } : null;
  }
  const period = parsePeriod(normalized);
  if (!period) {
    return null;
  }
  const countRangeMatch = (_a = normalized.match(/от\s+(\d+)\s*-?\s+до\s+(\d+)/)) != null ? _a : normalized.match(/(\d+)\s*(?:-|–|—)\s*(\d+)/);
  if (countRangeMatch) {
    const firstCount = Number(countRangeMatch[1]);
    const secondCount = Number(countRangeMatch[2]);
    return normalizeFrequencyRule(firstCount, secondCount, period);
  }
  const countMatch = (_b = normalized.match(/(\d+)\s*(?:x|раз|times?)/)) != null ? _b : normalized.match(/^(\d+)/);
  if (!countMatch) {
    return null;
  }
  const count = Number(countMatch[1]);
  return normalizeFrequencyRule(count, count, period);
}
function parsePeriod(input) {
  if (/(?:week|\/w\b|\bw\b|недел)/i.test(input)) {
    return "week";
  }
  if (/(?:month|\/m\b|\bm\b|месяц|мес)/i.test(input)) {
    return "month";
  }
  return null;
}
function normalizeFrequencyRule(firstCount, secondCount, period) {
  if (!Number.isInteger(firstCount) || !Number.isInteger(secondCount) || firstCount <= 0 || secondCount <= 0) {
    return null;
  }
  return {
    type: "frequency",
    min: Math.min(firstCount, secondCount),
    max: Math.max(firstCount, secondCount),
    period
  };
}
function periodDates(targetDate, period) {
  const start = period === "week" ? targetDate.clone().startOf("isoWeek") : targetDate.clone().startOf("month");
  const length = period === "week" ? 7 : targetDate.daysInMonth();
  const dates = [];
  for (let offset = 0; offset < length; offset += 1) {
    dates.push(start.clone().add(offset, "day").format(DATE_FORMAT));
  }
  return dates;
}
function selectSpreadDates(dates, count, seed, periodKey) {
  if (count >= dates.length) {
    return dates;
  }
  const selectedDates = [];
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor(index * dates.length / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * dates.length / count));
    const bucket = dates.slice(start, end);
    const bucketIndex = hashString(`${seed}:${periodKey}:bucket:${index}`) % bucket.length;
    selectedDates.push(bucket[bucketIndex]);
  }
  return selectedDates;
}
function normalizeFolder(folder) {
  const normalized = (0, import_obsidian.normalizePath)(folder.trim());
  return normalized === "/" || normalized === "." ? "" : normalized.replace(/^\/+|\/+$/g, "");
}
function indentationWidth(value) {
  return value.replace(/\t/g, "    ").length;
}
function normalizeGeneratedTaskText(value) {
  return value.trim().replace(/\s+✅\s+\d{4}-\d{2}-\d{2}\s*$/, "").replace(/\s+/g, " ");
}
function isValidDate(value) {
  return (0, import_obsidian.moment)(value, DATE_FORMAT, true).isValid();
}
function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
