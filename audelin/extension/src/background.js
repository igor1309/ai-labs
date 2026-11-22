// The extension's background worker: takes call events from Telemost pages
// and forwards them to Audelin through its native-messaging host.
import { createForwarder } from "./forwarder.js";

export const NATIVE_HOST = "app.audelin.call_companion";
export const CALL_PAGE = "telemost-call";

const forwarder = createForwarder({
  connect: () => chrome.runtime.connectNative(NATIVE_HOST),
  setTimer: (fn, delay) => setTimeout(fn, delay),
  // The same clock the content script stamps events with.
  now: () => performance.timeOrigin + performance.now(),
  lastError: () => chrome.runtime.lastError,
});

// Each open call page holds a port to this worker; the app's port stays open
// only while one does.
chrome.runtime.onConnect.addListener((page) => {
  if (page.sender?.id !== chrome.runtime.id || page.name !== CALL_PAGE) return;
  page.onDisconnect.addListener(forwarder.hold());
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id || !message?.callId || !message?.event) return;
  forwarder.send(message.callId, message.event);
});
