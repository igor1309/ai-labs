// The extension's background worker: takes call events from Telemost pages
// and forwards them to Audelin through its native-messaging host.
import { createForwarder } from "./forwarder.js";

export const NATIVE_HOST = "app.audelin.call_companion";

const forwarder = createForwarder({
  connect: () => chrome.runtime.connectNative(NATIVE_HOST),
  setTimer: (fn, delay) => setTimeout(fn, delay),
  // The same clock the content script stamps events with.
  now: () => performance.timeOrigin + performance.now(),
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id || !message?.callId || !message?.event) return;
  forwarder.send(message.callId, message.event);
});
