import assert from "node:assert/strict";
import test from "node:test";

import type { ModelContext } from "../src/ledger.js";
import { SECTION_IDS, SECTION_NAMES, type DigestSchema } from "../src/sections.js";
import { SynthesisError, synthesizeDigest, type DigestModel } from "../src/synthesis.js";

test("test_synthesizeDigest_shouldSendSerializedModelContextAndReturnSixSections_onFakeModel", async () => {
  const model = new FakeDigestModel(sectionEnvelope());
  const sections = await synthesizeDigest({ model, modelContext: makeModelContext() });

  assert.equal(model.inputs.length, 1);
  assert.match(String(model.inputs[0]), /"title":"events"/);
  assert.deepEqual(Object.keys(sections), [...SECTION_IDS]);
});

test("test_synthesizeDigest_shouldNotSendRawJsonlOrV1FlattenedTranscript_onBoundedContext", async () => {
  const model = new FakeDigestModel(sectionEnvelope());

  await synthesizeDigest({ model, modelContext: makeModelContext() });

  assert.equal(String(model.inputs[0]).includes("{\"type\":\"user\""), false);
  assert.equal(String(model.inputs[0]).includes("\"messages\":[{\"role\""), false);
});

test("test_synthesizeDigest_shouldPreserveEvidenceAnchorText_onModelOutput", async () => {
  const model = new FakeDigestModel(sectionEnvelope({ evidence_notes: "Claim is backed by record:1." }));
  const sections = await synthesizeDigest({ model, modelContext: makeModelContext() });

  assert.equal(sections.evidence_notes, "Claim is backed by record:1.");
});

test("test_synthesizeDigest_shouldSendExactSectionSchema_onFakeModel", async () => {
  const model = new FakeDigestModel(sectionEnvelope());

  await synthesizeDigest({ model, modelContext: makeModelContext() });

  assert.deepEqual({
    containsHeadings: SECTION_NAMES.every(($0) => String(model.inputs[0]).includes($0)),
    containsIds: SECTION_IDS.every(($0) => String(model.inputs[0]).includes(`"${$0}"`)),
  }, {
    containsHeadings: true,
    containsIds: true,
  });
});

test("test_synthesizeDigest_shouldThrowSynthesisError_onWrongSectionKeys", async () => {
  const model = new FakeDigestModel(JSON.stringify({ sections: { summary: "summary body" } }));

  await assert.rejects(
    () => synthesizeDigest({ model, modelContext: makeModelContext() }),
    (error: unknown) => error instanceof SynthesisError && /Missing digest section: Session summary/.test(error.message),
  );
});

test("test_synthesizeDigest_shouldThrowSynthesisError_onMissingSection", async () => {
  const sections = Object.fromEntries(SECTION_IDS.map(($0) => [$0, `${$0} body`]));
  delete sections.outcome;
  const model = new FakeDigestModel(JSON.stringify({ sections }));

  await assert.rejects(
    () => synthesizeDigest({ model, modelContext: makeModelContext() }),
    (error: unknown) => error instanceof SynthesisError && /Missing digest section: Outcome/.test(error.message),
  );
});

test("test_synthesizeDigest_shouldThrowSynthesisError_onBlankSection", async () => {
  const model = new FakeDigestModel(sectionEnvelope({ outcome: " " }));

  await assert.rejects(
    () => synthesizeDigest({ model, modelContext: makeModelContext() }),
    (error: unknown) => error instanceof SynthesisError && /Blank digest section: Outcome/.test(error.message),
  );
});

test("test_synthesizeDigest_shouldThrowSynthesisError_onUnknownSection", async () => {
  const parsed = JSON.parse(sectionEnvelope()) as { sections: Record<string, string> };
  parsed.sections.summary = "summary body";
  const model = new FakeDigestModel(JSON.stringify(parsed));

  await assert.rejects(
    () => synthesizeDigest({ model, modelContext: makeModelContext() }),
    (error: unknown) => error instanceof SynthesisError && /Unknown digest section: summary/.test(error.message),
  );
});

test("test_synthesizeDigest_shouldThrowSynthesisError_onModelFailure", async () => {
  const model = {
    invoke: async () => {
      throw new Error("synthetic model failure");
    },
  };

  await assert.rejects(() => synthesizeDigest({ model, modelContext: makeModelContext() }), /synthetic model failure/);
});

test("test_synthesizeDigest_shouldUseConfiguredSchemaIdsAndHeadings_onCustomSchema", async () => {
  const schema: DigestSchema = {
    sections: [{
      description: "Custom section",
      heading: "Custom Heading",
      id: "custom_heading",
      required: true,
    }],
    version: 7,
  };
  const model = new FakeDigestModel(JSON.stringify({ sections: { custom_heading: "custom body record:1" } }));
  const sections = await synthesizeDigest({ model, modelContext: makeModelContext(), schema });

  assert.deepEqual({
    promptContainsHeading: String(model.inputs[0]).includes("Custom Heading"),
    promptContainsId: String(model.inputs[0]).includes("\"custom_heading\""),
    sections,
  }, {
    promptContainsHeading: true,
    promptContainsId: true,
    sections: { custom_heading: "custom body record:1" },
  });
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
    sections: Object.fromEntries(SECTION_IDS.map(($0) => [$0, overrides[$0] ?? `${$0} body`])),
  });
}
