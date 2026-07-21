"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ProjectDocsBridgePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  sourceRoot: "..",
  mirrorRoot: "doc",
  excludePatterns: [".git/**", "node_modules/**", "**/.obsidian/**", ".project-docs-trash/**"],
  assetExtensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf"],
  syncOnStartup: true,
  watchForChanges: true,
  debounceMs: 750
};
var ProjectDocsBridgeSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Project Docs Bridge" });
    new import_obsidian.Setting(containerEl).setName("Source root").setDesc(this.plugin.sourcePathDescription()).addText((text) => text.setValue(this.plugin.settings.sourceRoot).onChange(async (value) => this.plugin.updateSettings({ sourceRoot: value })));
    new import_obsidian.Setting(containerEl).setName("Mirror root").setDesc("Relative folder inside this vault.").addText((text) => text.setValue(this.plugin.settings.mirrorRoot).onChange(async (value) => this.plugin.updateSettings({ mirrorRoot: value })));
    new import_obsidian.Setting(containerEl).setName("Ignore patterns").setDesc("One glob per line.").addTextArea((text) => text.setValue(this.plugin.settings.excludePatterns.join("\n")).onChange(async (value) => this.plugin.updateSettings({ excludePatterns: value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) })));
    new import_obsidian.Setting(containerEl).setName("Attachment extensions").setDesc("Comma-separated image/PDF extensions.").addText((text) => text.setValue(this.plugin.settings.assetExtensions.join(", ")).onChange(async (value) => this.plugin.updateSettings({ assetExtensions: value.split(",").map((item) => item.trim().replace(/^\./, "")).filter(Boolean) })));
    new import_obsidian.Setting(containerEl).setName("Sync on startup").addToggle((toggle) => toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => this.plugin.updateSettings({ syncOnStartup: value })));
    new import_obsidian.Setting(containerEl).setName("Watch for changes").addToggle((toggle) => toggle.setValue(this.plugin.settings.watchForChanges).onChange(async (value) => this.plugin.updateSettings({ watchForChanges: value })));
    new import_obsidian.Setting(containerEl).setName("Debounce (ms)").addText((text) => text.setValue(String(this.plugin.settings.debounceMs)).onChange(async (value) => this.plugin.updateSettings({ debounceMs: Math.max(100, Number(value) || DEFAULT_SETTINGS.debounceMs) })));
    new import_obsidian.Setting(containerEl).setName("Status").setDesc(this.plugin.statusDescription());
    new import_obsidian.Setting(containerEl).addButton((button) => button.setButtonText("Validate configuration").onClick(() => this.plugin.validateConfiguration()));
    new import_obsidian.Setting(containerEl).addButton((button) => button.setButtonText("Initialize mirror").setCta().onClick(() => this.plugin.initializeMirror()));
    new import_obsidian.Setting(containerEl).addButton((button) => button.setButtonText("Sync now").onClick(() => this.plugin.syncNow()));
    new import_obsidian.Setting(containerEl).addButton((button) => button.setButtonText(this.plugin.paused ? "Resume" : "Pause").onClick(() => this.plugin.togglePause()));
    new import_obsidian.Setting(containerEl).addButton((button) => button.setButtonText("Open conflicts").onClick(() => this.plugin.openConflicts()));
  }
};

// src/path-policy.ts
var path = __toESM(require("node:path"));
var MANDATORY_IGNORE_PATTERNS = ["**/.git/**", "**/node_modules/**", "**/.obsidian/**", ".project-docs-trash/**", "_project-docs-conflicts/**"];
var CONFLICT_NAMESPACE = "_project-docs-conflicts";
function normalizeMirrorPath(value) {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  if (!normalized || normalized === "." || normalized === "/" || normalized.startsWith("/") || parts.some((part) => part === ".." || !part || part === ".obsidian" || part === CONFLICT_NAMESPACE)) return null;
  return normalized;
}
function createPathPolicy(vaultRoot, sourceSetting, mirrorSetting, platform = process.platform) {
  const mirrorRoot = normalizeMirrorPath(mirrorSetting);
  if (!mirrorRoot) return null;
  const pathApi = platform === "win32" ? path.win32 : path;
  const sourceRoot = pathApi.resolve(vaultRoot, sourceSetting);
  const canonicalVault = normalizeFsPath(pathApi.resolve(vaultRoot), platform);
  const canonicalSource = normalizeFsPath(sourceRoot, platform);
  if (canonicalVault === canonicalSource || !isPathInside(canonicalSource, canonicalVault, platform)) return null;
  return { vaultRoot: pathApi.resolve(vaultRoot), sourceRoot, mirrorRoot, caseInsensitive: platform === "win32" };
}
function sourceRelative(policy, absolutePath, platform = process.platform) {
  const pathApi = platform === "win32" ? path.win32 : path;
  if (!isPathInside(policy.sourceRoot, absolutePath, platform) || isPathInsideOrEqual(policy.vaultRoot, absolutePath, platform)) return null;
  const relative3 = pathApi.relative(policy.sourceRoot, absolutePath).replace(/\\/g, "/");
  return relative3 && !relative3.startsWith("../") && relative3 !== ".." ? relative3 : null;
}
function sourcePath(policy, relativePath, platform = process.platform) {
  const pathApi = platform === "win32" ? path.win32 : path;
  const candidate = pathApi.resolve(policy.sourceRoot, relativePath);
  return sourceRelative(policy, candidate, platform) === relativePath.replace(/\\/g, "/") ? candidate : null;
}
function mirrorRelative(policy, vaultPath) {
  const normalized = vaultPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const prefix = `${policy.mirrorRoot}/`;
  const comparablePath = policy.caseInsensitive ? normalized.toLowerCase() : normalized;
  const comparablePrefix = policy.caseInsensitive ? prefix.toLowerCase() : prefix;
  if (!comparablePath.startsWith(comparablePrefix)) return null;
  const relative3 = normalized.slice(prefix.length);
  return relative3 && !isReservedMirrorPath(relative3) ? relative3 : null;
}
function manifestKey(relativePath, caseInsensitive) {
  const key = relativePath.replace(/\\/g, "/");
  return caseInsensitive ? key.toLowerCase() : key;
}
function isIgnored(relativePath, patterns) {
  const value = relativePath.replace(/\\/g, "/");
  return [...MANDATORY_IGNORE_PATTERNS, ...patterns].some((pattern) => matchesGlob(pattern.replace(/\\/g, "/"), value));
}
function findCaseCollisions(paths, caseInsensitive) {
  var _a;
  if (!caseInsensitive) return [];
  const groups = /* @__PURE__ */ new Map();
  for (const value of paths) {
    const key = manifestKey(value, true);
    groups.set(key, [...(_a = groups.get(key)) != null ? _a : [], value]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
function isReservedMirrorPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return normalized === CONFLICT_NAMESPACE || normalized.startsWith(`${CONFLICT_NAMESPACE}/`);
}
function isPathInside(parent, candidate, platform = process.platform) {
  const pathApi = platform === "win32" ? path.win32 : path;
  const normalizedParent = normalizeFsPath(pathApi.resolve(parent), platform);
  const normalizedCandidate = normalizeFsPath(pathApi.resolve(candidate), platform);
  const relative3 = pathApi.relative(normalizedParent, normalizedCandidate);
  return relative3 !== "" && !relative3.startsWith("..") && !pathApi.isAbsolute(relative3);
}
function isPathInsideOrEqual(parent, candidate, platform = process.platform) {
  const pathApi = platform === "win32" ? path.win32 : path;
  const normalizedParent = normalizeFsPath(pathApi.resolve(parent), platform);
  const normalizedCandidate = normalizeFsPath(pathApi.resolve(candidate), platform);
  return normalizedParent === normalizedCandidate || isPathInside(normalizedParent, normalizedCandidate, platform);
}
function normalizeFsPath(value, platform) {
  return platform === "win32" ? value.toLowerCase() : value;
}
function matchesGlob(pattern, value) {
  const patternParts = pattern.toLowerCase().split("/");
  const valueParts = value.toLowerCase().split("/");
  const match = (patternIndex, valueIndex) => {
    if (patternIndex === patternParts.length) return valueIndex === valueParts.length;
    if (patternParts[patternIndex] === "**") {
      for (let index = valueIndex; index <= valueParts.length; index += 1) if (match(patternIndex + 1, index)) return true;
      return false;
    }
    if (valueIndex === valueParts.length || !segmentMatches(patternParts[patternIndex], valueParts[valueIndex])) return false;
    return match(patternIndex + 1, valueIndex + 1);
  };
  return match(0, 0);
}
function segmentMatches(pattern, value) {
  const expression = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${expression}$`).test(value);
}

// src/source-store.ts
var import_node_crypto = require("node:crypto");
var import_promises = require("node:fs/promises");
var path2 = __toESM(require("node:path"));
function sha256(value) {
  return (0, import_node_crypto.createHash)("sha256").update(value).digest("hex");
}
var SourceStore = class {
  constructor(policy, ignores, assetExtensions) {
    this.policy = policy;
    this.ignores = ignores;
    this.assetExtensions = assetExtensions;
  }
  async scan() {
    await this.sourceRoot();
    const result = [];
    await this.scanDirectory(this.policy.sourceRoot, result);
    return result;
  }
  async read(relativePath) {
    const target = await this.target(relativePath, true);
    return (0, import_promises.readFile)(target);
  }
  async hash(relativePath) {
    try {
      const target = await this.target(relativePath, true);
      const before = await (0, import_promises.stat)(target);
      const content = await this.read(relativePath);
      await this.target(relativePath, true);
      const after = await (0, import_promises.stat)(target);
      if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) return null;
      return sha256(content);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }
  async writeAtomic(relativePath, content) {
    const target = await this.target(relativePath);
    await (0, import_promises.mkdir)(path2.dirname(target), { recursive: true });
    await this.target(relativePath);
    const temporary = `${target}.project-docs-${process.pid}-${Date.now()}.tmp`;
    const temporaryRelative = sourceRelative(this.policy, temporary);
    if (!temporaryRelative) throw new Error(`Unsafe temporary source path: ${temporary}`);
    try {
      await this.target(temporaryRelative);
      const handle = await (0, import_promises.open)(temporary, "wx");
      try {
        await handle.writeFile(content);
      } finally {
        await handle.close();
      }
    } catch (error) {
      await this.cleanupTemporary(temporary, temporaryRelative);
      throw error;
    }
    try {
      await this.target(temporaryRelative, true);
      await this.target(relativePath);
      await (0, import_promises.rename)(temporary, target);
    } catch (error) {
      if (process.platform === "win32" && isRetryableWindowsError(error)) {
        await new Promise((resolve4) => setTimeout(resolve4, 50));
        try {
          await this.target(temporaryRelative, true);
          await this.target(relativePath);
          await (0, import_promises.rename)(temporary, target);
        } catch (retryError) {
          await this.cleanupTemporary(temporary, temporaryRelative);
          throw retryError;
        }
      } else {
        await this.cleanupTemporary(temporary, temporaryRelative);
        throw error;
      }
    }
    return sha256(content);
  }
  async moveToQuarantine(relativePath) {
    const source = await this.target(relativePath, true);
    const quarantineRelative = path2.posix.join(".project-docs-trash", safeTimestamp(), relativePath.replace(/\\/g, "/"));
    const destination = await this.target(quarantineRelative, false, true);
    await (0, import_promises.mkdir)(path2.dirname(destination), { recursive: true });
    await this.target(quarantineRelative, false, true);
    await this.target(relativePath, true);
    await (0, import_promises.rename)(source, destination);
  }
  async rename(relativeFrom, relativeTo) {
    const from = await this.target(relativeFrom, true);
    const to = await this.target(relativeTo);
    await (0, import_promises.mkdir)(path2.dirname(to), { recursive: true });
    await this.target(relativeTo);
    await this.target(relativeFrom, true);
    if (process.platform === "win32" && from.toLowerCase() === to.toLowerCase() && from !== to) {
      const temporary = `${from}.project-docs-case-${Date.now()}`;
      const temporaryRelative = sourceRelative(this.policy, temporary);
      if (!temporaryRelative) throw new Error(`Unsafe temporary source path: ${temporary}`);
      await this.target(temporaryRelative);
      await this.target(relativeFrom, true);
      await (0, import_promises.rename)(from, temporary);
      try {
        await this.target(temporaryRelative, true);
        await this.target(relativeTo);
        await (0, import_promises.rename)(temporary, to);
      } catch (error) {
        try {
          await this.target(temporaryRelative, true);
          await this.target(relativeFrom);
          await (0, import_promises.rename)(temporary, from);
        } catch (e) {
        }
        throw error;
      }
      return;
    }
    await (0, import_promises.rename)(from, to);
  }
  async exists(relativePath) {
    return await this.hash(relativePath) !== null;
  }
  async scanDirectory(directory, result) {
    const relativeDirectory = sourceRelative(this.policy, directory);
    if (relativeDirectory) await this.target(relativeDirectory, true);
    else await this.sourceRoot();
    for (const entry of await (0, import_promises.readdir)(directory, { withFileTypes: true })) {
      const absolute = path2.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      const relativePath = sourceRelative(this.policy, absolute);
      if (relativePath === null || isIgnored(relativePath, this.ignores)) continue;
      if (entry.isDirectory()) {
        await this.scanDirectory(absolute, result);
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = fileKind(relativePath, this.assetExtensions);
      if (!kind) continue;
      const content = await this.read(relativePath);
      result.push({ relativePath, kind, hash: sha256(content) });
    }
  }
  async target(relativePath, mustExist = false, allowInternalPath = false) {
    if (!allowInternalPath && isIgnored(relativePath, this.ignores)) throw new Error(`Ignored source path: ${relativePath}`);
    const target = sourcePath(this.policy, relativePath);
    if (!target) throw new Error(`Unsafe source path: ${relativePath}`);
    const roots = await this.roots();
    const parent = await this.existingParent(target);
    this.assertInsideSource(parent, roots, target);
    try {
      const metadata = await (0, import_promises.lstat)(target);
      if (metadata.isSymbolicLink()) throw new Error(`Symlinked source path: ${relativePath}`);
      this.assertInsideSource(await (0, import_promises.realpath)(target), roots, target);
    } catch (error) {
      if (!isMissing(error)) throw error;
      if (mustExist) throw error;
    }
    return target;
  }
  async sourceRoot() {
    return (await this.roots()).sourceRoot;
  }
  async roots() {
    const sourceRoot = await (0, import_promises.realpath)(this.policy.sourceRoot);
    const vaultRoot = await (0, import_promises.realpath)(this.policy.vaultRoot);
    if (isPathInsideOrEqual(vaultRoot, sourceRoot) || !isPathInsideOrEqual(sourceRoot, vaultRoot)) throw new Error("Source root must contain, but not equal, the vault root");
    return { sourceRoot, vaultRoot };
  }
  async existingParent(target) {
    let current = path2.dirname(target);
    while (true) {
      try {
        return await (0, import_promises.realpath)(current);
      } catch (error) {
        if (!isMissing(error)) throw error;
        const parent = path2.dirname(current);
        if (parent === current) throw error;
        current = parent;
      }
    }
  }
  assertInsideSource(candidate, roots, target) {
    if (!isPathInsideOrEqual(roots.sourceRoot, candidate) || isPathInsideOrEqual(roots.vaultRoot, candidate)) throw new Error(`Source path escapes source root or enters vault: ${target}`);
  }
  async cleanupTemporary(temporary, temporaryRelative) {
    try {
      await this.target(temporaryRelative, true);
      await (0, import_promises.unlink)(temporary);
    } catch (e) {
    }
  }
};
function fileKind(relativePath, assetExtensions) {
  var _a;
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".excalidraw")) return "document";
  const extension = (_a = lower.split(".").pop()) != null ? _a : "";
  return assetExtensions.map((item) => item.toLowerCase()).includes(extension) ? "attachment" : null;
}
function safeTimestamp() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
}
function isMissing(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function isRetryableWindowsError(error) {
  var _a;
  return typeof error === "object" && error !== null && "code" in error && ["EPERM", "EACCES"].includes((_a = error.code) != null ? _a : "");
}

// src/vault-store.ts
var import_obsidian2 = require("obsidian");
var VaultStore = class {
  constructor(vault, fileManager, mirrorRoot) {
    this.vault = vault;
    this.fileManager = fileManager;
    const normalized = normalizeMirrorPath(mirrorRoot);
    if (!normalized) throw new Error(`Unsafe mirror root: ${mirrorRoot}`);
    this.mirrorRoot = normalized;
  }
  async read(relativePath) {
    const file = this.file(relativePath);
    return file ? new Uint8Array(await this.vault.readBinary(file)) : null;
  }
  async readConflictSnapshot(relativePath) {
    const file = this.file(relativePath, true);
    return file ? new Uint8Array(await this.vault.readBinary(file)) : null;
  }
  async hash(relativePath, hash) {
    const content = await this.read(relativePath);
    return content ? hash(content) : null;
  }
  async write(relativePath, content, kind, allowConflictNamespace = false) {
    const path5 = this.path(relativePath, allowConflictNamespace);
    await this.ensureParents(path5);
    const existing = this.vault.getAbstractFileByPath(path5);
    if (existing instanceof import_obsidian2.TFile) {
      await this.vault.modifyBinary(existing, toArrayBuffer(content));
      return;
    }
    await this.vault.createBinary(path5, toArrayBuffer(content));
  }
  async trash(relativePath) {
    const file = this.file(relativePath);
    if (file) await this.fileManager.trashFile(file);
  }
  async rename(relativeFrom, relativeTo) {
    const file = this.file(relativeFrom);
    if (!file) return;
    const destination = this.path(relativeTo);
    await this.ensureParents(destination);
    await this.vault.rename(file, destination);
  }
  listRelativeFiles() {
    const prefix = `${this.mirrorRoot}/`;
    return this.vault.getFiles().map((file) => file.path).filter((file) => file.startsWith(prefix) && !file.startsWith(`${this.mirrorRoot}/_project-docs-conflicts/`)).map((file) => file.slice(prefix.length));
  }
  file(relativePath, allowConflictNamespace = false) {
    const value = this.vault.getAbstractFileByPath(this.path(relativePath, allowConflictNamespace));
    return value instanceof import_obsidian2.TFile ? value : null;
  }
  path(relativePath, allowConflictNamespace = false) {
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Unsafe vault path: ${relativePath}`);
    if (!allowConflictNamespace && isReservedMirrorPath(normalized)) throw new Error(`Reserved vault path: ${relativePath}`);
    return (0, import_obsidian2.normalizePath)(`${this.mirrorRoot}/${normalized}`);
  }
  async ensureParents(filePath) {
    const parts = filePath.split("/");
    let current = "";
    for (const part of parts.slice(0, -1)) {
      current = current ? `${current}/${part}` : part;
      if (!this.vault.getAbstractFileByPath(current)) await this.vault.createFolder(current);
    }
  }
};
function toArrayBuffer(content) {
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return copy.buffer;
}

