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
