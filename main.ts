import {
  App,
  moment,
  normalizePath,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
} from "obsidian";

const DATE_FORMAT = "YYYY-MM-DD";
const BLOCK_START = "<!-- rule-based-daily-tasks:start -->";
const BLOCK_END = "<!-- rule-based-daily-tasks:end -->";

interface RuleBasedDailyTasksSettings {
  sourceFolder: string;
  dailyFolder: string;
  dailyDateFormat: string;
  generatedHeading: string;
  autoGenerateOnDailyCreate: boolean;
}

const DEFAULT_SETTINGS: RuleBasedDailyTasksSettings = {
  sourceFolder: "Task Sources",
  dailyFolder: "",
  dailyDateFormat: DATE_FORMAT,
  generatedHeading: "Generated tasks",
  autoGenerateOnDailyCreate: true,
};

type SchedulePeriod = "week" | "month";

type ScheduleRule =
  | {
      type: "frequency";
      min: number;
      max: number;
      period: SchedulePeriod;
    }
  | {
      type: "exact-date";
      date: string;
    }
  | {
      type: "date-range";
      start: string;
      end: string;
    };

interface TaskTemplate {
  id: string;
  text: string;
  sourcePath: string;
  sourceLine: number;
  ruleText: string;
  rule: ScheduleRule;
}

