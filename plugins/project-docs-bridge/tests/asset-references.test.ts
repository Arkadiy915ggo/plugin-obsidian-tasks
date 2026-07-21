import assert from "node:assert/strict";
import test from "node:test";
import { extractLocalReferences, resolveLocalReference } from "../src/asset-references";

const files = ["packages/api/docs.md", "packages/images/a image.png", "files/scheme.pdf", "drawings/diagram.png", "other/diagram.png"];

test("extracts Markdown, wiki and Excalidraw asset references", () => {
  const content = "![](../images/a%20image.png#view)\n[scheme](../../files/scheme.pdf?download=1)\n![[drawings/diagram.png]]\n\"files/embedded.pdf\"";
  assert.deepEqual(extractLocalReferences(content), ["../images/a image.png", "../../files/scheme.pdf", "drawings/diagram.png", "files/embedded.pdf"]);
});

test("resolves supported local attachments and rejects remote/outside paths", () => {
  assert.equal(resolveLocalReference("packages/api/docs.md", "../images/a%20image.png", files, ["png", "pdf"]).path, "packages/images/a image.png");
  assert.equal(resolveLocalReference("packages/api/docs.md", "../../files/scheme.pdf", files, ["png", "pdf"]).path, "files/scheme.pdf");
  assert.equal(resolveLocalReference("packages/api/docs.md", "https://example.com/a.png", files, ["png", "pdf"]).path, undefined);
  assert.match(resolveLocalReference("packages/api/docs.md", "../../../outside.png", files, ["png", "pdf"]).warning ?? "", /outside/);
});

test("reports ambiguous wiki basename", () => {
  assert.match(resolveLocalReference("packages/api/docs.md", "diagram.png", files, ["png"]).warning ?? "", /Ambiguous/);
});

test("resolves Windows attachment paths without losing the source spelling", () => {
  const windowsFiles = ["Docs/Images/Chart.PNG"];
  assert.equal(resolveLocalReference("docs/readme.md", "images/chart.png", windowsFiles, ["png"], true).path, "Docs/Images/Chart.PNG");
});

test("rejects case-insensitive attachment collisions", () => {
  const collidingFiles = ["Docs/Chart.PNG", "docs/chart.png"];
  assert.match(resolveLocalReference("docs/readme.md", "chart.png", collidingFiles, ["png"], true).warning ?? "", /Ambiguous/);
});
