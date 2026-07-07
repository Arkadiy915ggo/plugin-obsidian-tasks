const {
  App,
  moment,
  normalizePath,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} = require("obsidian");

const DATE_FORMAT = "YYYY-MM-DD";
const BLOCK_START = "<!-- rule-based-daily-tasks:start -->";
const BLOCK_END = "<!-- rule-based-daily-tasks:end -->";

const DEFAULT_SETTINGS = {
  sourceFolder: "Task Sources",
  dailyFolder: "",
  dailyDateFormat: DATE_FORMAT,
  generatedHeading: "Generated tasks",
  autoGenerateOnDailyCreate: true,
};

class RuleBasedDailyTasksPlugin extends Plugin {
  async onload() {
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

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  handleCreatedFile(file) {
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

  async generateForActiveDailyNote() {
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

  async generateTasksForDailyNote(dailyFile, dailyDate, showNotice) {
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

  async loadTaskTemplates() {
    const sourceFiles = this.getSourceFiles();
    const sources = await Promise.all(
      sourceFiles.map(async (file) => ({
        file,
        content: await this.app.vault.read(file),
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
        rule,
      });
    }

    return tasks;
  }

  findRuleForTask(lines, startIndex, taskIndent) {
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

    const parsedDate = moment(file.basename, this.settings.dailyDateFormat, true);
    return parsedDate.isValid() ? parsedDate.format(DATE_FORMAT) : null;
  }

  ruleMatchesDate(rule, dailyDate, seed) {
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
    const selectedDates = dates
      .map((date) => ({
        date,
        weight: hashString(`${seed}:${periodKey}:${date}`),
      }))
      .sort((a, b) => a.weight - b.weight)
      .slice(0, count)
      .map((entry) => entry.date);

    return selectedDates.includes(dailyDate);
  }

  upsertGeneratedBlock(content, taskLines) {
    const markerBlock = [BLOCK_START, ...taskLines, BLOCK_END].join("\n");
    const existingBlock = new RegExp(`${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}`);

    if (existingBlock.test(content)) {
      return content.replace(existingBlock, markerBlock);
    }

    if (taskLines.length === 0) {
      return content;
    }

    const heading = this.settings.generatedHeading.trim() || DEFAULT_SETTINGS.generatedHeading;
    const separator = content.trim().length === 0 ? "" : "\n\n";
    return `${content.trimEnd()}${separator}## ${heading}\n\n${markerBlock}\n`;
  }
}

class RuleBasedDailyTasksSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
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

function parseScheduleRule(input) {
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
    period,
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

function normalizeFolder(folder) {
  const normalized = normalizePath(folder.trim());
  return normalized === "/" || normalized === "." ? "" : normalized.replace(/^\/+|\/+$/g, "");
}

function indentationWidth(value) {
  return value.replace(/\t/g, "    ").length;
}

function isValidDate(value) {
  return moment(value, DATE_FORMAT, true).isValid();
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

module.exports = RuleBasedDailyTasksPlugin;
