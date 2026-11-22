// Runs in the background worker: forwards each call event to the app over a
// native-messaging port, numbering the messages in order. While the port is
// down, events wait in a bounded buffer; the worker reconnects after a delay
// and sends what waited, oldest first. It answers the app's clock pings at
// once with the browser's clock, so the app can place event times on its own.
// It keeps the port only while a call page holds it or events wait: with no
// call open it starts no native host.
import { checkMessage, MESSAGE_VERSION } from "./message.js";

// lastError: () => the browser's error for the port that just dropped; reading
// it is how the browser learns the drop was expected (chrome.runtime.lastError).
export function createForwarder({ connect, setTimer, now, lastError = () => undefined, retryDelay = 2000, capacity = 1000 }) {
  let port = null;
  let holds = 0;
  let sequence = 0;
  let retrying = false;
  const waiting = [];

  function open() {
    retrying = false;
    let next;
    try {
      next = connect();
    } catch {
      return retry();
    }
    port = next;
    next.onMessage?.addListener((message) => {
      if (port !== next || !Number.isSafeInteger(message?.ping) || message.ping < 0) return;
      try {
        next.postMessage({ version: MESSAGE_VERSION, ping: message.ping, at: now() });
      } catch {
        // A lost reply only means the app pings again.
      }
    });
    next.onDisconnect.addListener(() => {
      lastError();
      if (port === next) port = null;
      if (wanted()) retry();
    });
    flush();
  }

  function wanted() {
    return holds > 0 || waiting.length > 0;
  }

  function ensure() {
    if (!port && !retrying) open();
  }

  function retry() {
    if (retrying) return;
    retrying = true;
    setTimer(open, retryDelay);
  }

  function flush() {
    while (port && waiting.length > 0) {
      try {
        port.postMessage(waiting[0]);
      } catch {
        port = null;
        return retry();
      }
      waiting.shift();
    }
  }

  // Takes one event of the call callId; returns false when the event would
  // break the message format, which drops it.
  function send(callId, event) {
    const message = { version: MESSAGE_VERSION, callId, sequence, event };
    try {
      checkMessage(message);
    } catch {
      return false;
    }
    sequence += 1;
    waiting.push(message);
    if (waiting.length > capacity) waiting.shift();
    ensure();
    flush();
    return true;
  }

  // Keeps the app's port open, reconnecting after drops, until the returned
  // release is called; a call page holds it for its life.
  function hold() {
    holds += 1;
    ensure();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holds -= 1;
      if (holds === 0 && waiting.length === 0 && port) {
        const closing = port;
        port = null;
        try {
          closing.disconnect?.();
        } catch {
          // Already gone.
        }
      }
    };
  }

  return { send, hold };
}
