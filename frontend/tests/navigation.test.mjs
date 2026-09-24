import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function load(file, dependencies = {}) {
  const path = new URL("../" + file, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => dependencies[name] ?? require(name), module, module.exports);
  return module.exports;
}
const { createReadCache } = load("lib/readCache.ts");
test("concurrent and subsequent reads reuse response with independently consumable bodies", async () => {
  const cache = createReadCache(); let calls = 0;
  const loader = async () => { calls++; return Response.json({ count: 3 }); };
  const responses = await Promise.all([cache.read("kb", loader), cache.read("kb", loader)]);
  assert.deepEqual(await Promise.all(responses.map(r => r.json())), [{count:3},{count:3}]);
  assert.equal((await (await cache.read("kb", loader)).json()).count, 3);
  assert.equal(calls, 1);
});
test("logout or mutation invalidation prevents pending old response repopulating cache", async () => {
  const cache = createReadCache(); let resolve;
  const old = cache.read("kb", () => new Promise(r => {resolve = r;}));
  cache.clear();
  await cache.read("kb", async () => Response.json("new user"));
  resolve(Response.json("old user")); await old;
  assert.equal(await (await cache.read("kb", () => {throw Error("should reuse new result");})).json(), "new user");
});
test("expired and failed reads are fetched again", async () => {
  const cache = createReadCache(-1); let calls = 0;
  const loader = async () => { calls++; return Response.json(calls); };
  await cache.read("kb", loader); await cache.read("kb", loader); assert.equal(calls,2);
  await assert.rejects(cache.read("fail", async () => {throw Error("offline");}));
  assert.equal(await (await cache.read("fail", async () => Response.json("recovered"))).json(),"recovered");
});
const { reducer, initialState } = load("features/auth/AuthContext.tsx", {
  "@/types/common": {ApiError: Error}, "@/lib/apiClient": {}, "./api": {},
});
const profile = {user:{id:"a",role:"user"},org:{id:"o"},department:{id:"d"}};
test("initial restore blocks but background validation preserves authenticated page", () => {
  assert.equal(reducer(initialState,{type:"AUTH_LOADING"}).initializing,true);
  const signedIn = reducer(initialState,{type:"AUTH_SUCCESS",payload:profile});
  const validating = reducer(signedIn,{type:"AUTH_LOADING"});
  assert.equal(validating.status,"authenticated"); assert.equal(validating.initializing,false);
  assert.equal(validating.revalidating,true);
  const offline = reducer(validating,{type:"AUTH_ERROR",error:"offline"});
  assert.equal(offline.status,"authenticated"); assert.equal(offline.error,"offline");
  const expired = reducer(offline,{type:"AUTH_UNAUTHENTICATED"});
  assert.equal(expired.status,"unauthenticated"); assert.equal(expired.user,null);
});
test("authentication gate only renders restore message during initial authentication", () => {
  let auth = initialState;
  const { AuthGate } = load("features/auth/AuthGate.tsx", {
    "next/navigation": {useRouter:()=>({}),usePathname:()=>"/history"},
    "./hooks": {useAuth:()=>auth},
  });
  const render = () => renderToStaticMarkup(React.createElement(AuthGate,null,"page content"));
  assert.match(render(),/正在恢复登录态/);
  auth = reducer(reducer(initialState,{type:"AUTH_SUCCESS",payload:profile}),{type:"AUTH_LOADING"});
  assert.equal(render(),"page content");
  auth = reducer(auth,{type:"AUTH_UNAUTHENTICATED"}); assert.equal(render(),"");
});
