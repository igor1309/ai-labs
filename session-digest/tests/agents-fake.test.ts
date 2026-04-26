import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { ChatOpenAI } from "@langchain/openai";

import { buildAgent, defaultChatModel, loadPromptTemplates, renderPrompt, run } from "../src/agents.js";
import { main } from "../src/cli.js";
import { computeDigestPath } from "../src/output.js";
import { SECTION_NAMES, SECTION_OWNERS, type AgentRole } from "../src/sections.js";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(testsDir, "..", "src");
const validSessionPath = path.join(testsDir, "fixtures", "session.valid.jsonl");

test("test_valid_session_produces_digest_at_expected_path", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const baseDir = path.join(tempDir, ".session-digests");
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(path.join(baseDir, ".env"), "NVIDIA_API_KEY=fake\nNVIDIA_MODEL=fake\n");
  const stdout = new StringSink();
  const stderr = new StringSink();
  const model = new RoutingFake();

  const exitCode = await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => new Date("2026-04-26T01:02:03.000Z"),
    model,
  });

  const digestPath = computeDigestPath(validSessionPath, new Date("2026-04-26T01:02:03.000Z"), baseDir);

  assert.equal(exitCode, 0);
  assert.equal(stderr.toString(), "");
  assert.equal(await exists(digestPath), true);
  assert.deepEqual(h2Headers(await fs.readFile(digestPath, "utf8")), [...SECTION_NAMES]);
});

test("test_stdout_contains_only_created_digest_path", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const baseDir = path.join(tempDir, ".session-digests");
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(path.join(baseDir, ".env"), "NVIDIA_API_KEY=fake\nNVIDIA_MODEL=fake\n");
  const stdout = new StringSink();
  const stderr = new StringSink();

  const exitCode = await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => new Date("2026-04-26T01:02:03.000Z"),
    model: new RoutingFake(),
  });

  assert.equal(exitCode, 0);
  assert.equal(
    stdout.toString(),
    `${computeDigestPath(validSessionPath, new Date("2026-04-26T01:02:03.000Z"), baseDir)}\n`,
  );
  assert.equal(stderr.toString(), "");
});

test("test_successful_run_writes_only_one_new_digest_file_under_session_digests", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const baseDir = path.join(tempDir, ".session-digests");
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(path.join(baseDir, ".env"), "NVIDIA_API_KEY=fake\nNVIDIA_MODEL=fake\n");
  const before = await regularFilesUnder(baseDir);
  const stdout = new StringSink();
  const stderr = new StringSink();
  const digestPath = computeDigestPath(validSessionPath, new Date("2026-04-26T01:02:03.000Z"), baseDir);

  const exitCode = await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => new Date("2026-04-26T01:02:03.000Z"),
    model: new RoutingFake(),
  });

  const after = await regularFilesUnder(baseDir);
  const newFiles = [...after].filter(($0) => !before.has($0));

  assert.equal(exitCode, 0);
  assert.deepEqual(newFiles, [digestPath]);
  assert.notEqual(await sha256(digestPath), await sha256(validSessionPath));
});

test("test_front_matter_contains_required_keys_with_correct_values_from_cli_success_path", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const baseDir = path.join(tempDir, ".session-digests");
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(path.join(baseDir, ".env"), "NVIDIA_API_KEY=fake\nNVIDIA_MODEL=fake-model\n");
  const stdout = new StringSink();
  const stderr = new StringSink();
  const digestPath = computeDigestPath(validSessionPath, new Date("2026-04-26T01:02:03.000Z"), baseDir);

  const exitCode = await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => new Date("2026-04-26T01:02:03.000Z"),
    model: new RoutingFake(),
  });

  const digest = await fs.readFile(digestPath, "utf8");

  assert.equal(exitCode, 0);
  assert.match(digest, new RegExp([
    "^---",
    "title: Session Digest",
    `source_path: ${escapeRegExp(validSessionPath)}`,
    "provider: nvidia_nim",
    "model: fake-model",
    "generated_at: 2026-04-26T01:02:03Z",
    "---",
  ].join("\\n")));
});

