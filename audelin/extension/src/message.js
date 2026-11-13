// Version 1 of the wire format the extension sends Audelin: one call
// observation per message. Times are milliseconds on the browser clock;
// participant IDs name one observed tile, never a person or account.

export const MESSAGE_VERSION = 1;

const EVENT_FIELDS = {
  roster: ["type", "at", "participants"],
  speakingStarted: ["type", "at", "participantId"],
  speakingStopped: ["type", "at", "participantId"],
  callEnded: ["type", "at"],
};

// Encodes { callId, sequence, event } as a message, throwing when the result
// would break the format, so the app never receives a message it rejects.
export function encodeMessage({ callId, sequence, event }) {
  const message = { version: MESSAGE_VERSION, callId, sequence, event };
  checkMessage(message);
  return JSON.stringify(message);
}

// Throws unless message is exactly a version 1 message: no unknown or missing
// field, a 14-digit room as callId, and a roster naming each participant once.
export function checkMessage(message) {
  if (!isObject(message)) fail("not a JSON object");
  fields(message, ["version", "callId", "sequence", "event"]);
  if (message.version !== MESSAGE_VERSION) fail("unknown version");
  if (typeof message.callId !== "string" || !/^[0-9]{14}$/.test(message.callId)) fail("callId is not a room number");
  if (!Number.isSafeInteger(message.sequence) || message.sequence < 0) fail("sequence is not a non-negative integer");
  const event = message.event;
  if (!isObject(event)) fail("event is not an object");
  const expected = EVENT_FIELDS[text(event.type, "type")];
  if (!expected) fail(`unknown event ${event.type}`);
  fields(event, expected);
  if (typeof event.at !== "number" || !Number.isFinite(event.at) || event.at < 0) fail("at is not a time");
  if (event.type === "speakingStarted" || event.type === "speakingStopped") text(event.participantId, "participantId");
  if (event.type === "roster") {
    if (!Array.isArray(event.participants)) fail("participants is not a list");
    const ids = new Set();
    for (const participant of event.participants) {
      if (!isObject(participant)) fail("participant is not an object");
      fields(participant, ["id", "name", "isSelf"]);
      text(participant.id, "id");
      text(participant.name, "name");
      if (typeof participant.isSelf !== "boolean") fail("isSelf is not a boolean");
      if (ids.has(participant.id)) fail(`participant ${participant.id} listed twice`);
      ids.add(participant.id);
    }
  }
}

function fields(object, expected) {
  const actual = Object.keys(object).sort();
  if (actual.join() !== [...expected].sort().join()) fail(`fields ${actual.join(", ")} are not ${expected.join(", ")}`);
}

function text(value, field) {
  // Length in characters, as the app counts them.
  if (typeof value !== "string" || value.length === 0 || [...value].length > 200) fail(`${field} is not a short non-empty string`);
  return value;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(reason) {
  throw new Error(`invalid message: ${reason}`);
}
