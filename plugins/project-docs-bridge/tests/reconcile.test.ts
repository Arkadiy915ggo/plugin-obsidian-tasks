import assert from "node:assert/strict";
import test from "node:test";
import { decideReconcile } from "../src/reconcile";

const cases: Array<[string, Parameters<typeof decideReconcile>[0], ReturnType<typeof decideReconcile>]> = [
  ["equal active versions accept", { baseHash: "a", sourceHash: "a", mirrorHash: "a" }, "accept"],
  ["source changed only", { baseHash: "a", sourceHash: "b", mirrorHash: "a" }, "copy-source-to-mirror"],
  ["mirror changed only", { baseHash: "a", sourceHash: "a", mirrorHash: "b" }, "copy-mirror-to-source"],
  ["simultaneous identical change", { baseHash: "a", sourceHash: "b", mirrorHash: "b" }, "accept"],
  ["simultaneous different change", { baseHash: "a", sourceHash: "b", mirrorHash: "c" }, "conflict"],
  ["new source only", { baseHash: null, sourceHash: "a", mirrorHash: null }, "create-mirror"],
  ["new mirror only", { baseHash: null, sourceHash: null, mirrorHash: "a" }, "create-source"],
  ["new unequal copies conflict", { baseHash: null, sourceHash: "a", mirrorHash: "b" }, "conflict"],
  ["source deleted, mirror unchanged", { baseHash: "a", sourceHash: null, mirrorHash: "a" }, "trash-mirror"],
  ["mirror deleted, source unchanged", { baseHash: "a", sourceHash: "a", mirrorHash: null }, "quarantine-source"],
  ["source deleted versus mirror change", { baseHash: "a", sourceHash: null, mirrorHash: "b" }, "conflict"],
  ["mirror deleted versus source change", { baseHash: "a", sourceHash: "b", mirrorHash: null }, "conflict"],
  ["both deleted", { baseHash: "a", sourceHash: null, mirrorHash: null }, "tombstone"],
  ["retains a tombstone while both copies remain deleted", { baseHash: "a", sourceHash: null, mirrorHash: null, status: "tombstone" }, "retain-tombstone"],
  ["recreates mirror when a tombstoned source returns", { baseHash: "a", sourceHash: "b", mirrorHash: null, status: "tombstone" }, "create-mirror"],
  ["recreates source when a tombstoned mirror returns", { baseHash: "a", sourceHash: null, mirrorHash: "b", status: "tombstone" }, "create-source"],
  ["resolved conflict automatically accepts equal copies", { baseHash: "a", sourceHash: "b", mirrorHash: "b", status: "conflict" }, "accept"]
];

for (const [name, input, expected] of cases) test(name, () => assert.equal(decideReconcile(input), expected));