// src/sync-engine.ts
var path4 = __toESM(require("node:path"));

// ../../node_modules/chokidar/esm/index.js
var import_fs2 = require("fs");
var import_promises4 = require("fs/promises");
var import_events = require("events");
var sysPath2 = __toESM(require("path"), 1);

// ../../node_modules/readdirp/esm/index.js
var import_promises2 = require("node:fs/promises");
var import_node_stream = require("node:stream");
var import_node_path = require("node:path");
var EntryTypes = {
  FILE_TYPE: "files",
  DIR_TYPE: "directories",
  FILE_DIR_TYPE: "files_directories",
  EVERYTHING_TYPE: "all"
};
var defaultOptions = {
  root: ".",
  fileFilter: (_entryInfo) => true,
  directoryFilter: (_entryInfo) => true,
  type: EntryTypes.FILE_TYPE,
  lstat: false,
  depth: 2147483648,
  alwaysStat: false,
  highWaterMark: 4096
};
Object.freeze(defaultOptions);
var RECURSIVE_ERROR_CODE = "READDIRP_RECURSIVE_ERROR";
var NORMAL_FLOW_ERRORS = /* @__PURE__ */ new Set(["ENOENT", "EPERM", "EACCES", "ELOOP", RECURSIVE_ERROR_CODE]);
var ALL_TYPES = [
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
];
var DIR_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.DIR_TYPE,
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE
]);
var FILE_TYPES = /* @__PURE__ */ new Set([
  EntryTypes.EVERYTHING_TYPE,
  EntryTypes.FILE_DIR_TYPE,
  EntryTypes.FILE_TYPE
]);
var isNormalFlowError = (error) => NORMAL_FLOW_ERRORS.has(error.code);
var wantBigintFsStats = process.platform === "win32";
var emptyFn = (_entryInfo) => true;
var normalizeFilter = (filter) => {
  if (filter === void 0)
    return emptyFn;
  if (typeof filter === "function")
    return filter;
  if (typeof filter === "string") {
    const fl = filter.trim();
    return (entry) => entry.basename === fl;
  }
  if (Array.isArray(filter)) {
    const trItems = filter.map((item) => item.trim());
    return (entry) => trItems.some((f) => entry.basename === f);
  }
  return emptyFn;
};
var ReaddirpStream = class extends import_node_stream.Readable {
  constructor(options = {}) {
    var _a;
    super({
      objectMode: true,
      autoDestroy: true,
      highWaterMark: options.highWaterMark
    });
    const opts = { ...defaultOptions, ...options };
    const { root, type } = opts;
    this._fileFilter = normalizeFilter(opts.fileFilter);
    this._directoryFilter = normalizeFilter(opts.directoryFilter);
    const statMethod = opts.lstat ? import_promises2.lstat : import_promises2.stat;
    if (wantBigintFsStats) {
      this._stat = (path5) => statMethod(path5, { bigint: true });
    } else {
      this._stat = statMethod;
    }
    this._maxDepth = (_a = opts.depth) != null ? _a : defaultOptions.depth;
    this._wantsDir = type ? DIR_TYPES.has(type) : false;
    this._wantsFile = type ? FILE_TYPES.has(type) : false;
    this._wantsEverything = type === EntryTypes.EVERYTHING_TYPE;
    this._root = (0, import_node_path.resolve)(root);
    this._isDirent = !opts.alwaysStat;
    this._statsProp = this._isDirent ? "dirent" : "stats";
    this._rdOptions = { encoding: "utf8", withFileTypes: this._isDirent };
    this.parents = [this._exploreDir(root, 1)];
    this.reading = false;
    this.parent = void 0;
  }
  async _read(batch) {
    if (this.reading)
      return;
    this.reading = true;
    try {
      while (!this.destroyed && batch > 0) {
        const par = this.parent;
        const fil = par && par.files;
        if (fil && fil.length > 0) {
          const { path: path5, depth } = par;
          const slice = fil.splice(0, batch).map((dirent) => this._formatEntry(dirent, path5));
          const awaited = await Promise.all(slice);
          for (const entry of awaited) {
            if (!entry)
              continue;
            if (this.destroyed)
              return;
            const entryType = await this._getEntryType(entry);
            if (entryType === "directory" && this._directoryFilter(entry)) {
              if (depth <= this._maxDepth) {
                this.parents.push(this._exploreDir(entry.fullPath, depth + 1));
              }
              if (this._wantsDir) {
                this.push(entry);
                batch--;
              }
            } else if ((entryType === "file" || this._includeAsFile(entry)) && this._fileFilter(entry)) {
              if (this._wantsFile) {
                this.push(entry);
                batch--;
              }
            }
          }
        } else {
          const parent = this.parents.pop();
          if (!parent) {
            this.push(null);
            break;
          }
          this.parent = await parent;
          if (this.destroyed)
            return;
        }
      }
    } catch (error) {
      this.destroy(error);
    } finally {
      this.reading = false;
    }
  }
  async _exploreDir(path5, depth) {
    let files;
    try {
      files = await (0, import_promises2.readdir)(path5, this._rdOptions);
    } catch (error) {
      this._onError(error);
    }
    return { files, depth, path: path5 };
  }
  async _formatEntry(dirent, path5) {
    let entry;
    const basename3 = this._isDirent ? dirent.name : dirent;
    try {
      const fullPath = (0, import_node_path.resolve)((0, import_node_path.join)(path5, basename3));
      entry = { path: (0, import_node_path.relative)(this._root, fullPath), fullPath, basename: basename3 };
      entry[this._statsProp] = this._isDirent ? dirent : await this._stat(fullPath);
    } catch (err) {
      this._onError(err);
      return;
    }
    return entry;
  }
  _onError(err) {
    if (isNormalFlowError(err) && !this.destroyed) {
      this.emit("warn", err);
    } else {
      this.destroy(err);
    }
  }
  async _getEntryType(entry) {
    if (!entry && this._statsProp in entry) {
      return "";
    }
    const stats = entry[this._statsProp];
    if (stats.isFile())
      return "file";
    if (stats.isDirectory())
      return "directory";
    if (stats && stats.isSymbolicLink()) {
      const full = entry.fullPath;
      try {
        const entryRealPath = await (0, import_promises2.realpath)(full);
        const entryRealPathStats = await (0, import_promises2.lstat)(entryRealPath);
        if (entryRealPathStats.isFile()) {
          return "file";
        }
        if (entryRealPathStats.isDirectory()) {
          const len = entryRealPath.length;
          if (full.startsWith(entryRealPath) && full.substr(len, 1) === import_node_path.sep) {
            const recursiveError = new Error(`Circular symlink detected: "${full}" points to "${entryRealPath}"`);
            recursiveError.code = RECURSIVE_ERROR_CODE;
            return this._onError(recursiveError);
          }
          return "directory";
        }
      } catch (error) {
        this._onError(error);
        return "";
      }
    }
  }
  _includeAsFile(entry) {
    const stats = entry && entry[this._statsProp];
    return stats && this._wantsEverything && !stats.isDirectory();
  }
};
function readdirp(root, options = {}) {
  let type = options.entryType || options.type;
  if (type === "both")
    type = EntryTypes.FILE_DIR_TYPE;
  if (type)
    options.type = type;
  if (!root) {
    throw new Error("readdirp: root argument is required. Usage: readdirp(root, options)");
  } else if (typeof root !== "string") {
    throw new TypeError("readdirp: root argument must be a string. Usage: readdirp(root, options)");
  } else if (type && !ALL_TYPES.includes(type)) {
    throw new Error(`readdirp: Invalid type passed. Use one of ${ALL_TYPES.join(", ")}`);
  }
  options.root = root;
  return new ReaddirpStream(options);
}

