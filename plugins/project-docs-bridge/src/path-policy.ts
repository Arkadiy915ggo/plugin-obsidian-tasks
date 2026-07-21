import * as path from "node:path";

// These paths are never synchronised, even when a user's configured globs omit them.
export const MANDATORY_IGNORE_PATTERNS = ["**/.git/**", "**/node_modules/**", "**/.obsidian/**", ".project-docs-trash/**", "_project-docs-conflicts/**"];
export const CONFLICT_NAMESPACE = "_project-docs-conflicts";

export interface PathPolicy {
  vaultRoot: string;
  sourceRoot: string;
  mirrorRoot: string;
  caseInsensitive: boolean;
}

export function normalizeMirrorPath(value: string): string | null {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  if (!normalized || normalized === "." || normalized === "/" || normalized.startsWith("/") || parts.some((part) => part === ".." || !part || part === ".obsidian" || part === CONFLICT_NAMESPACE)) return null;
  return normalized;
}

export function createPathPolicy(vaultRoot: string, sourceSetting: string, mirrorSetting: string, platform = process.platform): PathPolicy | null {
  const mirrorRoot = normalizeMirrorPath(mirrorSetting);
  if (!mirrorRoot) return null;
  const pathApi = platform === "win32" ? path.win32 : path;
  const sourceRoot = pathApi.resolve(vaultRoot, sourceSetting);
  const canonicalVault = normalizeFsPath(pathApi.resolve(vaultRoot), platform);
  const canonicalSource = normalizeFsPath(sourceRoot, platform);
  if (canonicalVault === canonicalSource || !isPathInside(canonicalSource, canonicalVault, platform)) return null;
  return { vaultRoot: pathApi.resolve(vaultRoot), sourceRoot, mirrorRoot, caseInsensitive: platform === "win32" };
}

export function sourceRelative(policy: PathPolicy, absolutePath: string, platform = process.platform): string | null {
  const pathApi = platform === "win32" ? path.win32 : path;
  if (!isPathInside(policy.sourceRoot, absolutePath, platform) || isPathInsideOrEqual(policy.vaultRoot, absolutePath, platform)) return null;
  const relative = pathApi.relative(policy.sourceRoot, absolutePath).replace(/\\/g, "/");
  return relative && !relative.startsWith("../") && relative !== ".." ? relative : null;
}

export function sourcePath(policy: PathPolicy, relativePath: string, platform = process.platform): string | null {
  const pathApi = platform === "win32" ? path.win32 : path;
  const candidate = pathApi.resolve(policy.sourceRoot, relativePath);
  return sourceRelative(policy, candidate, platform) === relativePath.replace(/\\/g, "/") ? candidate : null;
}

export function mirrorPath(policy: PathPolicy, relativePath: string): string | null {
  const relative = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!relative || isReservedMirrorPath(relative) || relative.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return `${policy.mirrorRoot}/${relative}`;
}

export function mirrorRelative(policy: PathPolicy, vaultPath: string): string | null {
  const normalized = vaultPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const prefix = `${policy.mirrorRoot}/`;
  const comparablePath = policy.caseInsensitive ? normalized.toLowerCase() : normalized;
  const comparablePrefix = policy.caseInsensitive ? prefix.toLowerCase() : prefix;
  if (!comparablePath.startsWith(comparablePrefix)) return null;
  const relative = normalized.slice(prefix.length);
  return relative && !isReservedMirrorPath(relative) ? relative : null;
}

export function manifestKey(relativePath: string, caseInsensitive: boolean): string {
  const key = relativePath.replace(/\\/g, "/");
  return caseInsensitive ? key.toLowerCase() : key;
}

export function isIgnored(relativePath: string, patterns: string[]): boolean {
  const value = relativePath.replace(/\\/g, "/");
  return [...MANDATORY_IGNORE_PATTERNS, ...patterns].some((pattern) => matchesGlob(pattern.replace(/\\/g, "/"), value));
}

export function findCaseCollisions(paths: string[], caseInsensitive: boolean): string[][] {
  if (!caseInsensitive) return [];
  const groups = new Map<string, string[]>();
  for (const value of paths) {
    const key = manifestKey(value, true);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function isReservedMirrorPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return normalized === CONFLICT_NAMESPACE || normalized.startsWith(`${CONFLICT_NAMESPACE}/`);
}

export function isPathInside(parent: string, candidate: string, platform = process.platform): boolean {
  const pathApi = platform === "win32" ? path.win32 : path;
  const normalizedParent = normalizeFsPath(pathApi.resolve(parent), platform);
  const normalizedCandidate = normalizeFsPath(pathApi.resolve(candidate), platform);
  const relative = pathApi.relative(normalizedParent, normalizedCandidate);
  return relative !== "" && !relative.startsWith("..") && !pathApi.isAbsolute(relative);
}

export function isPathInsideOrEqual(parent: string, candidate: string, platform = process.platform): boolean {
  const pathApi = platform === "win32" ? path.win32 : path;
  const normalizedParent = normalizeFsPath(pathApi.resolve(parent), platform);
  const normalizedCandidate = normalizeFsPath(pathApi.resolve(candidate), platform);
  return normalizedParent === normalizedCandidate || isPathInside(normalizedParent, normalizedCandidate, platform);
}

function normalizeFsPath(value: string, platform: string): string {
  return platform === "win32" ? value.toLowerCase() : value;
}

function matchesGlob(pattern: string, value: string): boolean {
  const patternParts = pattern.toLowerCase().split("/");
  const valueParts = value.toLowerCase().split("/");
  const match = (patternIndex: number, valueIndex: number): boolean => {
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

function segmentMatches(pattern: string, value: string): boolean {
  const expression = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${expression}$`).test(value);
}
