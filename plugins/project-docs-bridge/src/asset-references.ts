import * as path from "node:path";
import { manifestKey } from "./path-policy";
import type { AttachmentReferenceResolution } from "./types";

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function extractLocalReferences(content: string): string[] {
  const result = new Set<string>();
  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) addReference(result, match[1]);
  for (const match of content.matchAll(/!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) addReference(result, match[1]);
  for (const match of content.matchAll(/["']([^"']+\.(?:png|jpe?g|gif|webp|svg|pdf))["']/gi)) addReference(result, match[1]);
  return [...result];
}

export function resolveLocalReference(documentPath: string, reference: string, sourceFiles: string[], extensions: string[], caseInsensitive = process.platform === "win32"): AttachmentReferenceResolution {
  const cleaned = cleanReference(reference);
  if (!cleaned || URI_SCHEME.test(cleaned) || path.posix.isAbsolute(cleaned) || /^[a-zA-Z]:[\\/]/.test(cleaned)) return {};
  const normalizedFiles = [...new Set(sourceFiles.map((file) => file.replace(/\\/g, "/")))];
  const candidates = [path.posix.normalize(path.posix.join(path.posix.dirname(documentPath), cleaned)), path.posix.normalize(cleaned)];
  for (const candidate of candidates) {
    if (candidate.startsWith("../") || candidate === "..") continue;
    const matches = normalizedFiles.filter((file) => manifestKey(file, caseInsensitive) === manifestKey(candidate, caseInsensitive) && allowed(file, extensions));
    if (matches.length === 1) return { path: matches[0] };
    if (matches.length > 1) return { warning: `Ambiguous attachment reference '${reference}' in ${documentPath}` };
  }
  if (!cleaned.includes("/")) {
    const basename = path.posix.basename(cleaned).toLowerCase();
    const matches = normalizedFiles.filter((file) => path.posix.basename(file).toLowerCase() === basename && allowed(file, extensions));
    if (matches.length === 1) return { path: matches[0] };
    if (matches.length > 1) return { warning: `Ambiguous attachment reference '${reference}' in ${documentPath}` };
  }
  return { warning: `Attachment reference outside source root or missing: '${reference}' in ${documentPath}` };
}

function addReference(target: Set<string>, value: string): void {
  const cleaned = cleanReference(value.trim().replace(/^<|>$/g, ""));
  if (cleaned) target.add(cleaned);
}

function cleanReference(value: string): string {
  const withoutSuffix = value.split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(withoutSuffix).replace(/\\/g, "/");
  } catch {
    return withoutSuffix.replace(/\\/g, "/");
  }
}

function allowed(value: string, extensions: string[]): boolean {
  return extensions.map((extension) => extension.toLowerCase()).includes(value.split(".").pop()?.toLowerCase() ?? "");
}