test("test_front_matter_uses_selected_provider_from_config", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const baseDir = path.join(tempDir, ".session-digests");
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(
    path.join(baseDir, ".env"),
    "OPENROUTER_API_KEY=fake\nOPENROUTER_MODEL=x-ai/grok-4.1-fast\n",
  );
  const stdout = new StringSink();
  const stderr = new StringSink();

  const exitCode = await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => new Date("2026-04-26T01:02:03.000Z"),
    model: new RoutingFake(),
  });

  const digest = await fs.readFile(stdout.toString().trim(), "utf8");

  assert.equal(exitCode, 0);
  assert.match(digest, /^provider: openrouter\nmodel: x-ai\/grok-4\.1-fast$/m);
});

test("test_clock_is_invoked_once_and_filename_matches_generated_at", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const baseDir = path.join(tempDir, ".session-digests");
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(path.join(baseDir, ".env"), "NVIDIA_API_KEY=fake\nNVIDIA_MODEL=fake\n");
  const stdout = new StringSink();
  const stderr = new StringSink();
  let callCount = 0;
  const clock = () => {
    callCount += 1;

    return new Date(Date.UTC(2026, 3, 26, 1, 2, 3 + (callCount - 1) * 5));
  };

  const exitCode = await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock,
    model: new RoutingFake(),
  });

  const digestPath = stdout.toString().trim();
  const digest = await fs.readFile(digestPath, "utf8");

  assert.equal(exitCode, 0);
  assert.equal(callCount, 1);
  assert.match(path.basename(digestPath), /\.2026-04-26-010203\.digest\.md$/);
  assert.match(digest, /^generated_at: 2026-04-26T01:02:03Z$/m);
});

test("test_cli_main_and_output_contain_no_direct_date_construction", async () => {
  const source = [
    await fs.readFile(path.join(srcDir, "cli.ts"), "utf8"),
    await fs.readFile(path.join(srcDir, "output.ts"), "utf8"),
  ].join("\n");

  assert.equal(countDateConstruction(stripCommentsAndStrings(source)), 0);
});

test("test_each_section_has_at_least_one_non_blank_line_of_content", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const baseDir = path.join(tempDir, ".session-digests");
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(path.join(baseDir, ".env"), "NVIDIA_API_KEY=fake\nNVIDIA_MODEL=fake\n");
  const stdout = new StringSink();
  const stderr = new StringSink();

  await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => new Date("2026-04-26T01:02:03.000Z"),
    model: new RoutingFake(),
  });

  const digest = await fs.readFile(stdout.toString().trim(), "utf8");

  assert.deepEqual(nonBlankLineCountsBySection(digest), Object.fromEntries(SECTION_NAMES.map(($0) => [$0, 1])));
});

test("test_missing_or_blank_required_section_in_subagent_output_uses_placeholder", async (t) => {
  const cases: Array<Record<string, string>> = [
    {},
    { "Next-session improvements": "" },
    { "Next-session improvements": " \n\t " },
  ];

  for (const sections of cases) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
    t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
    const baseDir = path.join(tempDir, ".session-digests");
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(path.join(baseDir, ".env"), "NVIDIA_API_KEY=fake\nNVIDIA_MODEL=fake\n");
    const stdout = new StringSink();
    const stderr = new StringSink();

    const exitCode = await main([validSessionPath], stdout, stderr, {
      baseDir,
      clock: () => new Date("2026-04-26T01:02:03.000Z"),
      model: new RoutingFake([], sections),
    });

    assert.equal(exitCode, 0);
    assert.notEqual(stdout.toString().trim(), "");
    assert.equal(stderr.toString(), "");

    const digest = await fs.readFile(stdout.toString().trim(), "utf8");

    assert.equal(sectionBody(digest, "Next-session improvements"), "Not generated.");
  }
});

