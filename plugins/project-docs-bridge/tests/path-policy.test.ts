import assert from "node:assert/strict";
import test from "node:test";
import { createPathPolicy, findCaseCollisions, isIgnored, manifestKey, mirrorPath, mirrorRelative, sourcePath, sourceRelative } from "../src/path-policy";

test("maps source and mirror paths reversibly", () => {
  const policy = createPathPolicy("/repo/.project-vault", "..", "doc", "linux");
  assert.ok(policy);
  assert.equal(sourceRelative(policy, "/repo/packages/api/docs.md", "linux"), "packages/api/docs.md");
  assert.equal(sourcePath(policy, "packages/api/docs.md", "linux"), "/repo/packages/api/docs.md");
  assert.equal(mirrorPath(policy, "packages/api/docs.md"), "doc/packages/api/docs.md");
  assert.equal(mirrorRelative(policy, "doc/packages/api/docs.md"), "packages/api/docs.md");
});

test("rejects unsafe mirror roots and vault escapes", () => {
  assert.equal(createPathPolicy("/repo/.vault", "..", "../doc", "linux"), null);
  assert.equal(createPathPolicy("/repo/.vault", "..", ".obsidian", "linux"), null);
  assert.equal(createPathPolicy("/repo/.vault", "..", "doc/_project-docs-conflicts", "linux"), null);
  const policy = createPathPolicy("/repo/.vault", "..", "doc", "linux");
  assert.ok(policy);
  assert.equal(sourceRelative(policy, "/repo/.vault/doc/a.md", "linux"), null);
  assert.equal(sourcePath(policy, "../outside.md", "linux"), null);
});

test("normalizes Windows lookup keys and detects case collisions", () => {
  const policy = createPathPolicy("C:\\repo\\vault", "..", "doc", "win32");
  assert.ok(policy);
  assert.equal(manifestKey("Docs/A.md", true), "docs/a.md");
  assert.deepEqual(findCaseCollisions(["Docs/A.md", "docs/a.md"], true), [["Docs/A.md", "docs/a.md"]]);
  assert.equal(sourceRelative(policy, "C:\\repo\\vault\\doc\\a.md", "win32"), null);
});

test("always honors ignored roots", () => {
  assert.equal(isIgnored(".git/config", []), true);
  assert.equal(isIgnored("packages/.obsidian/app.json", []), true);
  assert.equal(isIgnored("node_modules/package/index.js", []), true);
  assert.equal(isIgnored(".project-docs-trash/2026-01-01/a.md", []), true);
  assert.equal(isIgnored("_project-docs-conflicts/snapshot.md", []), true);
  assert.equal(isIgnored("packages/api/doc.md", ["node_modules/**"]), false);
});

test("reserves the conflict namespace from normal mirror paths", () => {
  const policy = createPathPolicy("/repo/.vault", "..", "doc", "linux");
  assert.ok(policy);
  assert.equal(mirrorPath(policy, "_project-docs-conflicts/snapshot.md"), null);
  assert.equal(mirrorRelative(policy, "doc/_project-docs-conflicts/snapshot.md"), null);
});
