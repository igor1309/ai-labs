import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { checkMessage, encodeMessage } from "../src/message.js";

// The app's decoder tests read these same files.
const shared = new URL("../../macos/Tests/BrowserBridgeTests/Fixtures/messages/", import.meta.url);
const names = (folder) => readdirSync(new URL(folder, shared)).filter((name) => name.endsWith(".json")).sort();
const read = (folder, name) => readFileSync(new URL(`${folder}/${name}`, shared), "utf8");

test("encodeMessage_shouldWriteEachValidFixture_fromItsCallSequenceAndEvent", () => {
  assert.deepEqual(names("valid"), ["call-ended.json", "roster-empty.json", "roster.json", "speaking-started.json", "speaking-stopped.json"]);
  for (const name of names("valid")) {
    const fixture = JSON.parse(read("valid", name));
    const { callId, sequence, event } = fixture;

    assert.deepEqual(JSON.parse(encodeMessage({ callId, sequence, event })), fixture, name);
  }
});

test("checkMessage_shouldRejectEveryInvalidFixture", () => {
  assert.equal(names("invalid").length, 16);
  for (const name of names("invalid")) {
    assert.throws(() => checkMessage(JSON.parse(read("invalid", name))), /invalid message|JSON/, name);
  }
});

test("encodeMessage_shouldRefuse_anEventTheAppWouldReject", () => {
  assert.throws(
    () => encodeMessage({ callId: "12345678901234", sequence: 0, event: { type: "speakingStarted", at: 1, participantId: "" } }),
    /participantId/,
  );
});

test("encodeMessage_shouldCountANamesLength_inCharacters", () => {
  const name = "😀".repeat(200);
  const event = { type: "roster", at: 1, participants: [{ id: "a", name, isSelf: false }] };

  assert.doesNotThrow(() => encodeMessage({ callId: "12345678901234", sequence: 0, event }));
});
