import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../features/chat/citations.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { groupCitationsByDocument } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("one document groups all hits, removes repeated chunk IDs and preserves retrieval order", () => {
  const first = { document_id: "a", document_name: "A", chunk_id: "a-2", content_preview: "second" };
  const other = { document_id: "b", document_name: "B", chunk_id: "b-1", content_preview: "other" };
  const last = { ...first, chunk_id: "a-1", content_preview: "first" };
  const input = [first, other, last, { ...first }];
  const groups = groupCitationsByDocument(input);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].chunks, [first, last]);
  assert.deepEqual(groups[1].chunks, [other]);
  assert.equal(groups[0].source.document_id, "a");
  assert.equal(input.length, 4);
});

test("same filenames in different documents remain separate; equal text with different chunk IDs is retained", () => {
  const hit = { document_id: "a", document_name: "同名文件", chunk_id: "1", content_preview: "same text" };
  const groups = groupCitationsByDocument([hit, { ...hit, document_id: "b" }, { ...hit, chunk_id: "2" }]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].chunks.length, 2);
});

test("legacy history without IDs still groups and empty retrieval stays empty", () => {
  const first = { document_name: "历史文档", content_preview: "one" };
  const second = { ...first, content_preview: "two" };
  assert.deepEqual(groupCitationsByDocument([first, second, first])[0].chunks, [first, second]);
  assert.deepEqual(groupCitationsByDocument([]), []);
});
