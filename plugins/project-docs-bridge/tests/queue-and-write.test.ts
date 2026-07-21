import assert from "node:assert/strict";
import test from "node:test";
import { ExpectedHashSuppressor, ReconcileQueue } from "../src/reconcile-queue";
import { writeThenCommit } from "../src/sync-write";
import type { SyncManifestEntry } from "../src/types";

test("suppresses only the next exact expected watcher-loop event", () => {
  const suppressor = new ExpectedHashSuppressor();
  suppressor.expect("docs/a.md", "expected");
  assert.equal(suppressor.consume("docs/a.md", "different"), false);
  assert.equal(suppressor.consume("docs/a.md", "expected"), false);
  suppressor.expect("docs/a.md", "expected");
  assert.equal(suppressor.consume("docs/a.md", "expected"), true);
  assert.equal(suppressor.consume("docs/a.md", "expected"), false);
});

test("stop waits for an active reconcile", async () => {
  let release: (() => void) | undefined;
  const active = new Promise<void>((resolve) => { release = resolve; });
  const queue = new ReconcileQueue(() => 1, async () => active);
  queue.request();
  await new Promise((resolve) => setTimeout(resolve, 10));
  let stopped = false;
  const stopping = queue.stop().then(() => { stopped = true; });
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(stopped, false);
  release?.();
  await stopping;
  assert.equal(stopped, true);
});

test("debounces bursts and reruns once when an event arrives during reconcile", async () => {
  let runs = 0;
  let releaseFirstRun: (() => void) | undefined;
  const firstRun = new Promise<void>((resolve) => { releaseFirstRun = resolve; });
  const queue = new ReconcileQueue(() => 1, async () => {
    runs += 1;
    if (runs === 1) await firstRun;
  });
  queue.request();
  queue.request();
  queue.request();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(runs, 1);
  queue.request();
  releaseFirstRun?.();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(runs, 2);
  await queue.stop();
});

test("failed write does not update baseHash", async () => {
  const entries: Record<string, SyncManifestEntry> = {
    "docs/a.md": { relativePath: "docs/a.md", kind: "document", baseHash: "old", sourceHash: "new", mirrorHash: "old", status: "active" }
  };
  await assert.rejects(writeThenCommit(async () => { throw new Error("disk full"); }, entries, "docs/a.md", "docs/a.md", "document", "new"));
  assert.equal(entries["docs/a.md"].baseHash, "old");
});
