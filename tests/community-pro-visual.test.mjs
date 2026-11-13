import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");

test("Community PRO visual layer styles the existing workspace and tabs", () => {
  assert.match(css, /\.community-workspace\{[^}]*backdrop-filter:blur\(18px\)/s);
  assert.match(css, /\.community-workspace-head:after\{/);
  assert.match(css, /\.community-tabs button\.active\{/);
  assert.match(css, /\.community-feature-card,\.community-post-card/);
});

test("Community PRO improves existing friends, groups, private chat and profile surfaces", () => {
  assert.match(css, /\.community-list-row:hover\{/);
  assert.match(css, /\.community-group-card:hover\{/);
  assert.match(css, /\.community-message\.mine\{/);
  assert.match(css, /#community-profile-form\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /#community-chat-form input:focus\{/);
});

test("Community PRO preserves mobile layout and reduced motion preferences", () => {
  assert.match(css, /@media\(max-width:520px\)[\s\S]*?#community-profile-form\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.community-post-card/);
  assert.match(css, /\.community-chat-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test("Community PRO is a CSS-only visual update with cache bust", () => {
  assert.match(html, /styles\.css\?v=20261113-community-pro1/);
  assert.match(app, /function openCommunity\(\)/);
  assert.match(app, /function loadCommunityFriends\(\)/);
  assert.match(app, /function loadCommunityGroups\(\)/);
  assert.match(app, /function openCommunityChat\(/);
  assert.match(app, /function loadNotifications\(\)/);
});