test("test_run_extracts_sections_from_task_tool_messages_by_tool_call_id", async () => {
  const agent = {
    invoke: async () => ({
      messages: [
        new AIMessage({
          content: "",
          tool_calls: [
            { id: "call-extractor", name: "task", args: { subagent_type: "Extractor" } },
            { id: "call-improver", name: "task", args: { subagent_type: "Improver" } },
            { id: "call-evidence", name: "task", args: { subagent_type: "Evidence checker" } },
          ],
        }),
        new ToolMessage({
          name: "task",
          tool_call_id: "call-evidence",
          content: JSON.stringify({ sections: { "Evidence notes": "evidence" } }),
        }),
        new ToolMessage({
          name: "task",
          tool_call_id: "call-improver",
          content: JSON.stringify({ sections: { "Next-session improvements": "improve" } }),
        }),
        new ToolMessage({
          name: "task",
          tool_call_id: "call-extractor",
          content: JSON.stringify({
            sections: {
              "Session summary": "summary",
              "Outcome": "outcome",
              "Useful decisions": "decisions",
              "Failure or friction points": "friction",
            },
          }),
        }),
      ],
    }),
  } as Parameters<typeof run>[1];

  const sections = await run([], agent);

  assert.deepEqual(sections, {
    "Session summary": "summary",
    "Outcome": "outcome",
    "Useful decisions": "decisions",
    "Failure or friction points": "friction",
    "Next-session improvements": "improve",
    "Evidence notes": "evidence",
  });
});

test("test_run_extracts_sections_from_fenced_json_task_output", async () => {
  const agent = {
    invoke: async () => ({
      messages: [
        new AIMessage({
          content: "",
          tool_calls: [
            { id: "call-extractor", name: "task", args: { subagent_type: "Extractor" } },
            { id: "call-improver", name: "task", args: { subagent_type: "Improver" } },
            { id: "call-evidence", name: "task", args: { subagent_type: "Evidence checker" } },
          ],
        }),
        new ToolMessage({
          name: "task",
          tool_call_id: "call-extractor",
          content: fencedJson({
            sections: {
              "Session summary": "summary",
              "Outcome": "outcome",
              "Useful decisions": "decisions",
              "Failure or friction points": "friction",
            },
          }),
        }),
        new ToolMessage({
          name: "task",
          tool_call_id: "call-improver",
          content: fencedJson({ sections: { "Next-session improvements": "improve" } }),
        }),
        new ToolMessage({
          name: "task",
          tool_call_id: "call-evidence",
          content: fencedJson({ sections: { "Evidence notes": "evidence" } }),
        }),
      ],
    }),
  } as Parameters<typeof run>[1];

  const sections = await run([], agent);

  assert.deepEqual(sections, {
    "Session summary": "summary",
    "Outcome": "outcome",
    "Useful decisions": "decisions",
    "Failure or friction points": "friction",
    "Next-session improvements": "improve",
    "Evidence notes": "evidence",
  });
});

test("test_run_extracts_sections_from_prose_wrapped_json_task_output", async () => {
  const agent = {
    invoke: async () => ({
      messages: [
        new AIMessage({
          content: "",
          tool_calls: [
            { id: "call-extractor", name: "task", args: { subagent_type: "Extractor" } },
            { id: "call-improver", name: "task", args: { subagent_type: "Improver" } },
            { id: "call-evidence", name: "task", args: { subagent_type: "Evidence checker" } },
          ],
        }),
        new ToolMessage({
          name: "task",
          tool_call_id: "call-extractor",
          content: proseWrappedJson({
            sections: {
              "Session summary": "summary",
              "Outcome": "outcome",
              "Useful decisions": "decisions",
              "Failure or friction points": "friction",
            },
          }),
        }),
        new ToolMessage({
          name: "task",
          tool_call_id: "call-improver",
          content: proseWrappedJson({ sections: { "Next-session improvements": "improve" } }),
        }),
        new ToolMessage({
          name: "task",
          tool_call_id: "call-evidence",
          content: proseWrappedJson({ sections: { "Evidence notes": "evidence" } }),
        }),
      ],
    }),
  } as Parameters<typeof run>[1];

  const sections = await run([], agent);

  assert.deepEqual(sections, {
    "Session summary": "summary",
    "Outcome": "outcome",
    "Useful decisions": "decisions",
    "Failure or friction points": "friction",
    "Next-session improvements": "improve",
    "Evidence notes": "evidence",
  });
});

