import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("catalog cards retain the production DOM contract and gain the Hybrid PRO treatment", () => {
  assert.match(app, /article\.className="content-card catalog-live-card"/);
  assert.match(app, /favorite\.className="favorite-toggle"/);
  assert.match(app, /reviewSummary\.className="catalog-review-compact"/);
  assert.match(css, /#catalog-results \.catalog-live-card\{[\s\S]*?border-radius:17px/);
  assert.match(css, /#catalog-results \.catalog-live-card \.poster:after/);
  assert.match(css, /#catalog-results \.catalog-card-wrap>\.favorite-toggle\.is-favorite/);
});

test("catalog detail styling preserves the review and metadata containers", () => {
  assert.match(app, /hero\.className="detail-hero"/);
  assert.match(app, /info\.className="detail-info"/);
  assert.match(app, /reviews\.className="catalog-item-reviews"/);
  assert.match(app, /heading\.className="catalog-reviews-heading"/);
  assert.match(css, /#catalog-detail-content \.catalog-item-reviews\{[\s\S]*?grid-column:1\/-1/);
  assert.match(css, /#catalog-detail-content \.catalog-item-review-form/);
});

test("catalog detail and favorites remain responsive on narrow screens", () => {
  assert.match(css, /@media\(max-width:650px\)[\s\S]*?#catalog-detail-content\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /@media\(max-width:380px\)[\s\S]*?#catalog-detail-content/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?#catalog-results \.catalog-live-card:after/);
});

test("the page loads the second catalog visual revision", () => {
  assert.match(html, /styles\.css\?v=20261112-hybrid-pro2/);
});
