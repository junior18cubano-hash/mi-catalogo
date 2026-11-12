import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

test("only the newest catalog load may apply a response", () => {
  const start = source.indexOf("function isCurrentCatalogLoad");
  const end = source.indexOf("async function openCatalogDB", start);
  assert.ok(start >= 0 && end > start, "catalog generation guard must exist");
  const helpers = vm.runInNewContext(
    `${source.slice(start, end)}; isCurrentCatalogLoad`
  );
  assert.equal(helpers(2, 2), true);
  assert.equal(helpers(1, 2), false);
  assert.equal(helpers(3, 2), false);
});

test("catalog loader checks its generation after asynchronous boundaries", () => {
  const start = source.indexOf("async function loadCatalog(force=false)");
  const end = source.indexOf('$("#catalog-refresh")', start);
  assert.ok(start >= 0 && end > start, "catalog loader must exist");
  const loader = source.slice(start, end);
  assert.match(loader, /const generation=\+\+catalogLoadGeneration/);
  assert.ok((loader.match(/isCurrentCatalogLoad\(generation,catalogLoadGeneration\)/g)||[]).length >= 6);
  assert.match(loader, /if\(catalogLoadPromise&&!force\)return catalogLoadPromise/);
});

test("main page busts the JavaScript cache after catalog loader changes", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /app\.js\?v=20261112-review-summary-race1/);
});
