import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const start = source.indexOf("async function loadNotifications()");
const end = source.indexOf("async function markAllNotificationsRead", start);
assert.ok(start >= 0 && end > start, "notification loading helpers must exist");
const block = source.slice(start, end);

test("notification responses are discarded after the active account changes", () => {
  assert.match(block, /const userId=currentUser\.id,generation=\+\+notificationsLoadGeneration/);
  assert.match(block, /generation!==notificationsLoadGeneration\|\|currentUser\?\.id!==userId/);
});

test("realtime events are ignored when they belong to a previous account", () => {
  assert.match(block, /if\(notificationsUserId!==userId\|\|currentUser\?\.id!==userId\)return/);
  assert.match(source, /if\(currentUser\?\.id&&currentUser\.id!==user\?\.id\)stopNotificationRealtime\(\)/);
});

test("stopping notification realtime invalidates pending loads", () => {
  assert.match(block, /function stopNotificationRealtime\(\)\{\s*notificationsLoadGeneration\+\+/);
});
