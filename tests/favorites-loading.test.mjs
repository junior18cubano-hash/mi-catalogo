import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const start = source.indexOf("function renderFavoriteButtons()");
const end = source.indexOf("async function toggleCatalogFavorite", start);
assert.ok(start >= 0 && end > start, "favorite loading helpers must exist");
const block = source.slice(start, end);

test("favorite queries are coalesced per user and can be explicitly refreshed", () => {
  assert.match(block, /catalogFavoritesPromise&&catalogFavoritesPromiseUserId===userId/);
  assert.match(block, /catalogFavoritesLoadedForUser===userId/);
  assert.match(source, /loadCatalogFavorites\(true\);await loadCommunityFavoriteFriends\(\)/);
});

test("favorite responses from an old account cannot replace the active account list", () => {
  assert.match(block, /generation!==catalogFavoritesLoadGeneration\|\|currentUser\?\.id!==userId/);
  assert.match(source, /catalogFavoritesLoadGeneration\+\+;catalogFavoritesPromise=null/);
});

test("favorite controls stay disabled until the current user's first load completes", () => {
  assert.match(source, /catalogFavoritesLoadingUserId===currentUser\.id/);
  assert.match(source, /button\.disabled=ambiguous\|\|loading/);
  assert.match(source, /Estamos cargando tus favoritos/);
});

test("switching accounts clears the previous account's favorites before loading", () => {
  assert.match(block, /catalogFavoritesLoadedForUser!==userId\)\{catalogFavorites=\[\];catalogFavoritesByKey\.clear\(\)/);
});

test("favorite loading has a bounded wait and always reaches the existing cleanup path", () => {
  assert.match(block, /withCatalogFavoriteTimeout\(query,12000\)/);
  assert.match(block, /JOA_FAVORITES_TIMEOUT/);
  assert.match(block, /catalogFavoritesLoadingUserId=null;catalogFavoritesPromise=null/);
  assert.match(block, /La carga de favoritos tardó demasiado/);
});


test("favorite heart rendering iterates over every button with the all-elements selector", () => {
  assert.ok(source.includes('function renderFavoriteButtons(){$(".favorite-toggle").forEach'));
  assert.ok(!source.includes('function renderFavoriteButtons(){$(".favorite-toggle").forEach'));
});

test("compact review summaries pass a collection of elements to the updater", () => {
  assert.ok(source.includes('updateCatalogReviewSummaryElements($(".catalog-review-compact"),sums)'));
  assert.ok(!source.includes('updateCatalogReviewSummaryElements($(".catalog-review-compact"),sums)'));
});
