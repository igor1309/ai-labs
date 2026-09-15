import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readTranscript } from "../src/transcript.js";
import { at } from "./time.js";
import { transcriptOf } from "./transcript-source.js";

// Entry-shape guarantees behind "Read a session". Not QA scenarios, so they
// live outside the scenario-named files.
describe("Transcript entries", () => {
  it("keeps the same words apart when different speakers said them", () => {
    const source = transcriptOf("s1", [
      { kind: "message", at: at("10:01"), role: "user", text: "done" },
      { kind: "message", at: at("10:02"), role: "agent", text: "done" },
    ]);

    assert.deepEqual(
      readTranscript(source, "s1").map((entry) =>
        entry.kind === "message" ? entry.role : entry.kind,
      ),
      ["user", "agent"],
    );
  });
});