export default class RuleBasedDailyTasksPlugin extends Plugin {
  settings!: RuleBasedDailyTasksSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new RuleBasedDailyTasksSettingTab(this.app, this));

    this.addCommand({
      id: "generate-tasks-for-current-daily-note",
      name: "Generate tasks for current daily note",
      callback: () => {
        void this.generateForActiveDailyNote();
      },
    });

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        this.handleCreatedFile(file);
      })
    );
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private handleCreatedFile(file: TAbstractFile): void {
    if (!this.settings.autoGenerateOnDailyCreate || !(file instanceof TFile)) {
      return;
    }

    const dailyDate = this.getDailyDate(file);
    if (!dailyDate) {
      return;
    }

    window.setTimeout(() => {
      const currentFile = this.app.vault.getAbstractFileByPath(file.path);
      if (currentFile instanceof TFile) {
        void this.generateTasksForDailyNote(currentFile, dailyDate, false);
      }
    }, 750);
  }

  private async generateForActiveDailyNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile)) {
      new Notice("Open a daily note first.");
      return;
    }

    const dailyDate = this.getDailyDate(file);
    if (!dailyDate) {
      new Notice("Current note does not match daily note settings.");
      return;
    }

    await this.generateTasksForDailyNote(file, dailyDate, true);
  }

  private async generateTasksForDailyNote(
    dailyFile: TFile,
    dailyDate: string,
    showNotice: boolean
  ): Promise<void> {
    const templates = await this.loadTaskTemplates();
    const tasks = templates
      .filter((template) => this.ruleMatchesDate(template.rule, dailyDate, template.id))
      .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.sourceLine - b.sourceLine);

    const content = await this.app.vault.read(dailyFile);
    const updatedContent = this.upsertGeneratedBlock(
      content,
      tasks.map((task) => `- [ ] ${task.text}`)
    );

    if (updatedContent !== content) {
      await this.app.vault.modify(dailyFile, updatedContent);
    }

    if (showNotice) {
      new Notice(`Generated ${tasks.length} task${tasks.length === 1 ? "" : "s"}.`);
    }
  }

  private async loadTaskTemplates(): Promise<TaskTemplate[]> {
    const sourceFiles = this.getSourceFiles();
    const sources = await Promise.all(
      sourceFiles.map(async (file) => ({
        file,
        content: await this.app.vault.read(file),
      }))
    );

    return sources.flatMap(({ file, content }) => this.parseTaskTemplates(content, file.path));
  }

  private getSourceFiles(): TFile[] {
    const sourceFolder = normalizeFolder(this.settings.sourceFolder);

    return this.app.vault.getMarkdownFiles().filter((file) => {
      if (!sourceFolder) {
        return true;
      }

      return file.path.startsWith(`${sourceFolder}/`);
    });
  }

  private parseTaskTemplates(content: string, sourcePath: string): TaskTemplate[] {
    const lines = content.split(/\r?\n/);
    const tasks: TaskTemplate[] = [];
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
        rule,
      });
    }

    return tasks;
  }

  private findRuleForTask(lines: string[], startIndex: number, taskIndent: number): string | null {
    for (let index = startIndex; index < lines.length; index += 1) {
      const line = lines[index];

      if (line.trim().length === 0) {
        continue;
      }

      if (indentationWidth(line.match(/^\s*/)?.[0] ?? "") <= taskIndent) {
        return null;
      }

      const ruleMatch = line.match(/^\s*(?:[-*]\s+)?(?:rule|schedule|правило|расписание)\s*:{1,2}\s*(.+?)\s*$/i);
      if (ruleMatch) {
        return ruleMatch[1];
      }
    }

    return null;
  }

  private getDailyDate(file: TFile): string | null {
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

    const parsedDate = moment(file.basename, this.settings.dailyDateFormat, true);
    return parsedDate.isValid() ? parsedDate.format(DATE_FORMAT) : null;
  }

  private ruleMatchesDate(rule: ScheduleRule, dailyDate: string, seed: string): boolean {
    const targetDate = moment(dailyDate, DATE_FORMAT, true);
    if (!targetDate.isValid()) {
      return false;
    }

    if (rule.type === "exact-date") {
      return targetDate.isSame(moment(rule.date, DATE_FORMAT, true), "day");
    }

    if (rule.type === "date-range") {
      return targetDate.isBetween(
        moment(rule.start, DATE_FORMAT, true),
        moment(rule.end, DATE_FORMAT, true),
        "day",
        "[]"
      );
    }

    const dates = periodDates(targetDate, rule.period);
    const periodKey = rule.period === "week" ? targetDate.format("GGGG-[W]WW") : targetDate.format("YYYY-MM");
    const countRange = rule.max - rule.min + 1;
    const desiredCount = rule.min + (hashString(`${seed}:${periodKey}:count`) % countRange);
    const count = Math.min(desiredCount, dates.length);
    const selectedDates = selectSpreadDates(dates, count, seed, periodKey);

    return selectedDates.includes(dailyDate);
  }

  private upsertGeneratedBlock(content: string, taskLines: string[]): string {
    const heading = this.settings.generatedHeading.trim() || DEFAULT_SETTINGS.generatedHeading;
    const sectionBody = taskLines.join("\n");
    const generatedSection = sectionBody ? `## ${heading}\n\n${sectionBody}` : "";
    const headingBlock = new RegExp(
      `(^|\n)##\\s+${escapeRegExp(heading)}\\s*\n[\\s\\S]*?(?=\n#{1,6}\\s+|$)`
    );
    const existingBlock = new RegExp(`${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}`);

    if (headingBlock.test(content)) {
      return content.replace(headingBlock, (_match, prefix: string) => {
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
    return `${content.trimEnd()}${separator}${generatedSection}\n`;
  }
}

class RuleBasedDailyTasksSettingTab extends PluginSettingTab {
  plugin: RuleBasedDailyTasksPlugin;

  constructor(app: App, plugin: RuleBasedDailyTasksPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Rule Based Daily Tasks" });

    new Setting(containerEl)
      .setName("Task source folder")
      .setDesc("Folder with notes that contain task templates and rule lines.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.sourceFolder)
          .setValue(this.plugin.settings.sourceFolder)
          .onChange(async (value) => {
            this.plugin.settings.sourceFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily notes folder")
      .setDesc("Leave empty if daily notes are in the vault root.")
      .addText((text) =>
        text
          .setPlaceholder("Daily")
          .setValue(this.plugin.settings.dailyFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Daily note date format")
      .setDesc("Moment.js format used in daily note file names.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dailyDateFormat)
          .setValue(this.plugin.settings.dailyDateFormat)
          .onChange(async (value) => {
            this.plugin.settings.dailyDateFormat = value.trim() || DEFAULT_SETTINGS.dailyDateFormat;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Generated section heading")
      .setDesc("Heading inserted above generated tasks.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.generatedHeading)
          .setValue(this.plugin.settings.generatedHeading)
          .onChange(async (value) => {
            this.plugin.settings.generatedHeading = value.trim() || DEFAULT_SETTINGS.generatedHeading;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Generate when daily note is created")
      .setDesc("Automatically append generated tasks to new daily notes.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoGenerateOnDailyCreate).onChange(async (value) => {
          this.plugin.settings.autoGenerateOnDailyCreate = value;
          await this.plugin.saveSettings();
        })
      );
  }
}

function parseScheduleRule(input: string): ScheduleRule | null {
  const normalized = input.trim().toLowerCase().replace(/ё/g, "е");
  const dateRangeMatch = normalized.match(
    /(\d{4}-\d{2}-\d{2})\s*(?:\.\.|—|–|\s-\s|до|to)\s*(\d{4}-\d{2}-\d{2})/i
  );

  if (dateRangeMatch) {
    const firstDate = dateRangeMatch[1];
    const secondDate = dateRangeMatch[2];
    if (!isValidDate(firstDate) || !isValidDate(secondDate)) {
      return null;
    }

    return moment(firstDate, DATE_FORMAT).isAfter(moment(secondDate, DATE_FORMAT))
      ? { type: "date-range", start: secondDate, end: firstDate }
      : { type: "date-range", start: firstDate, end: secondDate };
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

  const countRangeMatch =
    normalized.match(/от\s+(\d+)\s*-?\s+до\s+(\d+)/) ?? normalized.match(/(\d+)\s*(?:-|–|—)\s*(\d+)/);

  if (countRangeMatch) {
    const firstCount = Number(countRangeMatch[1]);
    const secondCount = Number(countRangeMatch[2]);
    return normalizeFrequencyRule(firstCount, secondCount, period);
  }

  const countMatch = normalized.match(/(\d+)\s*(?:x|раз|times?)/) ?? normalized.match(/^(\d+)/);
  if (!countMatch) {
    return null;
  }

  const count = Number(countMatch[1]);
  return normalizeFrequencyRule(count, count, period);
}

function parsePeriod(input: string): SchedulePeriod | null {
  if (/(?:week|\/w\b|\bw\b|недел)/i.test(input)) {
    return "week";
  }

  if (/(?:month|\/m\b|\bm\b|месяц|мес)/i.test(input)) {
    return "month";
  }

  return null;
}

function normalizeFrequencyRule(firstCount: number, secondCount: number, period: SchedulePeriod): ScheduleRule | null {
  if (!Number.isInteger(firstCount) || !Number.isInteger(secondCount) || firstCount <= 0 || secondCount <= 0) {
    return null;
  }

  return {
    type: "frequency",
    min: Math.min(firstCount, secondCount),
    max: Math.max(firstCount, secondCount),
    period,
  };
}

function periodDates(targetDate: moment.Moment, period: SchedulePeriod): string[] {
  const start = period === "week" ? targetDate.clone().startOf("isoWeek") : targetDate.clone().startOf("month");
  const length = period === "week" ? 7 : targetDate.daysInMonth();
  const dates: string[] = [];

  for (let offset = 0; offset < length; offset += 1) {
    dates.push(start.clone().add(offset, "day").format(DATE_FORMAT));
  }

  return dates;
}

function selectSpreadDates(dates: string[], count: number, seed: string, periodKey: string): string[] {
  if (count >= dates.length) {
    return dates;
  }

  const selectedDates: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index * dates.length) / count);
    const end = Math.max(start + 1, Math.floor(((index + 1) * dates.length) / count));
    const bucket = dates.slice(start, end);
    const bucketIndex = hashString(`${seed}:${periodKey}:bucket:${index}`) % bucket.length;
    selectedDates.push(bucket[bucketIndex]);
  }

  return selectedDates;
}

function normalizeFolder(folder: string): string {
  const normalized = normalizePath(folder.trim());
  return normalized === "/" || normalized === "." ? "" : normalized.replace(/^\/+|\/+$/g, "");
}

function indentationWidth(value: string): number {
  return value.replace(/\t/g, "    ").length;
}

function isValidDate(value: string): boolean {
  return moment(value, DATE_FORMAT, true).isValid();
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
