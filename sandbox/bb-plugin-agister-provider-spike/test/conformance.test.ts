import { afterEach, beforeEach, expect, it } from "vitest";
import {
  experimental_formatConformanceReport as formatConformanceReport,
  experimental_runBridgeConformance as runBridgeConformance,
} from "@get-bb/plugin-sdk/provider-bridge/testing";
import { createClient } from "./client.js";
import { createFixture, type Fixture } from "./fixture.js";

let fixture: Fixture;

beforeEach(() => {
  fixture = createFixture();
});

afterEach(() => {
  fixture.cleanup();
});

it("passes the canonical protocol suite, interrupt rules included", async () => {
  const client = createClient({ ...process.env, AGISTER_HOME: fixture.home });
  const report = await runBridgeConformance({
    transport: { send: client.bridge.handleLine, takeMessages: client.takeMessages },
    providerId: "agister-spike",
    session: {
      cwd: fixture.repo,
      promptInput: [{ type: "text", text: "say hello", mentions: [] }],
      // The fixture's step sleeps on this prompt: a real Agister run that
      // only a stop ends.
      interruptiblePromptInput: [{ type: "text", text: "hold", mentions: [] }],
    },
    timeoutMs: 25_000,
  });
  console.info(`agister bridge conformance:\n${formatConformanceReport(report)}`);

  const statusById = Object.fromEntries(report.results.map((r) => [r.id, r.status]));
  expect(statusById).toMatchObject({
    "handshake/initialize": "pass",
    "session/start-identity": "pass",
    "turn/lifecycle": "pass",
    "events/schema-valid": "pass",
    "stop/release-not-interrupted": "pass",
    "stop/interrupt-settles-before-result": "pass",
  });
  expect(report.passed).toBe(true);
}, 120_000);