test("test_invalid_creds_fail_on_first_model_call_not_before", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const baseDir = path.join(tempDir, ".session-digests");
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(path.join(baseDir, ".env"), "NVIDIA_API_KEY=fake\nNVIDIA_MODEL=fake\n");
  const stdout = new StringSink();
  const stderr = new StringSink();
  const model = new FirstCallThrowingFake();
  let exitCode: number | undefined;

  try {
    exitCode = await main([validSessionPath], stdout, stderr, {
      baseDir,
      clock: () => new Date("2026-04-26T01:02:03.000Z"),
      model,
    });
  } catch {
    exitCode = undefined;
  }

  assert.equal(model.callCount, 1);
  assert.notEqual(exitCode, undefined);
  assert.notEqual(exitCode, 0);
});

test("test_build_agent_does_not_call_model_before_run", async () => {
  const model = new FirstCallThrowingFake();

  buildAgent({ model, prompts: promptTemplates() });

  assert.equal(model.callCount, 0);
});

test("test_default_chat_model_is_pure_constructor", () => {
  const model = defaultChatModel({
    apiKey: "fake",
    baseURL: "https://example.test/v1",
    model: "fake",
    provider: "test",
  });

  assert.equal(model instanceof ChatOpenAI, true);
  assert.equal(chatOpenAIConfiguration(model).baseURL, "https://example.test/v1");
});

test("test_default_chat_model_shouldUseShellProxy_onHttpsProxyConfigured", (t) => {
  const originalProxyEnv = proxyEnv();
  t.after(() => restoreProxyEnv(originalProxyEnv));
  delete process.env.ALL_PROXY;
  delete process.env.HTTP_PROXY;
  process.env.HTTPS_PROXY = "http://proxy.example:3128";

  const model = defaultChatModel({
    apiKey: "fake",
    baseURL: "https://example.test/v1",
    model: "fake",
    provider: "test",
  });

  assert.equal(typeof chatOpenAIConfiguration(model).fetch, "function");
});

test("test_default_chat_model_shouldBypassShellProxy_onLocalNomosBaseURL", (t) => {
  const originalProxyEnv = proxyEnv();
  t.after(() => restoreProxyEnv(originalProxyEnv));
  delete process.env.ALL_PROXY;
  delete process.env.HTTP_PROXY;
  process.env.HTTPS_PROXY = "http://proxy.example:3128";

  const model = defaultChatModel({
    apiKey: "fake",
    baseURL: "http://localhost:8080/v1",
    model: "fake",
    provider: "nomos",
  });

  assert.equal(chatOpenAIConfiguration(model).fetch, undefined);
});

test("test_first_run_with_missing_basedir_writes_env_example_and_exits_with_bootstrap_error", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-digest-"));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const baseDir = path.join(tempDir, "session-digests-subdir");
  const stdout = new StringSink();
  const stderr = new StringSink();

  const exitCode = await main([validSessionPath], stdout, stderr, {
    baseDir,
    clock: () => new Date("2026-04-26T01:02:03.000Z"),
    model: new RoutingFake(),
  });

  assert.notEqual(exitCode, 0);
  assert.match(stderr.toString(), /\.env\.example/);
  assert.match(await fs.readFile(path.join(baseDir, ".env.example"), "utf8"), /OPENROUTER_MODEL=/);
  assert.deepEqual(await regularFilesUnder(baseDir), new Set([path.join(baseDir, ".env.example")]));
  assert.equal(stdout.toString(), "");
});

test("test_rendered_prompts_use_section_owners_without_manual_section_name_drift", async () => {
  const observedPaths: string[] = [];
  const rawTemplates: string[] = [];
  const readFile = async (filePath: Parameters<typeof fs.readFile>[0]) => {
    observedPaths.push(filePath.toString());
    const role = roleForPromptPath(filePath.toString());
    const template = `${role}\n{{OWNED_SECTIONS}}`;
    rawTemplates.push(template);

    return template;
  };

  const prompts = await loadPromptTemplates(readFile as typeof fs.readFile);

  assert.deepEqual(observedPaths.map(($0) => path.basename($0)).sort(), [
    "evidence-checker.md",
    "extractor.md",
    "improver.md",
  ]);
  assert.equal(rawTemplates.some(($0) => SECTION_NAMES.some((sectionName) => $0.includes(sectionName))), false);

  for (const role of Object.keys(SECTION_OWNERS) as AgentRole[]) {
    const rendered = renderPrompt(role, prompts[role]);
    const includedSectionNames = SECTION_NAMES.filter((sectionName) => rendered.includes(sectionName));

    assert.deepEqual(includedSectionNames, SECTION_OWNERS[role]);
  }
});

