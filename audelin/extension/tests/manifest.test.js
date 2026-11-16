import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

function matchPattern(pattern) {
  return new RegExp(`^${pattern.replace(/[.?+^$()[\]{}|\\]/g, "\\$&").replaceAll("*", ".*")}$`);
}

function contentScriptRuns(url) {
  return manifest.content_scripts.some((script) => script.matches.some((pattern) => matchPattern(pattern).test(url)));
}

test("manifest_shouldBeManifestV3", () => {
  assert.equal(manifest.manifest_version, 3);
});

test("contentScript_shouldRun_onTelemostCallPages", () => {
  assert.equal(contentScriptRuns("https://telemost.yandex.ru/j/12345678901234"), true);
  assert.equal(contentScriptRuns("https://telemost.360.yandex.ru/j/12345678901234"), true);
});

// Telemost reaches a call from its other pages without loading a new
// document, so the script runs on all of them and finds the room itself.
test("contentScript_shouldRun_onTelemostPagesACallIsReachedFrom", () => {
  assert.equal(contentScriptRuns("https://telemost.yandex.ru/"), true);
  assert.equal(contentScriptRuns("https://telemost.360.yandex.ru/chats"), true);
});

test("contentScript_shouldNotRun_offTelemost", () => {
  assert.equal(contentScriptRuns("https://yandex.ru/j/12345678901234"), false);
});

test("background_shouldBeAWorker_allowedToReachTheNativeHost", () => {
  assert.equal(manifest.background.service_worker, "src/background.js");
  assert.deepEqual(manifest.permissions, ["nativeMessaging"]);
});

// The key pins the extension's ID, even when loaded unpacked, so the app can
// name it in the native host's allowed origins.
const EXTENSION_ID = "boljabpcnipijdcdjjnmnpbfbdjjodkf";

test("key_shouldPinTheExtensionID_theAppAllows", async () => {
  const { createHash } = await import("node:crypto");
  const hex = createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32);
  const id = [...hex].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join("");
  assert.equal(id, EXTENSION_ID);
});
