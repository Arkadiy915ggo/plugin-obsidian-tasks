import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, stat, unlink } from "node:fs/promises";
import * as path from "node:path";
import type { ManagedKind } from "./types";
import { isIgnored, isPathInsideOrEqual, sourcePath, sourceRelative, type PathPolicy } from "./path-policy";

export interface SourceFile {
  relativePath: string;
  kind: ManagedKind;
  hash: string;
}

export function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class SourceStore {
  constructor(private readonly policy: PathPolicy, private readonly ignores: string[], private readonly assetExtensions: string[]) {}

  async scan(): Promise<SourceFile[]> {
    await this.sourceRoot();
    const result: SourceFile[] = [];
    await this.scanDirectory(this.policy.sourceRoot, result);
    return result;
  }

  async read(relativePath: string): Promise<Uint8Array> {
    const target = await this.target(relativePath, true);
    return readFile(target);
  }

  async hash(relativePath: string): Promise<string | null> {
    try {
      const target = await this.target(relativePath, true);
      const before = await stat(target);
      const content = await this.read(relativePath);
      await this.target(relativePath, true);
      const after = await stat(target);
      if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) return null;
      return sha256(content);
    } catch (error: unknown) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async writeAtomic(relativePath: string, content: Uint8Array): Promise<string> {
    const target = await this.target(relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await this.target(relativePath);
    const temporary = `${target}.project-docs-${process.pid}-${Date.now()}.tmp`;
    const temporaryRelative = sourceRelative(this.policy, temporary);
    if (!temporaryRelative) throw new Error(`Unsafe temporary source path: ${temporary}`);
    try {
      await this.target(temporaryRelative);
      const handle = await open(temporary, "wx");
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
      await rename(temporary, target);
    } catch (error: unknown) {
      if (process.platform === "win32" && isRetryableWindowsError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        try {
          await this.target(temporaryRelative, true);
          await this.target(relativePath);
          await rename(temporary, target);
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

  async moveToQuarantine(relativePath: string): Promise<void> {
    const source = await this.target(relativePath, true);
    const quarantineRelative = path.posix.join(".project-docs-trash", safeTimestamp(), relativePath.replace(/\\/g, "/"));
    const destination = await this.target(quarantineRelative, false, true);
    await mkdir(path.dirname(destination), { recursive: true });
    await this.target(quarantineRelative, false, true);
    await this.target(relativePath, true);
    await rename(source, destination);
  }

  async rename(relativeFrom: string, relativeTo: string): Promise<void> {
    const from = await this.target(relativeFrom, true);
    const to = await this.target(relativeTo);
    await mkdir(path.dirname(to), { recursive: true });
    await this.target(relativeTo);
    await this.target(relativeFrom, true);
    if (process.platform === "win32" && from.toLowerCase() === to.toLowerCase() && from !== to) {
      const temporary = `${from}.project-docs-case-${Date.now()}`;
      const temporaryRelative = sourceRelative(this.policy, temporary);
      if (!temporaryRelative) throw new Error(`Unsafe temporary source path: ${temporary}`);
      await this.target(temporaryRelative);
      await this.target(relativeFrom, true);
      await rename(from, temporary);
      try {
        await this.target(temporaryRelative, true);
        await this.target(relativeTo);
        await rename(temporary, to);
      } catch (error) {
        try {
          await this.target(temporaryRelative, true);
          await this.target(relativeFrom);
          await rename(temporary, from);
        } catch {
          // Keep the original failure: the temporary path is safer than data loss.
        }
        throw error;
      }
      return;
    }
    await rename(from, to);
  }

  async exists(relativePath: string): Promise<boolean> {
    return (await this.hash(relativePath)) !== null;
  }

  private async scanDirectory(directory: string, result: SourceFile[]): Promise<void> {
    const relativeDirectory = sourceRelative(this.policy, directory);
    if (relativeDirectory) await this.target(relativeDirectory, true);
    else await this.sourceRoot();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
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

  private async target(relativePath: string, mustExist = false, allowInternalPath = false): Promise<string> {
    if (!allowInternalPath && isIgnored(relativePath, this.ignores)) throw new Error(`Ignored source path: ${relativePath}`);
    const target = sourcePath(this.policy, relativePath);
    if (!target) throw new Error(`Unsafe source path: ${relativePath}`);
    const roots = await this.roots();
    const parent = await this.existingParent(target);
    this.assertInsideSource(parent, roots, target);
    try {
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink()) throw new Error(`Symlinked source path: ${relativePath}`);
      this.assertInsideSource(await realpath(target), roots, target);
    } catch (error: unknown) {
      if (!isMissing(error)) throw error;
      if (mustExist) throw error;
    }
    return target;
  }

  private async sourceRoot(): Promise<string> {
    return (await this.roots()).sourceRoot;
  }

  private async roots(): Promise<{ sourceRoot: string; vaultRoot: string }> {
    const sourceRoot = await realpath(this.policy.sourceRoot);
    const vaultRoot = await realpath(this.policy.vaultRoot);
    if (isPathInsideOrEqual(vaultRoot, sourceRoot) || !isPathInsideOrEqual(sourceRoot, vaultRoot)) throw new Error("Source root must contain, but not equal, the vault root");
    return { sourceRoot, vaultRoot };
  }

  private async existingParent(target: string): Promise<string> {
    let current = path.dirname(target);
    while (true) {
      try {
        return await realpath(current);
      } catch (error: unknown) {
        if (!isMissing(error)) throw error;
        const parent = path.dirname(current);
        if (parent === current) throw error;
        current = parent;
      }
    }
  }

  private assertInsideSource(candidate: string, roots: { sourceRoot: string; vaultRoot: string }, target: string): void {
    if (!isPathInsideOrEqual(roots.sourceRoot, candidate) || isPathInsideOrEqual(roots.vaultRoot, candidate)) throw new Error(`Source path escapes source root or enters vault: ${target}`);
  }

  private async cleanupTemporary(temporary: string, temporaryRelative: string): Promise<void> {
    try {
      await this.target(temporaryRelative, true);
      await unlink(temporary);
    } catch {}
  }
}

export function fileKind(relativePath: string, assetExtensions: string[]): ManagedKind | null {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".excalidraw")) return "document";
  const extension = lower.split(".").pop() ?? "";
  return assetExtensions.map((item) => item.toLowerCase()).includes(extension) ? "attachment" : null;
}

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

function isRetryableWindowsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && ["EPERM", "EACCES"].includes((error as { code?: string }).code ?? "");
}
