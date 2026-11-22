import assert from "node:assert/strict";
import test from "node:test";
import { roomOf } from "../src/room.js";

test("roomOf_shouldReadTheRoom_fromACallPath", () => {
  assert.equal(roomOf("/j/98940779758759"), "98940779758759");
  assert.equal(roomOf("/j/98940779758759/"), "98940779758759");
});

test("roomOf_shouldBeNull_offACallPath", () => {
  assert.equal(roomOf("/"), null);
  assert.equal(roomOf("/chats"), null);
  assert.equal(roomOf("/j/123"), null);
  assert.equal(roomOf("/j/989407797587590"), null);
});
