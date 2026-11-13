import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const openStart = source.indexOf("function openCommunity()");
const openEnd = source.indexOf("function closeCommunity()", openStart);
const headerStart = source.indexOf("function updateHeader(user,session=null)");
const headerEnd = source.indexOf("function escapeHtml", headerStart);

assert.ok(openStart >= 0 && openEnd > openStart, "community opener must exist");
assert.ok(headerStart >= 0 && headerEnd > headerStart, "auth header updater must exist");
const opener = source.slice(openStart, openEnd);
const header = source.slice(headerStart, headerEnd);

test("opening Community retries profile initialization after a previous failure", () => {
  assert.match(opener, /communityProfilePromiseUserId!==currentUser\.id\|\|!communityProfilePromise/);
  assert.match(opener, /updateHeader\(currentUser,currentSession\)/);
});

test("profile initialization clears a rejected promise so the same account can retry", () => {
  assert.match(header, /communityProfilePromise=Promise\.resolve\(\)\.then\(\(\)=>ensureCommunityProfile\(user\)\)/);
  assert.match(header, /communityProfilePromise!==profilePromise/);
  assert.match(header, /communityProfilePromise=null;communityProfilePromiseUserId=null/);
});

test("profile responses cannot replace state for another account or newer attempt", () => {
  assert.match(header, /currentUser\?\.id!==userId\|\|communityProfilePromise!==profilePromise/);
  assert.match(header, /if\(currentUser\?\.id===userId&&communityRequested\)openCommunity\(\)/);
});

test("main page requests the retry-enabled JavaScript bundle", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /app\.js\?v=20261113-service-details1/);
});
