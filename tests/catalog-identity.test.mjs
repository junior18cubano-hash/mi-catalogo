import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const start = source.indexOf("function reviewItemKey");
const end = source.indexOf("function showReviewMatches", start);
assert.ok(start >= 0 && end > start, "catalog identity helpers must exist");
const context = {
  catalogItems: [],
  itemType: item => String(item.type || item.tipo || "otros").toLowerCase(),
  itemTitle: item => String(item.title || item.name || "Contenido JOA")
};
const helpers = vm.runInNewContext(
  `${source.slice(start, end)}; ({ reviewItemKey, hasStableCatalogIdentifier, catalogIdentityIsAmbiguous })`,
  context
);

test("duplicate title-only catalog entries are marked ambiguous", () => {
  const first = { type: "juego", title: "Aventura" };
  const second = { type: "juego", title: "Aventura" };
  context.catalogItems = [first, second];
  assert.equal(helpers.catalogIdentityIsAmbiguous(first), true);
  assert.equal(helpers.catalogIdentityIsAmbiguous(second), true);
});

test("unique title-only entries remain compatible with their existing legacy key", () => {
  const item = { type: "pelicula", title: "Una historia" };
  context.catalogItems = [item];
  assert.equal(helpers.catalogIdentityIsAmbiguous(item), false);
  assert.equal(helpers.reviewItemKey(item), "pelicula:una historia");
});

test("external IDs and slugs retain the existing key strategy and avoid title collisions", () => {
  const first = { type: "juego", title: "Mismo título", igdb_id: 101 };
  const second = { type: "juego", title: "Mismo título", igdb_id: 202 };
  context.catalogItems = [first, second];
  assert.equal(helpers.catalogIdentityIsAmbiguous(first), false);
  assert.equal(helpers.catalogIdentityIsAmbiguous(second), false);
  assert.equal(helpers.reviewItemKey(first), "juego:101");
  assert.equal(helpers.reviewItemKey(second), "juego:202");
});

test("favorite detail reconstruction preserves its original persisted review key", () => {
  assert.match(source, /_joaReviewKey:row\.item_key/);
  assert.match(source, /if\(item\?\._joaReviewKey\)return String\(item\._joaReviewKey\)/);
});

test("ambiguous catalog entries cannot publish reviews or be added as favorites", () => {
  assert.match(source, /if\(catalogIdentityIsAmbiguous\(item\)\)\{summary\.textContent=/);
  assert.match(source, /if\(catalogIdentityIsAmbiguous\(item\)\)\{toast\(/);
  assert.match(source, /favorite\.disabled=ambiguous/);
  assert.match(source, /if\(catalogIdentityIsAmbiguous\(item\)\)\{selected\.hidden=false/);
});