test("test_agent_prompts_treat_session_messages_as_data_not_live_instructions", async () => {
  const agentSource = await fs.readFile(path.join(srcDir, "agents.ts"), "utf8");
  const promptSources = await Promise.all([
    fs.readFile(path.join(srcDir, "prompts", "extractor.md"), "utf8"),
    fs.readFile(path.join(srcDir, "prompts", "improver.md"), "utf8"),
    fs.readFile(path.join(srcDir, "prompts", "evidence-checker.md"), "utf8"),
  ]);

  assert.match(agentSource, /session transcript data/i);
  assert.equal(promptSources.every(($0) => /session transcript data/i.test($0)), true);
});

test("test_parent_prompt_instructs_each_task_to_include_session_transcript_json", async () => {
  const agentSource = await fs.readFile(path.join(srcDir, "agents.ts"), "utf8");

  assert.match(agentSource, /include the full session transcript JSON/i);
});

class StringSink extends Writable {
  readonly chunks: string[] = [];

  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  override toString(): string {
    return this.chunks.join("");
  }
}

class RoutingFake extends BaseChatModel {
  readonly boundToolNames: string[];
  readonly improverSections: Record<string, string>;

  constructor(
    boundToolNames: string[] = [],
    improverSections: Record<string, string> = { "Next-session improvements": "Start from the existing task plan." },
  ) {
    super({});
    this.boundToolNames = boundToolNames;
    this.improverSections = improverSections;
  }

  _llmType(): string {
    return "routing-fake";
  }

  _combineLLMOutput(): never[] {
    return [];
  }

  override bindTools(tools: unknown[]): BaseChatModel {
    return new RoutingFake(tools.map(toolName), this.improverSections);
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    if (this.boundToolNames.includes("task") && messages.some(($0) => ToolMessage.isInstance($0))) {
      return generation(new AIMessage("done"));
    }

    if (this.boundToolNames.includes("task")) {
      return generation(new AIMessage({
        content: "",
        tool_calls: [
          {
            id: "call-extractor",
            name: "task",
            args: {
              description: "Extract the session summary, outcome, decisions, and friction.",
              subagent_type: "Extractor",
            },
          },
          {
            id: "call-improver",
            name: "task",
            args: {
              description: "Extract next-session improvements.",
              subagent_type: "Improver",
            },
          },
          {
            id: "call-evidence",
            name: "task",
            args: {
              description: "Extract evidence notes.",
              subagent_type: "Evidence checker",
            },
          },
        ],
      }));
    }

    const prompt = messages.map(($0) => contentToString($0.content)).join("\n");

    if (prompt.includes("Extractor")) {
      return generation(new AIMessage(JSON.stringify({
        sections: {
          "Session summary": "The user asked for a summary.",
          "Outcome": "The assistant summarized the request.",
          "Useful decisions": "Keep JSONL parsing best-effort.",
          "Failure or friction points": "No major friction.",
        },
      })));
    }

    if (prompt.includes("Improver")) {
      return generation(new AIMessage(JSON.stringify({
        sections: this.improverSections,
      })));
    }

    if (prompt.includes("Evidence checker")) {
      return generation(new AIMessage(JSON.stringify({
        sections: {
          "Evidence notes": "Input record 1 contains the user request.",
        },
      })));
    }

    return generation(new AIMessage("unexpected call"));
  }
}

class FirstCallThrowingFake extends BaseChatModel {
  boundToolNames: string[];
  calls: { count: number };

  constructor(boundToolNames: string[] = [], calls: { count: number } = { count: 0 }) {
    super({});
    this.boundToolNames = boundToolNames;
    this.calls = calls;
  }

  get callCount(): number {
    return this.calls.count;
  }

  _llmType(): string {
    return "first-call-throwing-fake";
  }

  _combineLLMOutput(): never[] {
    return [];
  }

  override bindTools(tools: unknown[]): BaseChatModel {
    return new FirstCallThrowingFake(tools.map(toolName), this.calls);
  }

