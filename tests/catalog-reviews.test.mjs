import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const start = source.indexOf("function addReviewRowsToAggregates(");
const end = source.indexOf("  async function loadCatalogReviewAggregates", start);
assert.ok(start >= 0 && end > start, "the production aggregation helper must exist");
const helperSource = source.slice(start, end);
const addRows = vm.runInNewContext(`${helperSource}; addReviewRowsToAggregates`);

test("aggregates every rating row by catalog item, not only the visible review page", () => {
  const sums = addRows([
    { external_item_id: "game:1", rating: 5 },
    { external_item_id: "game:1", rating: 3 },
    { external_item_id: "movie:2", rating: 4 },
    { external_item_id: "game:1", rating: 1 },
    { external_item_id: null, rating: 5 },
    { external_item_id: "game:1", rating: "invalid" }
  ], new Map());
  assert.equal(sums.get("game:1").total, 9);
  assert.equal(sums.get("game:1").count, 3);
  assert.equal(sums.get("movie:2").total, 4);
  assert.equal(sums.get("movie:2").count, 1);
});

test("production aggregate loader paginates beyond the REST row cap", () => {
  assert.match(source, /\.range\(offset,offset\+pageSize-1\)/);
  assert.match(source, /if\(rows\.length<pageSize\)break/);
  assert.match(source, /\.order\("id",\{ascending:true\}\)/);
});

test("detail modal uses all-rating aggregates while retaining the latest 50 full reviews", () => {
  assert.match(source, /loadCatalogReviewAggregates\(\[key\]\)/);
  assert.match(source, /\.order\("created_at",\{ascending:false\}\)\.limit\(50\)/);
  assert.match(source, /\.eq\("user_id",currentUser\.id\)\.maybeSingle\(\)/);
  assert.match(source, /const own=ownReview/);
});

test("rating sort is explicitly identified as the external catalog rating", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /Mejor valorados · ficha externa/);
});
