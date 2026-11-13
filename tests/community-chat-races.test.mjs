import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const chatsStart = source.indexOf("async function loadCommunityChats()");
const chatsEnd = source.indexOf("function appendCommunityMessage", chatsStart);
assert.ok(chatsStart >= 0 && chatsEnd > chatsStart, "chat list loader must exist");
const chats = source.slice(chatsStart, chatsEnd);
const openStart = source.indexOf("async function openCommunityChat(");
const openEnd = source.indexOf('$("#community-chat-form").addEventListener', openStart);
assert.ok(openStart >= 0 && openEnd > openStart, "chat opener must exist");
const openChat = source.slice(openStart, openEnd);

test("chat list responses are scoped to the account and latest request", () => {
  assert.match(chats, /userId=currentUser\?\.id,generation=\+\+communityChatLoadGeneration/);
  assert.match(chats, /generation===communityChatLoadGeneration&&currentUser\?\.id===userId/);
  assert.match(chats, /if\(!isCurrent\(\)\)return/g);
});

test("opening a conversation ignores responses from a previous selection", () => {
  assert.match(openChat, /generation=\+\+communityChatOpenGeneration/);
  assert.match(openChat, /generation!==communityChatOpenGeneration\|\|currentUser\?\.id!==userId\|\|activeConversationId!==conversationId/);
  assert.match(openChat, /if\(generation!==communityChatOpenGeneration\|\|currentUser\?\.id!==userId\|\|activeConversationId!==conversationId\)return/);
});

test("switching accounts invalidates pending chat work and removes old realtime channels", () => {
  const updateStart = source.indexOf("function updateHeader(user,session=null)");
  const updateEnd = source.indexOf("function ", updateStart + 10);
  const update = source.slice(updateStart, updateEnd);
  assert.match(update, /communityChatLoadGeneration\+\+;communityChatOpenGeneration\+\+/);
  assert.match(update, /removeChannel\(activeChatChannel\)/);
  assert.match(update, /removeChannel\(communityChatListChannel\)/);
  assert.match(update, /activeConversationId=null;activeConversationIds=\[\]/);
});

test("returning to the general chat view invalidates an older conversation load", () => {
  assert.match(source, /function showCommunityGeneral\(\)\{\s*communityChatOpenGeneration\+\+;activeConversationId=null/);
});
