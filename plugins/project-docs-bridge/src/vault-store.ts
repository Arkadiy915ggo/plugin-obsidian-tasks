import { FileManager, TFile, Vault, normalizePath } from "obsidian";
import type { ManagedKind } from "./types";
import { isReservedMirrorPath, normalizeMirrorPath } from "./path-policy";

export class VaultStore {
  private readonly mirrorRoot: string;

  constructor(private readonly vault: Vault, private readonly fileManager: FileManager, mirrorRoot: string) {
    const normalized = normalizeMirrorPath(mirrorRoot);
    if (!normalized) throw new Error(`Unsafe mirror root: ${mirrorRoot}`);
    this.mirrorRoot = normalized;
  }

  async read(relativePath: string): Promise<Uint8Array | null> {
    const file = this.file(relativePath);
    return file ? new Uint8Array(await this.vault.readBinary(file)) : null;
  }

  async readConflictSnapshot(relativePath: string): Promise<Uint8Array | null> {
    const file = this.file(relativePath, true);
    return file ? new Uint8Array(await this.vault.readBinary(file)) : null;
  }

  async hash(relativePath: string, hash: (value: Uint8Array) => string): Promise<string | null> {
    const content = await this.read(relativePath);
    return content ? hash(content) : null;
  }

  async write(relativePath: string, content: Uint8Array, kind: ManagedKind, allowConflictNamespace = false): Promise<void> {
    void kind;
    const path = this.path(relativePath, allowConflictNamespace);
    await this.ensureParents(path);
    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.vault.modifyBinary(existing, toArrayBuffer(content));
      return;
    }
    await this.vault.createBinary(path, toArrayBuffer(content));
  }

  async trash(relativePath: string): Promise<void> {
    const file = this.file(relativePath);
    if (file) await this.fileManager.trashFile(file);
  }

  async rename(relativeFrom: string, relativeTo: string): Promise<void> {
    const file = this.file(relativeFrom);
    if (!file) return;
    const destination = this.path(relativeTo);
    await this.ensureParents(destination);
    await this.vault.rename(file, destination);
  }

  listRelativeFiles(): string[] {
    const prefix = `${this.mirrorRoot}/`;
    return this.vault.getFiles().map((file) => file.path).filter((file) => file.startsWith(prefix) && !file.startsWith(`${this.mirrorRoot}/_project-docs-conflicts/`)).map((file) => file.slice(prefix.length));
  }

  private file(relativePath: string, allowConflictNamespace = false): TFile | null {
    const value = this.vault.getAbstractFileByPath(this.path(relativePath, allowConflictNamespace));
    return value instanceof TFile ? value : null;
  }

  private path(relativePath: string, allowConflictNamespace = false): string {
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Unsafe vault path: ${relativePath}`);
    if (!allowConflictNamespace && isReservedMirrorPath(normalized)) throw new Error(`Reserved vault path: ${relativePath}`);
    return normalizePath(`${this.mirrorRoot}/${normalized}`);
  }

  private async ensureParents(filePath: string): Promise<void> {
    const parts = filePath.split("/");
    let current = "";
    for (const part of parts.slice(0, -1)) {
      current = current ? `${current}/${part}` : part;
      if (!this.vault.getAbstractFileByPath(current)) await this.vault.createFolder(current);
    }
  }
}

function toArrayBuffer(content: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return copy.buffer;
}
