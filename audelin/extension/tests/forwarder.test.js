import assert from "node:assert/strict";
import test from "node:test";
import { createForwarder } from "../src/forwarder.js";

const CALL = "12345678901234";
const ended = (at) => ({ type: "callEnded", at });

// A port that records what it was sent and drops when told to, as Chrome's
// does when the native host exits or is not installed.
function fakePort({ absent = false } = {}) {
  const listeners = [];
  const receivers = [];
  const port = {
    sent: [],
    up: !absent,
    postMessage(message) {
      if (!port.up) throw new Error("Attempting to use a disconnected port object");
      port.sent.push(message);
    },
    onDisconnect: { addListener: (listener) => listeners.push(listener) },
    onMessage: { addListener: (listener) => receivers.push(listener) },
    receive: (message) => receivers.forEach((listener) => listener(message)),
    drop() {
      port.up = false;
      listeners.forEach((listener) => listener());
    },
  };
  return port;
}

function harness(ports) {
  const connects = [];
  const timers = [];
  const forwarder = createForwarder({
    connect: () => {
      const port = ports.shift() ?? fakePort();
      connects.push(port);
      if (!port.up) queueMicrotask(() => port.drop());
      return port;
    },
    setTimer: (fn, delay) => timers.push({ fn, delay }),
    now: () => 1_731_499_200_000.5,
    retryDelay: 50,
    capacity: 3,
  });
  const fire = () => timers.splice(0).forEach((timer) => timer.fn());
  return { forwarder, connects, timers, fire };
}

const sequences = (port) => port.sent.map((message) => message.sequence);

test("forwarder_shouldSendNumberedMessages_whenTheAppIsConnected", () => {
  const { forwarder, connects } = harness([fakePort()]);
  assert.equal(forwarder.send(CALL, ended(1)), true);
  forwarder.send(CALL, ended(2));
  assert.deepEqual(connects[0].sent, [
    { version: 1, callId: CALL, sequence: 0, event: ended(1) },
    { version: 1, callId: CALL, sequence: 1, event: ended(2) },
  ]);
});

test("forwarder_shouldDropAnEventThatBreaksTheFormat_withoutUsingASequence", () => {
  const { forwarder, connects } = harness([fakePort()]);
  assert.equal(forwarder.send("not-a-room", ended(1)), false);
  forwarder.send(CALL, ended(2));
  assert.deepEqual(sequences(connects[0]), [0]);
});

test("forwarder_shouldBufferAndRetry_whenTheAppIsAbsent", async () => {
  const { forwarder, connects, timers, fire } = harness([fakePort({ absent: true }), fakePort()]);
  forwarder.send(CALL, ended(1));
  await Promise.resolve();
  assert.deepEqual(timers.map((timer) => timer.delay), [50]);
  forwarder.send(CALL, ended(2));
  fire();
  assert.equal(connects.length, 2);
  assert.deepEqual(sequences(connects[1]), [0, 1]);
});

test("forwarder_shouldResendBufferedEvents_afterReconnectingFromADrop", () => {
  const { forwarder, connects, fire } = harness([fakePort(), fakePort()]);
  forwarder.send(CALL, ended(1));
  connects[0].drop();
  forwarder.send(CALL, ended(2));
  forwarder.send(CALL, ended(3));
  fire();
  assert.deepEqual(sequences(connects[0]), [0]);
  assert.deepEqual(sequences(connects[1]), [1, 2]);
});

test("forwarder_shouldKeepTheEventItFailedToPost_forTheNextPort", () => {
  const { forwarder, connects, fire } = harness([fakePort(), fakePort()]);
  connects[0].up = false; // gone, but Chrome has not reported it yet
  forwarder.send(CALL, ended(1));
  fire();
  assert.deepEqual(sequences(connects[1]), [0]);
});

test("forwarder_shouldKeepTheNewestEvents_whenTheBufferIsFull", () => {
  const { forwarder, connects, fire } = harness([fakePort({ absent: true }), fakePort()]);
  connects[0].up = false;
  for (let at = 1; at <= 5; at += 1) forwarder.send(CALL, ended(at));
  connects[0].drop();
  fire();
  assert.deepEqual(sequences(connects[1]), [2, 3, 4]);
});

test("forwarder_shouldRetryOnce_whenSeveralFailuresArriveTogether", () => {
  const { forwarder, connects, timers } = harness([fakePort()]);
  connects[0].up = false;
  forwarder.send(CALL, ended(1));
  connects[0].drop();
  assert.equal(timers.length, 1);
});

test("forwarder_shouldAnswerAClockPing_withTheBrowserClock_outsideTheSequence", () => {
  const { forwarder, connects } = harness([fakePort()]);
  connects[0].receive({ ping: 7 });
  forwarder.send(CALL, ended(1));
  assert.deepEqual(connects[0].sent, [
    { version: 1, ping: 7, at: 1_731_499_200_000.5 },
    { version: 1, callId: CALL, sequence: 0, event: ended(1) },
  ]);
});

test("forwarder_shouldIgnoreAMessageThatIsNotAPing", () => {
  const { connects } = harness([fakePort()]);
  connects[0].receive({ ping: -1 });
  connects[0].receive({ hello: 1 });
  assert.deepEqual(connects[0].sent, []);
});
