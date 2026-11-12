import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("notification dialog is anchored to the viewport instead of the header flow", () => {
  assert.match(css, /dialog\.notification-panel\[open\]\s*\{[^}]*position:fixed/s);
  assert.match(css, /@media\(max-width:650px\)\s*\{[\s\S]*?dialog\.notification-panel\[open\]\s*\{[^}]*inset:50% 10px auto/s);
  assert.match(css, /\.notification-copy\{[^}]*overflow-wrap:anywhere/s);
});

test("catalog detail dialog respects the mobile dynamic viewport and safe area", () => {
  assert.match(css, /dialog\.catalog-detail-dialog\[open\]\s*\{[^}]*max-height:calc\(100dvh - 20px - env\(safe-area-inset-top\)\)/s);
  assert.match(css, /#catalog-detail-content\{[^}]*padding:15px/s);
});

test("chat and review controls can shrink without horizontal overflow", () => {
  assert.match(css, /\.community-chat-layout,\.community-chat-window,#community-chat-list\{min-width:0\}/);
  assert.match(css, /#community-chat-messages\{min-width:0;overflow-x:hidden\}/);
  assert.match(css, /\.catalog-item-review-form textarea\{max-width:100%;box-sizing:border-box\}/);
  assert.match(css, /@media\(max-width:650px\)[\s\S]*?#community-chat-messages\{min-height:220px;max-height:min\(42dvh,360px\)/s);
});

test("responsive stylesheet cache version is refreshed", () => {
  assert.match(html, /styles\.css\?v=20261112-responsive2/);
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/);
});