// ../../node_modules/chokidar/esm/handler.js
var import_fs = require("fs");
var import_promises3 = require("fs/promises");
var sysPath = __toESM(require("path"), 1);
var import_os = require("os");
var STR_DATA = "data";
var STR_END = "end";
var STR_CLOSE = "close";
var EMPTY_FN = () => {
};
var pl = process.platform;
var isWindows = pl === "win32";
var isMacos = pl === "darwin";
var isLinux = pl === "linux";
var isFreeBSD = pl === "freebsd";
var isIBMi = (0, import_os.type)() === "OS400";
var EVENTS = {
  ALL: "all",
  READY: "ready",
  ADD: "add",
  CHANGE: "change",
  ADD_DIR: "addDir",
  UNLINK: "unlink",
  UNLINK_DIR: "unlinkDir",
  RAW: "raw",
  ERROR: "error"
};
var EV = EVENTS;
var THROTTLE_MODE_WATCH = "watch";
var statMethods = { lstat: import_promises3.lstat, stat: import_promises3.stat };
var KEY_LISTENERS = "listeners";
var KEY_ERR = "errHandlers";
var KEY_RAW = "rawEmitters";
var HANDLER_KEYS = [KEY_LISTENERS, KEY_ERR, KEY_RAW];
var binaryExtensions = /* @__PURE__ */ new Set([
  "3dm",
  "3ds",
  "3g2",
  "3gp",
  "7z",
  "a",
  "aac",
  "adp",
  "afdesign",
  "afphoto",
  "afpub",
  "ai",
  "aif",
  "aiff",
  "alz",
  "ape",
  "apk",
  "appimage",
  "ar",
  "arj",
  "asf",
  "au",
  "avi",
  "bak",
  "baml",
  "bh",
  "bin",
  "bk",
  "bmp",
  "btif",
  "bz2",
  "bzip2",
  "cab",
  "caf",
  "cgm",
  "class",
  "cmx",
  "cpio",
  "cr2",
  "cur",
  "dat",
  "dcm",
  "deb",
  "dex",
  "djvu",
  "dll",
  "dmg",
  "dng",
  "doc",
  "docm",
  "docx",
  "dot",
  "dotm",
  "dra",
  "DS_Store",
  "dsk",
  "dts",
  "dtshd",
  "dvb",
  "dwg",
  "dxf",
  "ecelp4800",
  "ecelp7470",
  "ecelp9600",
  "egg",
  "eol",
  "eot",
  "epub",
  "exe",
  "f4v",
  "fbs",
  "fh",
  "fla",
  "flac",
  "flatpak",
  "fli",
  "flv",
  "fpx",
  "fst",
  "fvt",
  "g3",
  "gh",
  "gif",
  "graffle",
  "gz",
  "gzip",
  "h261",
  "h263",
  "h264",
  "icns",
  "ico",
  "ief",
  "img",
  "ipa",
  "iso",
  "jar",
  "jpeg",
  "jpg",
  "jpgv",
  "jpm",
  "jxr",
  "key",
  "ktx",
  "lha",
  "lib",
  "lvp",
  "lz",
  "lzh",
  "lzma",
  "lzo",
  "m3u",
  "m4a",
  "m4v",
  "mar",
  "mdi",
  "mht",
  "mid",
  "midi",
  "mj2",
  "mka",
  "mkv",
  "mmr",
  "mng",
  "mobi",
  "mov",
  "movie",
  "mp3",
  "mp4",
  "mp4a",
  "mpeg",
  "mpg",
  "mpga",
  "mxu",
  "nef",
  "npx",
  "numbers",
  "nupkg",
  "o",
  "odp",
  "ods",
  "odt",
  "oga",
  "ogg",
  "ogv",
  "otf",
  "ott",
  "pages",
  "pbm",
  "pcx",
  "pdb",
  "pdf",
  "pea",
  "pgm",
  "pic",
  "png",
  "pnm",
  "pot",
  "potm",
  "potx",
  "ppa",
  "ppam",
  "ppm",
  "pps",
  "ppsm",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
  "psd",
  "pya",
  "pyc",
  "pyo",
  "pyv",
  "qt",
  "rar",
  "ras",
  "raw",
  "resources",
  "rgb",
  "rip",
  "rlc",
  "rmf",
  "rmvb",
  "rpm",
  "rtf",
  "rz",
  "s3m",
  "s7z",
  "scpt",
  "sgi",
  "shar",
  "snap",
  "sil",
  "sketch",
  "slk",
  "smv",
  "snk",
  "so",
  "stl",
  "suo",
  "sub",
  "swf",
  "tar",
  "tbz",
  "tbz2",
  "tga",
  "tgz",
  "thmx",
  "tif",
  "tiff",
  "tlz",
  "ttc",
  "ttf",
  "txz",
  "udf",
  "uvh",
  "uvi",
  "uvm",
  "uvp",
  "uvs",
  "uvu",
  "viv",
  "vob",
  "war",
  "wav",
  "wax",
  "wbmp",
  "wdp",
  "weba",
  "webm",
  "webp",
  "whl",
  "wim",
  "wm",
  "wma",
  "wmv",
  "wmx",
  "woff",
  "woff2",
  "wrm",
  "wvx",
  "xbm",
  "xif",
  "xla",
  "xlam",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  "xlt",
  "xltm",
  "xltx",
  "xm",
  "xmind",
  "xpi",
  "xpm",
  "xwd",
  "xz",
  "z",
  "zip",
  "zipx"
]);
var isBinaryPath = (filePath) => binaryExtensions.has(sysPath.extname(filePath).slice(1).toLowerCase());
var foreach = (val, fn) => {
  if (val instanceof Set) {
    val.forEach(fn);
  } else {
    fn(val);
  }
};
var addAndConvert = (main, prop, item) => {
  let container = main[prop];
  if (!(container instanceof Set)) {
    main[prop] = container = /* @__PURE__ */ new Set([container]);
  }
  container.add(item);
};
var clearItem = (cont) => (key) => {
  const set = cont[key];
  if (set instanceof Set) {
    set.clear();
  } else {
    delete cont[key];
  }
};
var delFromSet = (main, prop, item) => {
  const container = main[prop];
  if (container instanceof Set) {
    container.delete(item);
  } else if (container === item) {
    delete main[prop];
  }
};
var isEmptySet = (val) => val instanceof Set ? val.size === 0 : !val;
var FsWatchInstances = /* @__PURE__ */ new Map();
function createFsWatchInstance(path5, options, listener, errHandler, emitRaw) {
  const handleEvent = (rawEvent, evPath) => {
    listener(path5);
    emitRaw(rawEvent, evPath, { watchedPath: path5 });
    if (evPath && path5 !== evPath) {
      fsWatchBroadcast(sysPath.resolve(path5, evPath), KEY_LISTENERS, sysPath.join(path5, evPath));
    }
  };
  try {
    return (0, import_fs.watch)(path5, {
      persistent: options.persistent
    }, handleEvent);
  } catch (error) {
    errHandler(error);
    return void 0;
  }
}
var fsWatchBroadcast = (fullPath, listenerType, val1, val2, val3) => {
  const cont = FsWatchInstances.get(fullPath);
  if (!cont)
    return;
  foreach(cont[listenerType], (listener) => {
    listener(val1, val2, val3);
  });
};
var setFsWatchListener = (path5, fullPath, options, handlers) => {
  const { listener, errHandler, rawEmitter } = handlers;
  let cont = FsWatchInstances.get(fullPath);
  let watcher;
  if (!options.persistent) {
    watcher = createFsWatchInstance(path5, options, listener, errHandler, rawEmitter);
    if (!watcher)
      return;
    return watcher.close.bind(watcher);
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_ERR, errHandler);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    watcher = createFsWatchInstance(
      path5,
      options,
      fsWatchBroadcast.bind(null, fullPath, KEY_LISTENERS),
      errHandler,
      // no need to use broadcast here
      fsWatchBroadcast.bind(null, fullPath, KEY_RAW)
    );
    if (!watcher)
      return;
    watcher.on(EV.ERROR, async (error) => {
      const broadcastErr = fsWatchBroadcast.bind(null, fullPath, KEY_ERR);
      if (cont)
        cont.watcherUnusable = true;
      if (isWindows && error.code === "EPERM") {
        try {
          const fd = await (0, import_promises3.open)(path5, "r");
          await fd.close();
          broadcastErr(error);
        } catch (err) {
        }
      } else {
        broadcastErr(error);
      }
    });
    cont = {
      listeners: listener,
      errHandlers: errHandler,
      rawEmitters: rawEmitter,
      watcher
    };
    FsWatchInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_ERR, errHandler);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      cont.watcher.close();
      FsWatchInstances.delete(fullPath);
      HANDLER_KEYS.forEach(clearItem(cont));
      cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
