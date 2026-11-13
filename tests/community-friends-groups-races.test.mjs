import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
function block(startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `Expected source block: ${startText}`);
  return source.slice(start, end);
}
const friends = block("async function loadCommunityFriends()", "async function loadCommunityDirectory()");
const directory = block("async function loadCommunityDirectory()", "async function loadCommunityGroups()");
const groups = block("async function loadCommunityGroups()", "async function openCommunityGroup(");
const detail = block("async function openCommunityGroup(", "async function openCommunityGroupChat(");
const groupChat = block("async function openCommunityGroupChat(", "function showCommunityGroupEditor(");
const updateHeader = block("function updateHeader(user,session=null)", "function ");

test("friendship list discards stale responses between friendship and profile queries", () => {
  assert.match(friends, /userId=currentUser\?\.id,generation=\+\+communityFriendsLoadGeneration/);
  assert.equal((friends.match(/if\(!isCurrent\(\)\)return/g) || []).length, 2);
});

test("player directory ignores responses after account changes or newer searches", () => {
  assert.match(directory, /generation=\+\+communityDirectoryLoadGeneration/);
  assert.match(directory, /if\(!isCurrent\(\)\)return/);
  assert.match(directory, /currentUser\?\.id===userId/);
});

test("group discovery checks account and request generation after each async stage", () => {
  assert.match(groups, /generation=\+\+communityGroupsLoadGeneration/);
  assert.ok((groups.match(/if\(!isCurrent\(\)\)return/g) || []).length >= 3);
});

test("group detail ignores results after another group is opened or account changes", () => {
  assert.match(detail, /generation=\+\+communityGroupDetailGeneration/);
  assert.match(detail, /activeCommunityGroupId===groupId/);
  assert.match(detail, /if\(!isCurrent\(\)\)return/);
  assert.match(detail, /communityGroupDetailGeneration\+\+;panel.hidden=true/);
});

test("group chat history, realtime events and sends are scoped to the active group and user", () => {
  assert.match(groupChat, /generation=\+\+communityGroupChatGeneration/);
  assert.ok((groupChat.match(/if\(!isCurrent\(\)\)return/g) || []).length >= 3);
  assert.match(groupChat, /if\(!isCurrent\(\)\)return;\s*const m=payload.new/);
  assert.match(groupChat, /sender_id:userId/);
});

test("switching accounts invalidates pending friendship and group work", () => {
  assert.match(updateHeader, /communityFriendsLoadGeneration\+\+;communityDirectoryLoadGeneration\+\+;communityGroupsLoadGeneration\+\+;communityGroupDetailGeneration\+\+;communityGroupChatGeneration\+\+/);
});
