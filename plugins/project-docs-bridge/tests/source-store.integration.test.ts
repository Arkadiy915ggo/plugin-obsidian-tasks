import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import { createPathPolicy } from "../src/path-policy";
import { SourceStore } from "../src/source-store";

async function fixture(): Promise<{ root: string; source: string; vault: string; store: SourceStore }> {
  const root = await mkdtemp(path.join(tmpdir(), "project-docs-bridge-"));
  const source = path.join(root, "repository");
  const vault = path.join(source, ".vault");
  await mkdir(vault, { recursive: true });
  const policy = createPathPolicy(vault, "..", "doc");
  assert.ok(policy);
  return { root, source, vault, store: new SourceStore(policy, [], ["png", "pdf"]) };
}

test("source store excludes the vault and preserves binary content through atomic writes", async () => {
  const { root, source, vault, store } = await fixture();
  try {
    await mkdir(path.join(source, "docs"));
    await writeFile(path.join(source, "docs", "readme.md"), Buffer.from([0xef, 0xbb, 0xbf, 0x61]));
    await writeFile(path.join(vault, "ignored.md"), "vault content");
    const scanned = await store.scan();
    assert.deepEqual(scanned.map((file) => file.relativePath), ["docs/readme.md"]);

    const content = new Uint8Array([0, 1, 2, 255]);
    await store.writeAtomic("docs/image.png", content);
    assert.deepEqual(await readFile(path.join(source, "docs", "image.png")), Buffer.from(content));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source store refuses a symlinked parent that escapes source root", async () => {
  const { root, source, store } = await fixture();
  const outside = await mkdtemp(path.join(tmpdir(), "project-docs-outside-"));
  try {
    await symlink(outside, path.join(source, "escape"));
    await assert.rejects(store.writeAtomic("escape/payload.md", new TextEncoder().encode("blocked")), /escapes source root/);
    await assert.rejects(readFile(path.join(outside, "payload.md")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("mirror deletion quarantines source instead of removing it", async () => {
  const { root, source, store } = await fixture();
  try {
    await mkdir(path.join(source, "docs"));
    await writeFile(path.join(source, "docs", "readme.md"), "recoverable");
    await store.moveToQuarantine("docs/readme.md");
    await assert.rejects(readFile(path.join(source, "docs", "readme.md")));
    const trash = await store.scan();
    assert.deepEqual(trash, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