var FsWatchFileInstances = /* @__PURE__ */ new Map();
var setFsWatchFileListener = (path5, fullPath, options, handlers) => {
  const { listener, rawEmitter } = handlers;
  let cont = FsWatchFileInstances.get(fullPath);
  const copts = cont && cont.options;
  if (copts && (copts.persistent < options.persistent || copts.interval > options.interval)) {
    (0, import_fs.unwatchFile)(fullPath);
    cont = void 0;
  }
  if (cont) {
    addAndConvert(cont, KEY_LISTENERS, listener);
    addAndConvert(cont, KEY_RAW, rawEmitter);
  } else {
    cont = {
      listeners: listener,
      rawEmitters: rawEmitter,
      options,
      watcher: (0, import_fs.watchFile)(fullPath, options, (curr, prev) => {
        foreach(cont.rawEmitters, (rawEmitter2) => {
          rawEmitter2(EV.CHANGE, fullPath, { curr, prev });
        });
        const currmtime = curr.mtimeMs;
        if (curr.size !== prev.size || currmtime > prev.mtimeMs || currmtime === 0) {
          foreach(cont.listeners, (listener2) => listener2(path5, curr));
        }
      })
    };
    FsWatchFileInstances.set(fullPath, cont);
  }
  return () => {
    delFromSet(cont, KEY_LISTENERS, listener);
    delFromSet(cont, KEY_RAW, rawEmitter);
    if (isEmptySet(cont.listeners)) {
      FsWatchFileInstances.delete(fullPath);
      (0, import_fs.unwatchFile)(fullPath);
      cont.options = cont.watcher = void 0;
      Object.freeze(cont);
    }
  };
};
var NodeFsHandler = class {
  constructor(fsW) {
    this.fsw = fsW;
    this._boundHandleError = (error) => fsW._handleError(error);
  }
  /**
   * Watch file for changes with fs_watchFile or fs_watch.
   * @param path to file or dir
   * @param listener on fs change
   * @returns closer for the watcher instance
   */
  _watchWithNodeFs(path5, listener) {
    const opts = this.fsw.options;
    const directory = sysPath.dirname(path5);
    const basename3 = sysPath.basename(path5);
    const parent = this.fsw._getWatchedDir(directory);
    parent.add(basename3);
    const absolutePath = sysPath.resolve(path5);
    const options = {
      persistent: opts.persistent
    };
    if (!listener)
      listener = EMPTY_FN;
    let closer;
    if (opts.usePolling) {
      const enableBin = opts.interval !== opts.binaryInterval;
      options.interval = enableBin && isBinaryPath(basename3) ? opts.binaryInterval : opts.interval;
      closer = setFsWatchFileListener(path5, absolutePath, options, {
        listener,
        rawEmitter: this.fsw._emitRaw
      });
    } else {
      closer = setFsWatchListener(path5, absolutePath, options, {
        listener,
        errHandler: this._boundHandleError,
        rawEmitter: this.fsw._emitRaw
      });
    }
    return closer;
  }
  /**
   * Watch a file and emit add event if warranted.
   * @returns closer for the watcher instance
   */
  _handleFile(file, stats, initialAdd) {
    if (this.fsw.closed) {
      return;
    }
    const dirname4 = sysPath.dirname(file);
    const basename3 = sysPath.basename(file);
    const parent = this.fsw._getWatchedDir(dirname4);
    let prevStats = stats;
    if (parent.has(basename3))
      return;
    const listener = async (path5, newStats) => {
      if (!this.fsw._throttle(THROTTLE_MODE_WATCH, file, 5))
        return;
      if (!newStats || newStats.mtimeMs === 0) {
        try {
          const newStats2 = await (0, import_promises3.stat)(file);
          if (this.fsw.closed)
            return;
          const at = newStats2.atimeMs;
          const mt = newStats2.mtimeMs;
          if (!at || at <= mt || mt !== prevStats.mtimeMs) {
            this.fsw._emit(EV.CHANGE, file, newStats2);
          }
          if ((isMacos || isLinux || isFreeBSD) && prevStats.ino !== newStats2.ino) {
            this.fsw._closeFile(path5);
            prevStats = newStats2;
            const closer2 = this._watchWithNodeFs(file, listener);
            if (closer2)
              this.fsw._addPathCloser(path5, closer2);
          } else {
            prevStats = newStats2;
          }
        } catch (error) {
          this.fsw._remove(dirname4, basename3);
        }
      } else if (parent.has(basename3)) {
        const at = newStats.atimeMs;
        const mt = newStats.mtimeMs;
        if (!at || at <= mt || mt !== prevStats.mtimeMs) {
          this.fsw._emit(EV.CHANGE, file, newStats);
        }
        prevStats = newStats;
      }
    };
    const closer = this._watchWithNodeFs(file, listener);
    if (!(initialAdd && this.fsw.options.ignoreInitial) && this.fsw._isntIgnored(file)) {
      if (!this.fsw._throttle(EV.ADD, file, 0))
        return;
      this.fsw._emit(EV.ADD, file, stats);
    }
    return closer;
  }
  /**
   * Handle symlinks encountered while reading a dir.
   * @param entry returned by readdirp
   * @param directory path of dir being read
   * @param path of this item
   * @param item basename of this item
   * @returns true if no more processing is needed for this entry.
   */
  async _handleSymlink(entry, directory, path5, item) {
    if (this.fsw.closed) {
      return;
    }
    const full = entry.fullPath;
    const dir = this.fsw._getWatchedDir(directory);
    if (!this.fsw.options.followSymlinks) {
      this.fsw._incrReadyCount();
      let linkPath;
      try {
        linkPath = await (0, import_promises3.realpath)(path5);
      } catch (e) {
        this.fsw._emitReady();
        return true;
      }
      if (this.fsw.closed)
        return;
      if (dir.has(item)) {
        if (this.fsw._symlinkPaths.get(full) !== linkPath) {
          this.fsw._symlinkPaths.set(full, linkPath);
          this.fsw._emit(EV.CHANGE, path5, entry.stats);
        }
      } else {
        dir.add(item);
        this.fsw._symlinkPaths.set(full, linkPath);
        this.fsw._emit(EV.ADD, path5, entry.stats);
      }
      this.fsw._emitReady();
      return true;
    }
    if (this.fsw._symlinkPaths.has(full)) {
      return true;
    }
    this.fsw._symlinkPaths.set(full, true);
  }
  _handleRead(directory, initialAdd, wh, target, dir, depth, throttler) {
    directory = sysPath.join(directory, "");
    throttler = this.fsw._throttle("readdir", directory, 1e3);
    if (!throttler)
      return;
    const previous = this.fsw._getWatchedDir(wh.path);
    const current = /* @__PURE__ */ new Set();
    let stream = this.fsw._readdirp(directory, {
      fileFilter: (entry) => wh.filterPath(entry),
      directoryFilter: (entry) => wh.filterDir(entry)
    });
    if (!stream)
      return;
    stream.on(STR_DATA, async (entry) => {
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      const item = entry.path;
      let path5 = sysPath.join(directory, item);
      current.add(item);
      if (entry.stats.isSymbolicLink() && await this._handleSymlink(entry, directory, path5, item)) {
        return;
      }
      if (this.fsw.closed) {
        stream = void 0;
        return;
      }
      if (item === target || !target && !previous.has(item)) {
        this.fsw._incrReadyCount();
        path5 = sysPath.join(dir, sysPath.relative(dir, path5));
        this._addToNodeFs(path5, initialAdd, wh, depth + 1);
      }
    }).on(EV.ERROR, this._boundHandleError);
    return new Promise((resolve4, reject) => {
      if (!stream)
        return reject();
      stream.once(STR_END, () => {
        if (this.fsw.closed) {
          stream = void 0;
          return;
        }
        const wasThrottled = throttler ? throttler.clear() : false;
        resolve4(void 0);
        previous.getChildren().filter((item) => {
          return item !== directory && !current.has(item);
        }).forEach((item) => {
          this.fsw._remove(directory, item);
        });
        stream = void 0;
        if (wasThrottled)
          this._handleRead(directory, false, wh, target, dir, depth, throttler);
      });
    });
  }
  /**
   * Read directory to add / remove files from `@watched` list and re-read it on change.
   * @param dir fs path
   * @param stats
   * @param initialAdd
   * @param depth relative to user-supplied path
   * @param target child path targeted for watch
   * @param wh Common watch helpers for this path
   * @param realpath
   * @returns closer for the watcher instance.
   */
  async _handleDir(dir, stats, initialAdd, depth, target, wh, realpath3) {
    const parentDir = this.fsw._getWatchedDir(sysPath.dirname(dir));
    const tracked = parentDir.has(sysPath.basename(dir));
    if (!(initialAdd && this.fsw.options.ignoreInitial) && !target && !tracked) {
      this.fsw._emit(EV.ADD_DIR, dir, stats);
    }
    parentDir.add(sysPath.basename(dir));
    this.fsw._getWatchedDir(dir);
    let throttler;
    let closer;
    const oDepth = this.fsw.options.depth;
    if ((oDepth == null || depth <= oDepth) && !this.fsw._symlinkPaths.has(realpath3)) {
      if (!target) {
        await this._handleRead(dir, initialAdd, wh, target, dir, depth, throttler);
        if (this.fsw.closed)
          return;
      }
      closer = this._watchWithNodeFs(dir, (dirPath, stats2) => {
        if (stats2 && stats2.mtimeMs === 0)
          return;
        this._handleRead(dirPath, false, wh, target, dir, depth, throttler);
      });
    }
    return closer;
  }
  /**
   * Handle added file, directory, or glob pattern.
   * Delegates call to _handleFile / _handleDir after checks.
   * @param path to file or ir
   * @param initialAdd was the file added at watch instantiation?
   * @param priorWh depth relative to user-supplied path
   * @param depth Child path actually targeted for watch
   * @param target Child path actually targeted for watch
   */
  async _addToNodeFs(path5, initialAdd, priorWh, depth, target) {
    const ready = this.fsw._emitReady;
    if (this.fsw._isIgnored(path5) || this.fsw.closed) {
      ready();
      return false;
    }
    const wh = this.fsw._getWatchHelpers(path5);
    if (priorWh) {
      wh.filterPath = (entry) => priorWh.filterPath(entry);
      wh.filterDir = (entry) => priorWh.filterDir(entry);
    }
    try {
      const stats = await statMethods[wh.statMethod](wh.watchPath);
      if (this.fsw.closed)
        return;
      if (this.fsw._isIgnored(wh.watchPath, stats)) {
        ready();
        return false;
      }
      const follow = this.fsw.options.followSymlinks;
      let closer;
      if (stats.isDirectory()) {
        const absPath = sysPath.resolve(path5);
        const targetPath = follow ? await (0, import_promises3.realpath)(path5) : path5;
        if (this.fsw.closed)
          return;
        closer = await this._handleDir(wh.watchPath, stats, initialAdd, depth, target, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (absPath !== targetPath && targetPath !== void 0) {
          this.fsw._symlinkPaths.set(absPath, targetPath);
        }
      } else if (stats.isSymbolicLink()) {
        const targetPath = follow ? await (0, import_promises3.realpath)(path5) : path5;
        if (this.fsw.closed)
          return;
        const parent = sysPath.dirname(wh.watchPath);
        this.fsw._getWatchedDir(parent).add(wh.watchPath);
        this.fsw._emit(EV.ADD, wh.watchPath, stats);
        closer = await this._handleDir(parent, stats, initialAdd, depth, path5, wh, targetPath);
        if (this.fsw.closed)
          return;
        if (targetPath !== void 0) {
          this.fsw._symlinkPaths.set(sysPath.resolve(path5), targetPath);
        }
      } else {
        closer = this._handleFile(wh.watchPath, stats, initialAdd);
      }
      ready();
      if (closer)
        this.fsw._addPathCloser(path5, closer);
      return false;
    } catch (error) {
      if (this.fsw._handleError(error)) {
        ready();
        return path5;
      }
    }
  }
};

// ../../node_modules/chokidar/esm/index.js
var SLASH = "/";
var SLASH_SLASH = "//";
var ONE_DOT = ".";
var TWO_DOTS = "..";
var STRING_TYPE = "string";
var BACK_SLASH_RE = /\\/g;
var DOUBLE_SLASH_RE = /\/\//;
var DOT_RE = /\..*\.(sw[px])$|~$|\.subl.*\.tmp/;
var REPLACER_RE = /^\.[/\\]/;
function arrify(item) {
  return Array.isArray(item) ? item : [item];
}
var isMatcherObject = (matcher) => typeof matcher === "object" && matcher !== null && !(matcher instanceof RegExp);
function createPattern(matcher) {
  if (typeof matcher === "function")
    return matcher;
  if (typeof matcher === "string")
    return (string) => matcher === string;
  if (matcher instanceof RegExp)
    return (string) => matcher.test(string);
  if (typeof matcher === "object" && matcher !== null) {
    return (string) => {
      if (matcher.path === string)
        return true;
      if (matcher.recursive) {
        const relative3 = sysPath2.relative(matcher.path, string);
        if (!relative3) {
          return false;
        }
        return !relative3.startsWith("..") && !sysPath2.isAbsolute(relative3);
      }
      return false;
    };
  }
  return () => false;
}
function normalizePath2(path5) {
  if (typeof path5 !== "string")
    throw new Error("string expected");
  path5 = sysPath2.normalize(path5);
  path5 = path5.replace(/\\/g, "/");
  let prepend = false;
  if (path5.startsWith("//"))
    prepend = true;
  const DOUBLE_SLASH_RE2 = /\/\//;
  while (path5.match(DOUBLE_SLASH_RE2))
    path5 = path5.replace(DOUBLE_SLASH_RE2, "/");
  if (prepend)
    path5 = "/" + path5;
  return path5;
}
function matchPatterns(patterns, testString, stats) {
  const path5 = normalizePath2(testString);
  for (let index = 0; index < patterns.length; index++) {
    const pattern = patterns[index];
    if (pattern(path5, stats)) {
      return true;
    }
  }
  return false;
}
function anymatch(matchers, testString) {
  if (matchers == null) {
    throw new TypeError("anymatch: specify first argument");
  }
  const matchersArray = arrify(matchers);
  const patterns = matchersArray.map((matcher) => createPattern(matcher));
  if (testString == null) {
    return (testString2, stats) => {
      return matchPatterns(patterns, testString2, stats);
    };
  }
  return matchPatterns(patterns, testString);
}
var unifyPaths = (paths_) => {
  const paths = arrify(paths_).flat();
  if (!paths.every((p) => typeof p === STRING_TYPE)) {
    throw new TypeError(`Non-string provided as watch path: ${paths}`);
  }
  return paths.map(normalizePathToUnix);
};
var toUnix = (string) => {
  let str = string.replace(BACK_SLASH_RE, SLASH);
  let prepend = false;
  if (str.startsWith(SLASH_SLASH)) {
    prepend = true;
  }
  while (str.match(DOUBLE_SLASH_RE)) {
    str = str.replace(DOUBLE_SLASH_RE, SLASH);
  }
  if (prepend) {
    str = SLASH + str;
  }
  return str;
};
var normalizePathToUnix = (path5) => toUnix(sysPath2.normalize(toUnix(path5)));
var normalizeIgnored = (cwd = "") => (path5) => {
  if (typeof path5 === "string") {
    return normalizePathToUnix(sysPath2.isAbsolute(path5) ? path5 : sysPath2.join(cwd, path5));
  } else {
    return path5;
  }
};
var getAbsolutePath = (path5, cwd) => {
  if (sysPath2.isAbsolute(path5)) {
    return path5;
  }
  return sysPath2.join(cwd, path5);
};
var EMPTY_SET = Object.freeze(/* @__PURE__ */ new Set());
var DirEntry = class {
  constructor(dir, removeWatcher) {
    this.path = dir;
    this._removeWatcher = removeWatcher;
    this.items = /* @__PURE__ */ new Set();
  }
  add(item) {
    const { items } = this;
    if (!items)
      return;
    if (item !== ONE_DOT && item !== TWO_DOTS)
      items.add(item);
  }
  async remove(item) {
    const { items } = this;
    if (!items)
      return;
    items.delete(item);
    if (items.size > 0)
      return;
    const dir = this.path;
    try {
      await (0, import_promises4.readdir)(dir);
    } catch (err) {
      if (this._removeWatcher) {
        this._removeWatcher(sysPath2.dirname(dir), sysPath2.basename(dir));
      }
    }
  }
  has(item) {
    const { items } = this;
    if (!items)
      return;
    return items.has(item);
  }
  getChildren() {
    const { items } = this;
    if (!items)
      return [];
    return [...items.values()];
  }
  dispose() {
    this.items.clear();
    this.path = "";
    this._removeWatcher = EMPTY_FN;
    this.items = EMPTY_SET;
    Object.freeze(this);
  }
};
var STAT_METHOD_F = "stat";
var STAT_METHOD_L = "lstat";
var WatchHelper = class {
  constructor(path5, follow, fsw) {
    this.fsw = fsw;
    const watchPath = path5;
    this.path = path5 = path5.replace(REPLACER_RE, "");
    this.watchPath = watchPath;
    this.fullWatchPath = sysPath2.resolve(watchPath);
    this.dirParts = [];
    this.dirParts.forEach((parts) => {
      if (parts.length > 1)
        parts.pop();
    });
    this.followSymlinks = follow;
    this.statMethod = follow ? STAT_METHOD_F : STAT_METHOD_L;
  }
  entryPath(entry) {
    return sysPath2.join(this.watchPath, sysPath2.relative(this.watchPath, entry.fullPath));
  }
  filterPath(entry) {
    const { stats } = entry;
    if (stats && stats.isSymbolicLink())
      return this.filterDir(entry);
    const resolvedPath = this.entryPath(entry);
    return this.fsw._isntIgnored(resolvedPath, stats) && this.fsw._hasReadPermissions(stats);
  }
  filterDir(entry) {
    return this.fsw._isntIgnored(this.entryPath(entry), entry.stats);
  }
};
var FSWatcher = class extends import_events.EventEmitter {
  // Not indenting methods for history sake; for now.
  constructor(_opts = {}) {
    super();
    this.closed = false;
    this._closers = /* @__PURE__ */ new Map();
    this._ignoredPaths = /* @__PURE__ */ new Set();
    this._throttled = /* @__PURE__ */ new Map();
    this._streams = /* @__PURE__ */ new Set();
    this._symlinkPaths = /* @__PURE__ */ new Map();
    this._watched = /* @__PURE__ */ new Map();
    this._pendingWrites = /* @__PURE__ */ new Map();
    this._pendingUnlinks = /* @__PURE__ */ new Map();
    this._readyCount = 0;
    this._readyEmitted = false;
    const awf = _opts.awaitWriteFinish;
    const DEF_AWF = { stabilityThreshold: 2e3, pollInterval: 100 };
    const opts = {
      // Defaults
      persistent: true,
      ignoreInitial: false,
      ignorePermissionErrors: false,
      interval: 100,
      binaryInterval: 300,
      followSymlinks: true,
      usePolling: false,
      // useAsync: false,
      atomic: true,
      // NOTE: overwritten later (depends on usePolling)
      ..._opts,
      // Change format
      ignored: _opts.ignored ? arrify(_opts.ignored) : arrify([]),
      awaitWriteFinish: awf === true ? DEF_AWF : typeof awf === "object" ? { ...DEF_AWF, ...awf } : false
    };
    if (isIBMi)
      opts.usePolling = true;
    if (opts.atomic === void 0)
      opts.atomic = !opts.usePolling;
    const envPoll = process.env.CHOKIDAR_USEPOLLING;
    if (envPoll !== void 0) {
      const envLower = envPoll.toLowerCase();
      if (envLower === "false" || envLower === "0")
        opts.usePolling = false;
      else if (envLower === "true" || envLower === "1")
        opts.usePolling = true;
      else
        opts.usePolling = !!envLower;
    }
    const envInterval = process.env.CHOKIDAR_INTERVAL;
    if (envInterval)
      opts.interval = Number.parseInt(envInterval, 10);
    let readyCalls = 0;
    this._emitReady = () => {
      readyCalls++;
      if (readyCalls >= this._readyCount) {
        this._emitReady = EMPTY_FN;
        this._readyEmitted = true;
        process.nextTick(() => this.emit(EVENTS.READY));
      }
    };
    this._emitRaw = (...args) => this.emit(EVENTS.RAW, ...args);
    this._boundRemove = this._remove.bind(this);
    this.options = opts;
    this._nodeFsHandler = new NodeFsHandler(this);
    Object.freeze(opts);
  }
  _addIgnoredPath(matcher) {
    if (isMatcherObject(matcher)) {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher.path && ignored.recursive === matcher.recursive) {
          return;
        }
      }
    }
    this._ignoredPaths.add(matcher);
  }
  _removeIgnoredPath(matcher) {
    this._ignoredPaths.delete(matcher);
    if (typeof matcher === "string") {
      for (const ignored of this._ignoredPaths) {
        if (isMatcherObject(ignored) && ignored.path === matcher) {
          this._ignoredPaths.delete(ignored);
        }
      }
    }
  }
  // Public methods
  /**
   * Adds paths to be watched on an existing FSWatcher instance.
   * @param paths_ file or file list. Other arguments are unused
   */
  add(paths_, _origAdd, _internal) {
    const { cwd } = this.options;
    this.closed = false;
    this._closePromise = void 0;
    let paths = unifyPaths(paths_);
    if (cwd) {
      paths = paths.map((path5) => {
        const absPath = getAbsolutePath(path5, cwd);
        return absPath;
      });
    }
    paths.forEach((path5) => {
      this._removeIgnoredPath(path5);
    });
    this._userIgnored = void 0;
    if (!this._readyCount)
      this._readyCount = 0;
    this._readyCount += paths.length;
    Promise.all(paths.map(async (path5) => {
      const res = await this._nodeFsHandler._addToNodeFs(path5, !_internal, void 0, 0, _origAdd);
      if (res)
        this._emitReady();
      return res;
    })).then((results) => {
      if (this.closed)
        return;
      results.forEach((item) => {
        if (item)
          this.add(sysPath2.dirname(item), sysPath2.basename(_origAdd || item));
      });
    });
    return this;
  }
  /**
   * Close watchers or start ignoring events from specified paths.
   */
  unwatch(paths_) {
    if (this.closed)
      return this;
    const paths = unifyPaths(paths_);
    const { cwd } = this.options;
    paths.forEach((path5) => {
      if (!sysPath2.isAbsolute(path5) && !this._closers.has(path5)) {
        if (cwd)
          path5 = sysPath2.join(cwd, path5);
        path5 = sysPath2.resolve(path5);
      }
      this._closePath(path5);
      this._addIgnoredPath(path5);
      if (this._watched.has(path5)) {
        this._addIgnoredPath({
          path: path5,
          recursive: true
        });
      }
      this._userIgnored = void 0;
    });
    return this;
  }
  /**
   * Close watchers and remove all listeners from watched paths.
   */
  close() {
    if (this._closePromise) {
      return this._closePromise;
    }
    this.closed = true;
    this.removeAllListeners();
    const closers = [];
    this._closers.forEach((closerList) => closerList.forEach((closer) => {
      const promise = closer();
      if (promise instanceof Promise)
        closers.push(promise);
    }));
    this._streams.forEach((stream) => stream.destroy());
    this._userIgnored = void 0;
    this._readyCount = 0;
    this._readyEmitted = false;
    this._watched.forEach((dirent) => dirent.dispose());
    this._closers.clear();
    this._watched.clear();
    this._streams.clear();
    this._symlinkPaths.clear();
    this._throttled.clear();
    this._closePromise = closers.length ? Promise.all(closers).then(() => void 0) : Promise.resolve();
    return this._closePromise;
  }
  /**
   * Expose list of watched paths
   * @returns for chaining
   */
  getWatched() {
    const watchList = {};
    this._watched.forEach((entry, dir) => {
      const key = this.options.cwd ? sysPath2.relative(this.options.cwd, dir) : dir;
      const index = key || ONE_DOT;
      watchList[index] = entry.getChildren().sort();
    });
    return watchList;
  }
  emitWithAll(event, args) {
    this.emit(event, ...args);
    if (event !== EVENTS.ERROR)
      this.emit(EVENTS.ALL, event, ...args);
  }
  // Common helpers
  // --------------
  /**
   * Normalize and emit events.
   * Calling _emit DOES NOT MEAN emit() would be called!
   * @param event Type of event
   * @param path File or directory path
   * @param stats arguments to be passed with event
   * @returns the error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  async _emit(event, path5, stats) {
    if (this.closed)
      return;
    const opts = this.options;
    if (isWindows)
      path5 = sysPath2.normalize(path5);
    if (opts.cwd)
      path5 = sysPath2.relative(opts.cwd, path5);
    const args = [path5];
    if (stats != null)
      args.push(stats);
    const awf = opts.awaitWriteFinish;
    let pw;
    if (awf && (pw = this._pendingWrites.get(path5))) {
      pw.lastChange = /* @__PURE__ */ new Date();
      return this;
    }
    if (opts.atomic) {
      if (event === EVENTS.UNLINK) {
        this._pendingUnlinks.set(path5, [event, ...args]);
        setTimeout(() => {
          this._pendingUnlinks.forEach((entry, path6) => {
            this.emit(...entry);
            this.emit(EVENTS.ALL, ...entry);
            this._pendingUnlinks.delete(path6);
          });
        }, typeof opts.atomic === "number" ? opts.atomic : 100);
        return this;
      }
      if (event === EVENTS.ADD && this._pendingUnlinks.has(path5)) {
        event = EVENTS.CHANGE;
        this._pendingUnlinks.delete(path5);
      }
    }
    if (awf && (event === EVENTS.ADD || event === EVENTS.CHANGE) && this._readyEmitted) {
      const awfEmit = (err, stats2) => {
        if (err) {
          event = EVENTS.ERROR;
          args[0] = err;
          this.emitWithAll(event, args);
        } else if (stats2) {
          if (args.length > 1) {
            args[1] = stats2;
          } else {
            args.push(stats2);
          }
          this.emitWithAll(event, args);
        }
      };
      this._awaitWriteFinish(path5, awf.stabilityThreshold, event, awfEmit);
      return this;
    }
    if (event === EVENTS.CHANGE) {
      const isThrottled = !this._throttle(EVENTS.CHANGE, path5, 50);
      if (isThrottled)
        return this;
    }
    if (opts.alwaysStat && stats === void 0 && (event === EVENTS.ADD || event === EVENTS.ADD_DIR || event === EVENTS.CHANGE)) {
      const fullPath = opts.cwd ? sysPath2.join(opts.cwd, path5) : path5;
      let stats2;
      try {
        stats2 = await (0, import_promises4.stat)(fullPath);
      } catch (err) {
      }
      if (!stats2 || this.closed)
        return;
      args.push(stats2);
    }
    this.emitWithAll(event, args);
    return this;
  }
  /**
   * Common handler for errors
   * @returns The error if defined, otherwise the value of the FSWatcher instance's `closed` flag
   */
  _handleError(error) {
    const code = error && error.code;
    if (error && code !== "ENOENT" && code !== "ENOTDIR" && (!this.options.ignorePermissionErrors || code !== "EPERM" && code !== "EACCES")) {
      this.emit(EVENTS.ERROR, error);
    }
    return error || this.closed;
  }
  /**
   * Helper utility for throttling
   * @param actionType type being throttled
   * @param path being acted upon
   * @param timeout duration of time to suppress duplicate actions
   * @returns tracking object or false if action should be suppressed
   */
  _throttle(actionType, path5, timeout) {
    if (!this._throttled.has(actionType)) {
      this._throttled.set(actionType, /* @__PURE__ */ new Map());
    }
    const action = this._throttled.get(actionType);
    if (!action)
      throw new Error("invalid throttle");
    const actionPath = action.get(path5);
    if (actionPath) {
      actionPath.count++;
      return false;
    }
    let timeoutObject;
    const clear = () => {
      const item = action.get(path5);
      const count = item ? item.count : 0;
      action.delete(path5);
      clearTimeout(timeoutObject);
      if (item)
        clearTimeout(item.timeoutObject);
      return count;
    };
    timeoutObject = setTimeout(clear, timeout);
    const thr = { timeoutObject, clear, count: 0 };
    action.set(path5, thr);
    return thr;
  }
  _incrReadyCount() {
    return this._readyCount++;
  }
  /**
   * Awaits write operation to finish.
   * Polls a newly created file for size variations. When files size does not change for 'threshold' milliseconds calls callback.
   * @param path being acted upon
   * @param threshold Time in milliseconds a file size must be fixed before acknowledging write OP is finished
   * @param event
   * @param awfEmit Callback to be called when ready for event to be emitted.
   */
  _awaitWriteFinish(path5, threshold, event, awfEmit) {
    const awf = this.options.awaitWriteFinish;
    if (typeof awf !== "object")
      return;
    const pollInterval = awf.pollInterval;
    let timeoutHandler;
    let fullPath = path5;
    if (this.options.cwd && !sysPath2.isAbsolute(path5)) {
      fullPath = sysPath2.join(this.options.cwd, path5);
    }
    const now = /* @__PURE__ */ new Date();
    const writes = this._pendingWrites;
    function awaitWriteFinishFn(prevStat) {
      (0, import_fs2.stat)(fullPath, (err, curStat) => {
        if (err || !writes.has(path5)) {
          if (err && err.code !== "ENOENT")
            awfEmit(err);
          return;
        }
        const now2 = Number(/* @__PURE__ */ new Date());
        if (prevStat && curStat.size !== prevStat.size) {
          writes.get(path5).lastChange = now2;
        }
        const pw = writes.get(path5);
        const df = now2 - pw.lastChange;
        if (df >= threshold) {
          writes.delete(path5);
          awfEmit(void 0, curStat);
        } else {
          timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval, curStat);
        }
      });
    }
    if (!writes.has(path5)) {
      writes.set(path5, {
        lastChange: now,
        cancelWait: () => {
          writes.delete(path5);
          clearTimeout(timeoutHandler);
          return event;
        }
      });
      timeoutHandler = setTimeout(awaitWriteFinishFn, pollInterval);
    }
  }
  /**
   * Determines whether user has asked to ignore this path.
   */
  _isIgnored(path5, stats) {
    if (this.options.atomic && DOT_RE.test(path5))
      return true;
    if (!this._userIgnored) {
      const { cwd } = this.options;
      const ign = this.options.ignored;
      const ignored = (ign || []).map(normalizeIgnored(cwd));
      const ignoredPaths = [...this._ignoredPaths];
      const list = [...ignoredPaths.map(normalizeIgnored(cwd)), ...ignored];
      this._userIgnored = anymatch(list, void 0);
    }
    return this._userIgnored(path5, stats);
  }
  _isntIgnored(path5, stat5) {
    return !this._isIgnored(path5, stat5);
  }
  /**
   * Provides a set of common helpers and properties relating to symlink handling.
   * @param path file or directory pattern being watched
   */
  _getWatchHelpers(path5) {
    return new WatchHelper(path5, this.options.followSymlinks, this);
  }
  // Directory helpers
  // -----------------
  /**
   * Provides directory tracking objects
   * @param directory path of the directory
   */
  _getWatchedDir(directory) {
    const dir = sysPath2.resolve(directory);
    if (!this._watched.has(dir))
      this._watched.set(dir, new DirEntry(dir, this._boundRemove));
    return this._watched.get(dir);
  }
  // File helpers
  // ------------
  /**
   * Check for read permissions: https://stackoverflow.com/a/11781404/1358405
   */
  _hasReadPermissions(stats) {
    if (this.options.ignorePermissionErrors)
      return true;
    return Boolean(Number(stats.mode) & 256);
  }
  /**
   * Handles emitting unlink events for
   * files and directories, and via recursion, for
   * files and directories within directories that are unlinked
   * @param directory within which the following item is located
   * @param item      base path of item/directory
   */
  _remove(directory, item, isDirectory) {
    const path5 = sysPath2.join(directory, item);
    const fullPath = sysPath2.resolve(path5);
    isDirectory = isDirectory != null ? isDirectory : this._watched.has(path5) || this._watched.has(fullPath);
    if (!this._throttle("remove", path5, 100))
      return;
    if (!isDirectory && this._watched.size === 1) {
      this.add(directory, item, true);
    }
    const wp = this._getWatchedDir(path5);
    const nestedDirectoryChildren = wp.getChildren();
    nestedDirectoryChildren.forEach((nested) => this._remove(path5, nested));
    const parent = this._getWatchedDir(directory);
    const wasTracked = parent.has(item);
    parent.remove(item);
    if (this._symlinkPaths.has(fullPath)) {
      this._symlinkPaths.delete(fullPath);
    }
    let relPath = path5;
    if (this.options.cwd)
      relPath = sysPath2.relative(this.options.cwd, path5);
    if (this.options.awaitWriteFinish && this._pendingWrites.has(relPath)) {
      const event = this._pendingWrites.get(relPath).cancelWait();
      if (event === EVENTS.ADD)
        return;
    }
    this._watched.delete(path5);
    this._watched.delete(fullPath);
    const eventName = isDirectory ? EVENTS.UNLINK_DIR : EVENTS.UNLINK;
    if (wasTracked && !this._isIgnored(path5))
      this._emit(eventName, path5);
    this._closePath(path5);
  }
  /**
   * Closes all watchers for a path
   */
  _closePath(path5) {
    this._closeFile(path5);
    const dir = sysPath2.dirname(path5);
    this._getWatchedDir(dir).remove(sysPath2.basename(path5));
  }
  /**
   * Closes only file-specific watchers
   */
  _closeFile(path5) {
    const closers = this._closers.get(path5);
    if (!closers)
      return;
    closers.forEach((closer) => closer());
    this._closers.delete(path5);
  }
  _addPathCloser(path5, closer) {
    if (!closer)
      return;
    let list = this._closers.get(path5);
    if (!list) {
      list = [];
      this._closers.set(path5, list);
    }
    list.push(closer);
  }
  _readdirp(root, opts) {
    if (this.closed)
      return;
    const options = { type: EVENTS.ALL, alwaysStat: true, lstat: true, ...opts, depth: 0 };
    let stream = readdirp(root, options);
    this._streams.add(stream);
    stream.once(STR_CLOSE, () => {
      stream = void 0;
    });
    stream.once(STR_END, () => {
      if (stream) {
        this._streams.delete(stream);
        stream = void 0;
      }
    });
    return stream;
  }
};
function watch(paths, options = {}) {
  const watcher = new FSWatcher(options);
  watcher.add(paths);
  return watcher;
}
var esm_default = { watch, FSWatcher };