  async _generate(): Promise<ChatResult> {
    this.calls.count += 1;

    throw new Error("synthetic auth error");
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);

    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function regularFilesUnder(directory: string): Promise<Set<string>> {
  const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });
  const files = entries
    .filter(($0) => $0.isFile())
    .map(($0) => path.join($0.parentPath, $0.name))
    .sort();

  return new Set(files);
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

function generation(message: AIMessage): ChatResult {
  return {
    generations: [
      {
        message,
        text: contentToString(message.content),
      },
    ],
  };
}

function toolName(tool: unknown): string {
  if (isRecord(tool) && typeof tool.name === "string") {
    return tool.name;
  }

  return "";
}

function contentToString(content: BaseMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  return content.map(($0) => {
    if (typeof $0 === "string") {
      return $0;
    }

    if ("text" in $0 && typeof $0.text === "string") {
      return $0.text;
    }

    return "";
  }).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type ProxyEnv = {
  ALL_PROXY: string | undefined;
  HTTPS_PROXY: string | undefined;
  HTTP_PROXY: string | undefined;
};

function proxyEnv(): ProxyEnv {
  return {
    ALL_PROXY: process.env.ALL_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    HTTP_PROXY: process.env.HTTP_PROXY,
  };
}

function restoreProxyEnv(env: ProxyEnv): void {
  setOrDeleteEnv("ALL_PROXY", env.ALL_PROXY);
  setOrDeleteEnv("HTTPS_PROXY", env.HTTPS_PROXY);
  setOrDeleteEnv("HTTP_PROXY", env.HTTP_PROXY);
}

function setOrDeleteEnv(name: keyof ProxyEnv, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function chatOpenAIConfiguration(model: ChatOpenAI): { fetch?: unknown } {
  const lcKwargs = model.lc_kwargs as { configuration?: { fetch?: unknown } };

  return lcKwargs.configuration ?? {};
}

function promptTemplates(): Parameters<typeof buildAgent>[0]["prompts"] {
  return {
    "Extractor": "Extractor\n{{OWNED_SECTIONS}}",
    "Improver": "Improver\n{{OWNED_SECTIONS}}",
    "Evidence checker": "Evidence checker\n{{OWNED_SECTIONS}}",
  };
}

function roleForPromptPath(filePath: string): AgentRole {
  if (filePath.endsWith("extractor.md")) {
    return "Extractor";
  }

  if (filePath.endsWith("improver.md")) {
    return "Improver";
  }

  return "Evidence checker";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countDateConstruction(source: string): number {
  return (source.match(/new\s+Date\s*\(|Date\.now\s*\(/g) ?? []).length;
}

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, "\"\"");
}

function nonBlankLineCountsBySection(markdown: string): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const sectionName of SECTION_NAMES) {
    const start = markdown.indexOf(`## ${sectionName}\n`);
    const next = SECTION_NAMES[SECTION_NAMES.indexOf(sectionName) + 1];
    const end = next ? markdown.indexOf(`## ${next}\n`, start) : markdown.length;
    const body = markdown.slice(start, end);
    counts[sectionName] = body.split("\n")
      .filter(($0) => $0.trim() !== "" && !$0.startsWith("## "))
      .length;
  }

  return counts;
}

function sectionBody(markdown: string, sectionName: string): string {
  const start = markdown.indexOf(`## ${sectionName}\n`);
  const next = SECTION_NAMES[SECTION_NAMES.indexOf(sectionName as (typeof SECTION_NAMES)[number]) + 1];
  const end = next ? markdown.indexOf(`## ${next}\n`, start) : markdown.length;

  return markdown.slice(start, end)
    .split("\n")
    .filter(($0) => $0.trim() !== "" && !$0.startsWith("## "))
    .join("\n");
}

function fencedJson(value: unknown): string {
  return ["```json", JSON.stringify(value), "```"].join("\n");
}

function proseWrappedJson(value: unknown): string {
  return ["Here is the requested JSON:", JSON.stringify(value), "Done."].join("\n");
}

function h2Headers(markdown: string): string[] {
  return markdown.split("\n")
    .filter(($0) => $0.startsWith("## "))
    .map(($0) => $0.slice(3));
}
