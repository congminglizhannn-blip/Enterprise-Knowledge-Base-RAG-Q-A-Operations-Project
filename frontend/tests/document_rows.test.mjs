import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function load(file) {
  const path = fileURLToPath(new URL(`../features/documents/${file}`, import.meta.url));
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(require, module, module.exports);
  return module.exports;
}

function row(id, createdAt, kbId = "kb") {
  return { id, createdAt, kbId, name: id, type: "PDF", source: kbId, status: "待解析", chunks: 0, owner: "user", time: createdAt };
}

test("document rows are sorted globally by created time across knowledge bases", () => {
  const { sortUploadRows } = load("documentRows.ts");
  const sorted = sortUploadRows([
    row("old-a", "2026-09-24T09:00:00+08:00", "kb-a"),
    row("new-b", "2026-09-24T10:00:00+08:00", "kb-b"),
    row("mid-a", "2026-09-24T09:30:00+08:00", "kb-a"),
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["new-b", "mid-a", "old-a"]);
});

test("document rows use id as a stable fallback when created time ties", () => {
  const { sortUploadRows } = load("documentRows.ts");
  const sorted = sortUploadRows([
    row("aaaaaaaa-0000-0000-0000-000000000000", "2026-09-24T09:00:00+08:00"),
    row("bbbbbbbb-0000-0000-0000-000000000000", "2026-09-24T09:00:00+08:00"),
  ]);
  assert.deepEqual(sorted.map((item) => item.id), [
    "bbbbbbbb-0000-0000-0000-000000000000",
    "aaaaaaaa-0000-0000-0000-000000000000",
  ]);
});