// src/sync-engine.ts
var import_obsidian3 = require("obsidian");

// src/asset-references.ts
var path3 = __toESM(require("node:path"));
var URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
function extractLocalReferences(content) {
  const result = /* @__PURE__ */ new Set();
  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) addReference(result, match[1]);
  for (const match of content.matchAll(/!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) addReference(result, match[1]);
  for (const match of content.matchAll(/["']([^"']+\.(?:png|jpe?g|gif|webp|svg|pdf))["']/gi)) addReference(result, match[1]);
  return [...result];
}
function resolveLocalReference(documentPath, reference, sourceFiles, extensions, caseInsensitive = process.platform === "win32") {
  const cleaned = cleanReference(reference);
  if (!cleaned || URI_SCHEME.test(cleaned) || path3.posix.isAbsolute(cleaned) || /^[a-zA-Z]:[\\/]/.test(cleaned)) return {};
  const normalizedFiles = [...new Set(sourceFiles.map((file) => file.replace(/\\/g, "/")))];
  const candidates = [path3.posix.normalize(path3.posix.join(path3.posix.dirname(documentPath), cleaned)), path3.posix.normalize(cleaned)];
  for (const candidate of candidates) {
    if (candidate.startsWith("../") || candidate === "..") continue;
    const matches = normalizedFiles.filter((file) => manifestKey(file, caseInsensitive) === manifestKey(candidate, caseInsensitive) && allowed(file, extensions));
    if (matches.length === 1) return { path: matches[0] };
    if (matches.length > 1) return { warning: `Ambiguous attachment reference '${reference}' in ${documentPath}` };
  }
  if (!cleaned.includes("/")) {
    const basename3 = path3.posix.basename(cleaned).toLowerCase();
    const matches = normalizedFiles.filter((file) => path3.posix.basename(file).toLowerCase() === basename3 && allowed(file, extensions));
    if (matches.length === 1) return { path: matches[0] };
    if (matches.length > 1) return { warning: `Ambiguous attachment reference '${reference}' in ${documentPath}` };
  }
  return { warning: `Attachment reference outside source root or missing: '${reference}' in ${documentPath}` };
}
function addReference(target, value) {
  const cleaned = cleanReference(value.trim().replace(/^<|>$/g, ""));
  if (cleaned) target.add(cleaned);
}
function cleanReference(value) {
  const withoutSuffix = value.split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(withoutSuffix).replace(/\\/g, "/");
  } catch (e) {
    return withoutSuffix.replace(/\\/g, "/");
  }
}
function allowed(value, extensions) {
  var _a, _b;
  return extensions.map((extension) => extension.toLowerCase()).includes((_b = (_a = value.split(".").pop()) == null ? void 0 : _a.toLowerCase()) != null ? _b : "");
}

