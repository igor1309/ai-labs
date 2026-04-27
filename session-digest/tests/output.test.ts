import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assembleDigest, computeDigestPath, type FrontMatter, writeDigest } from "../src/output.js";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

test("test_output_path_uses_input_stem_and_utc_second_timestamp", async () => {
  const digestPath = computeDigestPath(
    "/tmp/source/my-session.jsonl",
    new Date("2026-04-26T01:02:03.456Z"),
    "/tmp/digests",
  );

  assert.equal(digestPath, path.join("/tmp/digests", "my-session.2026-04-26-010203.digest.md"));
});

test("test_two_runs_with_different_input_stems_in_same_second_produce_distinct_paths", async () => {
  const nowUtc = new Date("2026-04-26T01:02:03.000Z");

  const firstPath = computeDigestPath("/tmp/first.jsonl", nowUtc, "/tmp/digests");
  const secondPath = computeDigestPath("/tmp/second.jsonl", nowUtc, "/tmp/digests");

  assert.notEqual(firstPath, secondPath);
});

test("test_output_directory_is_created_when_missing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  const baseDir = path.join(tempDir, ".session-digests");
  const digestPath = computeDigestPath("/tmp/session.jsonl", new Date("2026-04-26T01:02:03.000Z"), baseDir);

  await writeDigest(digestPath, "# body", fs);

  assert.equal(await fs.readFile(digestPath, "utf8"), "# body");
});

test("test_write_digest_creates_parent_directory_and_writes_only_requested_digest_body", async () => {
  const mkdirCalls: Array<{ path: string; options: { recursive: boolean } }> = [];
  const writeFileCalls: Array<{ path: string; body: string }> = [];
  const fsLike = {
    mkdir: async (calledPath: string, options: { recursive: boolean }) => {
      mkdirCalls.push({ path: calledPath, options });
    },
    writeFile: async (calledPath: string, body: string) => {
      writeFileCalls.push({ path: calledPath, body });
    },
  } as Pick<typeof fs, "mkdir" | "writeFile">;

  await writeDigest("/tmp/digests/session.digest.md", "digest body", fsLike);

  assert.deepEqual(mkdirCalls, [{ path: "/tmp/digests", options: { recursive: true } }]);
  assert.deepEqual(writeFileCalls, [{ path: "/tmp/digests/session.digest.md", body: "digest body" }]);
});

test("test_front_matter_contains_required_keys_with_correct_values", async () => {
  const digest = assembleDigest({
    title: "Session Digest",
    source_path: "/tmp/session.jsonl",
    provider: "nvidia_nim",
    model: "nim-model",
    generated_at: new Date("2026-04-26T01:02:03.456Z"),
  }, {});

  assert.match(digest, /^---\ntitle: Session Digest\nsource_path: \/tmp\/session\.jsonl\nprovider: nvidia_nim\nmodel: nim-model\ngenerated_at: 2026-04-26T01:02:03\.456Z\n---/);
});

test("test_front_matter_contains_v2_derived_artifact_metadata_whenProvided", async () => {
  const digest = assembleDigest({
    compressor_strategy: "claude-jsonl-v1",
    compressor_version: "1.0.0",
    generated_at: new Date("2026-04-26T01:02:03.456Z"),
    ledger_bytes: 300,
    ledger_path: "/tmp/session.ledger.json",
    model: "nomos-model",
    model_context_bytes: 200,
    provider: "nomos",
    source_bytes: 100,
    source_path: "/tmp/session.jsonl",
    source_records: 3,
    title: "Session Digest",
  }, {});

  assert.match(digest, /^compressor_strategy: claude-jsonl-v1$/m);
  assert.match(digest, /^compressor_version: 1\.0\.0$/m);
  assert.match(digest, /^ledger_path: \/tmp\/session\.ledger\.json$/m);
  assert.match(digest, /^source_bytes: 100$/m);
  assert.match(digest, /^source_records: 3$/m);
  assert.match(digest, /^ledger_bytes: 300$/m);
  assert.match(digest, /^model_context_bytes: 200$/m);
});

test("test_output_contains_no_direct_date_construction", async () => {
  const outputSource = await fs.readFile(path.join(srcDir, "output.ts"), "utf8");

  assert.equal(countDateConstruction(outputSource), 0);
});

test("test_default_clock_file_contains_single_sanctioned_date_constructor", async () => {
  const clockSource = await fs.readFile(path.join(srcDir, "clock.ts"), "utf8");

  assert.equal(clockSource.trim(), "export const defaultClock: () => Date = () => new Date();");
  assert.equal((clockSource.match(/Date\.now\(/g) ?? []).length, 0);
});

test("test_body_contains_six_h2_sections_in_documented_order", async () => {
  const digest = assembleDigest(makeFrontMatter(), {});

  assert.deepEqual(h2Headers(digest), [
    "Session summary",
    "Outcome",
    "Useful decisions",
    "Failure or friction points",
    "Next-session improvements",
    "Evidence notes",
  ]);
});

test("test_body_shouldStartWithDocumentedH1_beforeSections", async () => {
  const digest = assembleDigest(makeFrontMatter(), {});

  assert.match(digest, /^---[\s\S]*---\n\n# Session Digest\n\n## Session summary/m);
});

test("test_body_order_is_independent_of_input_record_iteration_order", async () => {
  const sections = {
    "Evidence notes": "evidence",
    "Next-session improvements": "improve",
    "Failure or friction points": "friction",
    "Useful decisions": "decisions",
    "Outcome": "outcome",
    "Session summary": "summary",
  };

  const digest = assembleDigest(makeFrontMatter(), sections);

  assert.deepEqual(h2Headers(digest), [
    "Session summary",
    "Outcome",
    "Useful decisions",
    "Failure or friction points",
    "Next-session improvements",
    "Evidence notes",
  ]);
});

test("test_assembleDigest_shouldRenderConfiguredSchemaHeadings_onCustomSchema", () => {
  const digest = assembleDigest(makeFrontMatter(), {
    first: "first body",
    second: "second body",
  }, {
    sections: [
      { description: "First", heading: "First Heading", id: "first", required: true },
      { description: "Second", heading: "Second Heading", id: "second", required: true },
    ],
    version: 3,
  });

  assert.deepEqual(h2Headers(digest), ["First Heading", "Second Heading"]);
});

function countDateConstruction(source: string): number {
  return (source.match(/new Date\(|Date\.now\(/g) ?? []).length;
}

function h2Headers(markdown: string): string[] {
  return markdown.split("\n")
    .filter(($0) => $0.startsWith("## "))
    .map(($0) => $0.slice(3));
}

function makeFrontMatter(): FrontMatter {
  return {
    title: "Session Digest",
    source_path: "/tmp/session.jsonl",
    provider: "nvidia_nim",
    model: "nim-model",
    generated_at: new Date("2026-04-26T01:02:03.000Z"),
  };
}
