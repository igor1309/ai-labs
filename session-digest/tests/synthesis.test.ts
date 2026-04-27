import assert from "node:assert/strict";
import test from "node:test";

import type { ModelContext } from "../src/ledger.js";
import { SECTION_NAMES } from "../src/sections.js";
import { synthesizeDigest, type DigestModel } from "../src/synthesis.js";

test("test_synthesizeDigest_shouldSendSerializedModelContextAndReturnSixSections_onFakeModel", async () => {
  const model = new FakeDigestModel(sectionEnvelope());
  const sections = await synthesizeDigest({ model, modelContext: makeModelContext() });

  assert.equal(model.inputs.length, 1);
  assert.match(String(model.inputs[0]), /"title":"events"/);
  assert.deepEqual(Object.keys(sections), [...SECTION_NAMES]);
});

test("test_synthesizeDigest_shouldNotSendRawJsonlOrV1FlattenedTranscript_onBoundedContext", async () => {
  const model = new FakeDigestModel(sectionEnvelope());

  await synthesizeDigest({ model, modelContext: makeModelContext() });

  assert.equal(String(model.inputs[0]).includes("{\"type\":\"user\""), false);
  assert.equal(String(model.inputs[0]).includes("\"messages\":[{\"role\""), false);
});

test("test_synthesizeDigest_shouldPreserveEvidenceAnchorText_onModelOutput", async () => {
  const model = new FakeDigestModel(sectionEnvelope({ "Evidence notes": "Claim is backed by record:1." }));
  const sections = await synthesizeDigest({ model, modelContext: makeModelContext() });

  assert.equal(sections["Evidence notes"], "Claim is backed by record:1.");
});

test("test_synthesizeDigest_shouldThrowSynthesisError_onModelFailure", async () => {
  const model = {
    invoke: async () => {
      throw new Error("synthetic model failure");
    },
  };

  await assert.rejects(() => synthesizeDigest({ model, modelContext: makeModelContext() }), /synthetic model failure/);
});

class FakeDigestModel implements DigestModel {
  readonly inputs: unknown[] = [];

  constructor(private readonly response: string) {}

  async invoke(input: unknown): Promise<unknown> {
    this.inputs.push(input);

    return { content: this.response };
  }
}

function makeModelContext(): ModelContext {
  return {
    bytes: 83,
    sections: [{
      events: [{ anchor: "record:1", kind: "message_text", source_record: 1, text: "hello" }],
      title: "events",
    }],
  };
}

function sectionEnvelope(overrides: Partial<Record<string, string>> = {}): string {
  return JSON.stringify({
    sections: Object.fromEntries(SECTION_NAMES.map(($0) => [$0, overrides[$0] ?? `${$0} body`])),
  });
}