// src/reconcile.ts
function decideReconcile({ baseHash, sourceHash, mirrorHash, status = "active" }) {
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

// src/reconcile-queue.ts
var ExpectedHashSuppressor = class {
  constructor() {
    this.expected = /* @__PURE__ */ new Map();
  }
  expect(path5, hash) {
    this.expected.set(path5, hash);
  }
  consume(path5, actualHash) {
    const expected = this.expected.get(path5);
    this.expected.delete(path5);
    return expected === actualHash;
  }
  cancel(path5) {
    this.expected.delete(path5);
  }
};
var ReconcileQueue = class {
  constructor(delayMs, run, onError = (error) => console.error(error)) {
    this.delayMs = delayMs;
    this.run = run;
    this.onError = onError;
    this.running = false;
    this.pending = false;
    this.timer = null;
    this.stopped = false;
    this.active = null;
  }
  request() {
    if (this.stopped) return;
    this.pending = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch((error) => this.onError(error));
    }, this.delayMs());
  }
  async flush() {
    var _a, _b;
    if (this.stopped || !this.pending) return (_a = this.active) != null ? _a : void 0;
    if (this.running) return (_b = this.active) != null ? _b : void 0;
    this.running = true;
    this.pending = false;
    const active = Promise.resolve().then(() => this.run());
    this.active = active;
    try {
      await active;
    } finally {
      this.running = false;
      if (this.active === active) this.active = null;
      if (this.pending) void this.flush().catch((error) => this.onError(error));
    }
  }
  async stop() {
    this.stopped = true;
    this.pending = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    await this.active;
  }
};

