import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles.css",import.meta.url),"utf8");
const js=readFileSync(new URL("../app.js",import.meta.url),"utf8");

test("service cards expose a detail action",()=>{
  assert.equal((html.match(/data-service-open/g)||[]).length,4);
  assert.match(html,/id="service-detail-dialog"/);
});

test("service detail dialog opens from the selected card and closes accessibly",()=>{
  assert.match(js,/closest\?\.\("\[data-service-open\]"\)/);
  assert.match(js,/serviceDetailDialog\.showModal\(\)/);
  assert.match(js,/service-detail-close/);
  assert.match(css,/\.service-detail-dialog/);
});
