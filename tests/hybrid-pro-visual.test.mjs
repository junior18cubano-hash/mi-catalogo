import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("Hybrid PRO foundation preserves the established JOA palette and adds layered surfaces", () => {
  assert.match(css, /--surface-glass:rgba\(12,19,37,.78\)/);
  assert.match(css, /\.topbar\{[\s\S]*?backdrop-filter:blur\(20px\)/);
  assert.match(css, /\.hero-art\{[\s\S]*?border-radius:30px/);
  assert.match(css, /\.community-section\{[\s\S]*?background-image:[\s\S]*?images\.unsplash\.com/);
});

test("catalog cards gain consistent poster proportions without changing their markup contract", () => {
  assert.match(css, /\.catalog-live-card \.poster\{[\s\S]*?aspect-ratio:3\/4/);
  assert.match(css, /\.catalog-live-card \.poster>img\{[\s\S]*?object-fit:cover/);
  assert.match(css, /\.catalog-live-card \.catalog-type-badge/);
});

test("visual effects respect reduced-motion preferences and keyboard focus", () => {
  assert.match(css, /:focus-visible\{outline:2px solid var\(--cyan\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.catalog-live-card/);
});

test("the page loads the Hybrid PRO stylesheet revision", () => {
  assert.match(html, /styles\.css\?v=20261113-rewards-admin1/);
});


test("a single reward cover fills the complete reserved image area while multi-item packages keep their two-column gallery", () => {
  assert.match(css, /\.reward-cover-gallery:not\(\.is-multiple\)\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.reward-cover-gallery:not\(\.is-multiple\) \.reward-cover-frame img\{[\s\S]*?padding:0;[\s\S]*?object-fit:cover/);
  assert.match(css, /\.reward-cover-gallery\.is-multiple\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:480px\)[\s\S]*?\.reward-cover-gallery:not\(\.is-multiple\)/);
  assert.match(html, /styles\.css\?v=20261114-reward-single-cover1/);
});