// src/sync-write.ts
async function writeThenCommit(write, entries, key, relativePath, kind, hash) {
  await write();
  entries[key] = { relativePath, kind, baseHash: hash, sourceHash: hash, mirrorHash: hash, status: "active" };
}

// src/sync-engine.ts
var SyncEngine = class {
  constructor(options) {
    this.options = options;
    this.sourceExpected = new ExpectedHashSuppressor();
    this.mirrorExpected = new ExpectedHashSuppressor();
    this.sourceWatcher = null;
    this.vaultEvents = [];
    this.paused = false;
    this.initialized = false;
    this.initializing = null;
    this.entries = options.entries;
    this.queue = new ReconcileQueue(
      () => this.options.settings().debounceMs,
      async () => {
        await this.reconcile();
      },
      (error) => this.log("error", `queued reconcile failed: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
  async initialize() {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = this.initializeInternal();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }
  async initializeInternal() {
    var _a;
    this.options.onStatus("syncing", this.conflictCount());
    const source = await this.sourceInventory();
    const mirror = await this.mirrorInventory();
    const paths = /* @__PURE__ */ new Set([...source.keys(), ...mirror.keys()]);
    for (const relativePath of paths) {
      const sourceFile = source.get(relativePath);
      const mirrorFile = mirror.get(relativePath);
      if (!sourceFile && mirrorFile) {
        await this.createConflict(relativePath, mirrorFile.kind, null, mirrorFile.hash);
        const conflict = (_a = this.entry(relativePath)) == null ? void 0 : _a.conflict;
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
  async reconcile() {
    var _a, _b;
    if (this.paused || !this.initialized) return false;
    this.options.onStatus("syncing", this.conflictCount());
    try {
      const source = await this.sourceInventory();
      const mirror = await this.mirrorInventory();
      await this.reconcileRenames(source, mirror);
      const paths = /* @__PURE__ */ new Set([...Object.values(this.entries).map((entry) => entry.relativePath), ...source.keys(), ...mirror.keys()]);
      for (const relativePath of paths) {
        if (this.paused) break;
        await this.reconcilePath(relativePath, source.get(relativePath), mirror.get(relativePath));
      }
      await this.persist();
      if (this.paused) {
        this.options.onStatus("paused", this.conflictCount());
        return false;
      }
      await ((_b = (_a = this.options).onSuccessfulSync) == null ? void 0 : _b.call(_a));
      this.options.onStatus(this.conflictCount() ? "conflicts" : "synced", this.conflictCount());
      return true;
    } catch (error) {
      this.log("error", `reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
      this.options.onStatus("error", this.conflictCount());
      throw error;
    }
  }
  start() {
    if (this.sourceWatcher || this.vaultEvents.length || !this.options.settings().watchForChanges) return;
    const onSourceEvent = (filename) => {
      if (!filename) return this.queue.request();
      const absolute = path4.resolve(this.options.policy.sourceRoot, filename.toString());
      const relative3 = sourceRelative(this.options.policy, absolute);
      if (!relative3) {
        if (path4.resolve(absolute) === path4.resolve(this.options.policy.sourceRoot)) this.queue.request();
        return;
      }
      void this.options.sourceStore.hash(relative3).then((hash) => {
        if (!this.sourceExpected.consume(relative3, hash)) this.queue.request();
      }).catch(() => this.queue.request());
    };
    this.sourceWatcher = esm_default.watch(this.options.policy.sourceRoot, {
      ignoreInitial: true,
      followSymlinks: false,
      ignored: (absolutePath) => {
        const relative3 = sourceRelative(this.options.policy, absolutePath);
        return relative3 === null || isIgnored(relative3, this.options.settings().excludePatterns);
      }
    }).on("all", (_event, filename) => onSourceEvent(filename));
    this.vaultEvents = [
      this.options.vault.on("create", (file) => this.onVaultFile(file)),
      this.options.vault.on("modify", (file) => this.onVaultFile(file)),
      this.options.vault.on("delete", (file) => this.onVaultFile(file)),
      this.options.vault.on("rename", (file, oldPath) => this.onVaultRename(file, oldPath))
    ];
  }
  async stop() {
    await this.queue.stop();
    await this.stopWatching();
  }
  async stopWatching() {
    var _a;
    await ((_a = this.sourceWatcher) == null ? void 0 : _a.close());
    this.sourceWatcher = null;
    for (const ref of this.vaultEvents) this.options.vault.offref(ref);
    this.vaultEvents = [];
  }
  setPaused(value) {
    this.paused = value;
    this.options.onStatus(value ? "paused" : "synced", this.conflictCount());
    if (!value) this.queue.request();
  }
  requestSync() {
    this.queue.request();
  }
  isInitialized() {
    return this.initialized;
  }
  restoreInitialized() {
    this.initialized = true;
  }
  async resolveConflict(relativePath, keep) {
    if (this.paused) throw new Error("Resume sync before resolving a conflict.");
    const entry = this.entry(relativePath);
    if (!(entry == null ? void 0 : entry.conflict)) return;
    const sourceHash = await this.options.sourceStore.hash(relativePath);
    const mirrorHash = await this.options.vaultStore.hash(relativePath, sha256);
    const mirrorMatches = mirrorHash === entry.conflict.mirrorHash || entry.conflict.mirrorWasTrashedForBootstrap && mirrorHash === null;
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
        this.sourceExpected.expect(relativePath, entry.conflict.mirrorHash);
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
  conflictSnapshotPath(relativePath, side) {
    var _a;
    const conflict = (_a = this.entry(relativePath)) == null ? void 0 : _a.conflict;
    if (!conflict || (side === "source" ? !conflict.sourceHash : !conflict.mirrorHash)) return null;
    return `${this.options.policy.mirrorRoot}/${conflict.snapshotFolder}/${snapshotName(path4.posix.basename(relativePath), side)}`;
  }
  async reconcilePath(relativePath, sourceFile, mirrorFile) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (this.paused) return;
    const entry = this.entry(relativePath);
    const kind = (_c = (_b = (_a = entry == null ? void 0 : entry.kind) != null ? _a : sourceFile == null ? void 0 : sourceFile.kind) != null ? _b : mirrorFile == null ? void 0 : mirrorFile.kind) != null ? _c : "document";
    const action = decideReconcile({ baseHash: (_d = entry == null ? void 0 : entry.baseHash) != null ? _d : null, sourceHash: (_e = sourceFile == null ? void 0 : sourceFile.hash) != null ? _e : null, mirrorHash: (_f = mirrorFile == null ? void 0 : mirrorFile.hash) != null ? _f : null, status: entry == null ? void 0 : entry.status });
    await this.apply(action, relativePath, kind, (_g = sourceFile == null ? void 0 : sourceFile.hash) != null ? _g : null, (_h = mirrorFile == null ? void 0 : mirrorFile.hash) != null ? _h : null);
  }
  async apply(action, relativePath, kind, sourceHash, mirrorHash) {
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
  async copySourceToMirror(relativePath, kind, hash) {
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
  async copyMirrorToSource(relativePath, kind, hash) {
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
  accept(relativePath, kind, hash) {
    const key = manifestKey(relativePath, this.options.policy.caseInsensitive);
    this.entries[key] = { relativePath, kind, baseHash: hash, sourceHash: hash, mirrorHash: hash, status: "active" };
  }
  tombstone(relativePath, kind) {
    var _a;
    const key = manifestKey(relativePath, this.options.policy.caseInsensitive);
    const previous = this.entries[key];
    this.entries[key] = { relativePath, kind, baseHash: (_a = previous == null ? void 0 : previous.baseHash) != null ? _a : "", sourceHash: null, mirrorHash: null, status: "tombstone" };
  }
  async createConflict(relativePath, kind, sourceHash, mirrorHash) {
    var _a, _b;
    const existing = this.entry(relativePath);
    if ((existing == null ? void 0 : existing.status) === "conflict" && ((_a = existing.conflict) == null ? void 0 : _a.sourceHash) === sourceHash && existing.conflict.mirrorHash === mirrorHash) return;
    const root = `_project-docs-conflicts/${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}`;
    const parent = path4.posix.dirname(relativePath);
    const folder = parent === "." ? root : `${root}/${parent}`;
    const basename3 = path4.posix.basename(relativePath);
    if (sourceHash) await this.options.vaultStore.write(`${folder}/${snapshotName(basename3, "source")}`, await this.options.sourceStore.read(relativePath), kind, true);
    const mirrorSnapshotPath = `${folder}/${snapshotName(basename3, "vault")}`;
    if (mirrorHash) {
      const content = await this.options.vaultStore.read(relativePath);
      if (content) await this.options.vaultStore.write(mirrorSnapshotPath, content, kind, true);
    }
    const conflict = { sourceHash, mirrorHash, createdAt: (/* @__PURE__ */ new Date()).toISOString(), snapshotFolder: folder, ...mirrorHash ? { mirrorSnapshotPath } : {} };
    await this.options.vaultStore.write(`${folder}/conflict.json`, new TextEncoder().encode(JSON.stringify({ relativePath, ...conflict }, null, 2)), "document", true);
    const key = manifestKey(relativePath, this.options.policy.caseInsensitive);
    this.entries[key] = { relativePath, kind, baseHash: (_b = existing == null ? void 0 : existing.baseHash) != null ? _b : "", sourceHash, mirrorHash, status: "conflict", conflict };
    this.log("warn", `conflict: ${relativePath}`);
  }
  async sourceInventory() {
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
          if ((file == null ? void 0 : file.kind) === "attachment") selected.set(file.relativePath, file);
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
  async mirrorInventory() {
    const result = /* @__PURE__ */ new Map();
    for (const relativePath of this.options.vaultStore.listRelativeFiles()) {
      const kind = fileKind(relativePath, this.options.settings().assetExtensions);
      if (!kind) continue;
      const hash = await this.options.vaultStore.hash(relativePath, sha256);
      if (hash) result.set(relativePath, { relativePath, kind, hash });
    }
    this.assertNoCaseCollisions(result.values(), (file) => file.relativePath, "mirror");
    return result;
  }
  async reconcileRenames(source, mirror) {
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
  onVaultFile(file) {
    const vaultPath = typeof file === "object" && file !== null && "path" in file && typeof file.path === "string" ? file.path : null;
    if (!vaultPath || !this.isMirrorBoundary(vaultPath)) return;
    if (!(file instanceof import_obsidian3.TFile)) {
      this.queue.request();
      return;
    }
    const relative3 = mirrorRelative(this.options.policy, vaultPath);
    if (!relative3) return this.queue.request();
    void this.options.vaultStore.hash(relative3, sha256).then((hash) => {
      if (!this.mirrorExpected.consume(relative3, hash)) this.queue.request();
    });
  }
  onVaultRename(file, oldPath) {
    const newPath = typeof file === "object" && file !== null && "path" in file && typeof file.path === "string" ? file.path : null;
    if (this.isMirrorBoundary(oldPath) || newPath !== null && this.isMirrorBoundary(newPath)) this.queue.request();
  }
  entry(relativePath) {
    return this.entries[manifestKey(relativePath, this.options.policy.caseInsensitive)];
  }
  async persist() {
    await this.options.onStateChange();
  }
  async renameMirror(relativeFrom, relativeTo) {
    if (!this.options.policy.caseInsensitive || relativeFrom === relativeTo || relativeFrom.toLowerCase() !== relativeTo.toLowerCase()) {
      await this.options.vaultStore.rename(relativeFrom, relativeTo);
      return;
    }
    const temporary = `${relativeFrom}.project-docs-case-${Date.now()}`;
    await this.options.vaultStore.rename(relativeFrom, temporary);
    await this.options.vaultStore.rename(temporary, relativeTo);
  }
  assertNoCaseCollisions(items, getPath, side) {
    const collisions = findCaseCollisions([...items].map(getPath), this.options.policy.caseInsensitive);
    if (collisions.length) throw new Error(`Case-colliding ${side} paths cannot be synchronized: ${collisions[0].join(", ")}`);
  }
  isMirrorBoundary(vaultPath) {
    const normalized = vaultPath.replace(/\\/g, "/").replace(/^\/+/, "");
    return normalized === this.options.policy.mirrorRoot || normalized.startsWith(`${this.options.policy.mirrorRoot}/`);
  }
  conflictCount() {
    return Object.values(this.entries).filter((entry) => entry.status === "conflict").length;
  }
  log(level, message) {
    var _a;
    ((_a = this.options.onLog) != null ? _a : (logLevel, text) => console[logLevel](`[Project Docs Bridge] ${text}`))(level, message);
  }
};
function snapshotName(basename3, side) {
  const extension = path4.posix.extname(basename3);
  return extension ? `${basename3.slice(0, -extension.length)}.${side}${extension}` : `${basename3}.${side}`;
}

// src/conflict-modal.ts
var import_obsidian4 = require("obsidian");
var ConflictModal = class extends import_obsidian4.Modal {
  constructor(app, engine) {
    super(app);
    this.engine = engine;
  }
  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Project Docs Bridge conflicts" });
    const conflicts = Object.values(this.engine.entries).filter((entry) => entry.status === "conflict");
    if (!conflicts.length) {
      this.contentEl.createEl("p", { text: "No unresolved conflicts." });
      return;
    }
    for (const entry of conflicts) this.renderConflict(entry);
  }
  renderConflict(entry) {
    var _a, _b, _c, _d, _e, _f;
    const row = this.contentEl.createDiv({ cls: "project-docs-bridge-conflict" });
    row.createEl("h3", { text: entry.relativePath });
    row.createEl("p", { text: `Snapshots: ${(_b = (_a = entry.conflict) == null ? void 0 : _a.snapshotFolder) != null ? _b : "unavailable"}` });
    const source = row.createEl("button", { text: ((_c = entry.conflict) == null ? void 0 : _c.sourceHash) ? "Keep source" : "Keep source deletion" });
    source.onclick = () => this.resolve(entry.relativePath, "source");
    const vault = row.createEl("button", { text: ((_d = entry.conflict) == null ? void 0 : _d.mirrorHash) ? "Keep vault" : "Keep vault deletion" });
    vault.onclick = () => this.resolve(entry.relativePath, "vault");
    if ((_e = entry.conflict) == null ? void 0 : _e.sourceHash) this.snapshotButton(row, entry, "source");
    if ((_f = entry.conflict) == null ? void 0 : _f.mirrorHash) this.snapshotButton(row, entry, "vault");
  }
  async resolve(relativePath, keep) {
    try {
      await this.engine.resolveConflict(relativePath, keep);
      new import_obsidian4.Notice(`Resolved conflict for ${relativePath}`);
      this.onOpen();
    } catch (error) {
      new import_obsidian4.Notice(error instanceof Error ? error.message : String(error));
    }
  }
  snapshotButton(row, entry, side) {
    if (!this.engine.conflictSnapshotPath(entry.relativePath, side)) return;
    const button = row.createEl("button", { text: `Open ${side} snapshot` });
    button.onclick = () => {
      var _a;
      return void this.app.workspace.openLinkText((_a = this.engine.conflictSnapshotPath(entry.relativePath, side)) != null ? _a : "", "", false);
    };
  }
};

// main.ts
var ProjectDocsBridgePlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.paused = false;
    this.initialized = false;
    this.status = "uninitialized";
    this.statusBar = this.addStatusBarItem();
    this.data = { schemaVersion: 1, initialized: false, settings: { ...DEFAULT_SETTINGS }, entries: {} };
    this.engine = null;
    this.initializing = null;
  }
  async onload() {
    var _a;
    const data = await this.loadData();
    if ((data == null ? void 0 : data.schemaVersion) === 1) {
      this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      this.initialized = data.initialized === true;
      this.data = { schemaVersion: 1, initialized: this.initialized, settings: this.settings, entries: (_a = data.entries) != null ? _a : {}, lastSuccessfulSync: data.lastSuccessfulSync };
    }
    this.addSettingTab(new ProjectDocsBridgeSettingTab(this.app, this));
    this.addCommand({ id: "initialize-mirror", name: "Initialize mirror", callback: () => this.initializeMirror() });
    this.addCommand({ id: "sync-now", name: "Sync now", callback: () => this.syncNow() });
    this.addCommand({ id: "toggle-pause", name: "Pause sync / Resume sync", callback: () => this.togglePause() });
    this.addCommand({ id: "open-conflicts", name: "Open conflicts", callback: () => this.openConflicts() });
    this.addCommand({ id: "open-mirror-folder", name: "Open mirror folder", callback: () => new import_obsidian5.Notice(`Mirror folder: ${this.settings.mirrorRoot}`) });
    this.addCommand({ id: "show-sync-status", name: "Show sync status", callback: () => new import_obsidian5.Notice(this.statusDescription()) });
    this.setStatus(this.initialized ? "synced" : "uninitialized");
    this.app.workspace.onLayoutReady(() => {
      if (!this.initialized) {
        new import_obsidian5.Notice("Project Docs Bridge is not initialized. Review settings, then run Initialize mirror.");
        return;
      }
      void this.resumeLoadedEngine();
    });
  }
  async onunload() {
    var _a;
    await ((_a = this.engine) == null ? void 0 : _a.stop());
    await this.saveState();
  }
  async updateSettings(update) {
    var _a, _b, _c;
    const rootChanged = update.sourceRoot !== void 0 && update.sourceRoot !== this.settings.sourceRoot;
    const mirrorChanged = update.mirrorRoot !== void 0 && update.mirrorRoot !== this.settings.mirrorRoot;
    const watchingChanged = update.watchForChanges !== void 0 && update.watchForChanges !== this.settings.watchForChanges;
    this.settings = { ...this.settings, ...update };
    if (rootChanged || mirrorChanged) {
      this.initialized = false;
      this.data.entries = {};
      this.setStatus("uninitialized");
      new import_obsidian5.Notice("Root changed. Validate and explicitly initialize the new mirror; existing files were not removed.");
    }
    this.data.settings = this.settings;
    this.data.initialized = this.initialized;
    if (rootChanged || mirrorChanged) {
      await ((_a = this.engine) == null ? void 0 : _a.stop());
      this.engine = null;
    } else if (watchingChanged) {
      await ((_b = this.engine) == null ? void 0 : _b.stopWatching());
      if (this.settings.watchForChanges && this.initialized) (_c = this.engine) == null ? void 0 : _c.start();
    }
    await this.saveState();
  }
  sourcePathDescription() {
    var _a, _b;
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian5.FileSystemAdapter)) return "Desktop filesystem vault required.";
    return `Resolved path: ${(_b = (_a = createPathPolicy(adapter.getBasePath(), this.settings.sourceRoot, this.settings.mirrorRoot)) == null ? void 0 : _a.sourceRoot) != null ? _b : "invalid"}`;
  }
  validateConfiguration() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian5.FileSystemAdapter)) {
      new import_obsidian5.Notice("Project Docs Bridge requires a desktop filesystem vault.");
      return false;
    }
    const policy = createPathPolicy(adapter.getBasePath(), this.settings.sourceRoot, this.settings.mirrorRoot);
    if (!policy) {
      new import_obsidian5.Notice("Invalid configuration: vault must be a strict child of source root and mirror root must be a safe relative vault path.");
      return false;
    }
    new import_obsidian5.Notice(`Configuration valid: ${policy.sourceRoot} -> ${policy.mirrorRoot}`);
    return true;
  }
  async initializeMirror() {
    if (this.initializing) return this.initializing;
    this.initializing = this.initializeMirrorInternal();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }
  async initializeMirrorInternal() {
    if (!this.validateConfiguration()) return;
    try {
      const engine = this.createEngine();
      if (!engine) return;
      this.setStatus("syncing");
      await engine.initialize();
      this.engine = engine;
      this.initialized = true;
      this.data.initialized = true;
      this.data.lastSuccessfulSync = (/* @__PURE__ */ new Date()).toISOString();
      await this.saveState();
      engine.start();
      new import_obsidian5.Notice("Project Docs Bridge mirror initialized.");
    } catch (error) {
      this.setStatus("error");
      new import_obsidian5.Notice(error instanceof Error ? error.message : String(error));
    }
  }
  async syncNow() {
    var _a;
    if (!this.initialized) {
      new import_obsidian5.Notice("Initialize the mirror first.");
      return;
    }
    const engine = (_a = this.engine) != null ? _a : this.createEngine();
    if (!engine) return;
    this.engine = engine;
    engine.restoreInitialized();
    try {
      await engine.reconcile();
    } catch (error) {
      new import_obsidian5.Notice(error instanceof Error ? error.message : String(error));
    }
  }
  async togglePause() {
    var _a;
    this.paused = !this.paused;
    (_a = this.engine) == null ? void 0 : _a.setPaused(this.paused);
    this.setStatus(this.paused ? "paused" : "synced");
  }
  openConflicts() {
    var _a;
    const engine = (_a = this.engine) != null ? _a : this.createEngine();
    if (!engine) return;
    this.engine = engine;
    new ConflictModal(this.app, engine).open();
  }
  statusDescription() {
    return `Project Docs Bridge: ${this.status}${this.paused ? " (paused)" : ""}`;
  }
  setStatus(status) {
    this.status = status;
    const labels = { uninitialized: "Docs: uninitialized", paused: "Docs: paused", syncing: "Docs: syncing", synced: "Docs: synced", conflicts: "Docs: conflicts", error: "Docs: error" };
    this.statusBar.setText(labels[status]);
  }
  createEngine() {
    if (this.engine) return this.engine;
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian5.FileSystemAdapter)) return null;
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
  async resumeLoadedEngine() {
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
  async recordSuccessfulSync() {
    this.data.lastSuccessfulSync = (/* @__PURE__ */ new Date()).toISOString();
    await this.saveState();
  }
  async saveState() {
    this.data = { ...this.data, schemaVersion: 1, initialized: this.initialized, settings: this.settings, entries: this.data.entries };
    await this.saveData(this.data);
  }
};
/*! Bundled license information:

chokidar/esm/index.js:
  (*! chokidar - MIT License (c) 2012 Paul Miller (paulmillr.com) *)
*/
