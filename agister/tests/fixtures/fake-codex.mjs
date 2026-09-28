#!/usr/bin/env node
// Stand-in for `codex exec --json`. The scenario is chosen by a
// `SCENARIO:<name>` marker anywhere in the prompt read from stdin.
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
const scenario = /SCENARIO:([a-z_]+)/.exec(prompt)?.[1] ?? "approve";
const emit = (message) => process.stdout.write(JSON.stringify(message) + "\n");
const schemaPath = flag("--output-schema");
const schema = schemaPath && existsSync(schemaPath) ? JSON.parse(readFileSync(schemaPath, "utf8")) : undefined;

// Extra fields (argv, cwd, prompt, schema) are for tests; real Codex sends only thread_id.
emit({ type: "thread.started", thread_id: "01a0e850-b808-71c2-8401-53ba16d8ae18", argv: args, cwd: process.cwd(), prompt, schema });

if (scenario === "no_result") process.exit(0);
emit({ type: "turn.started" });
// Mid-turn transport noise, as observed from real Codex: not terminal.
emit({ type: "error", message: "Reconnecting... 2/5 (stream disconnected before completion)" });
emit({ type: "item.completed", item: { id: "item_0", type: "error", message: "Falling back from WebSockets to HTTPS transport." } });

if (scenario === "hang") {
  setInterval(() => {}, 1_000);
} else if (scenario === "exit_nonzero") {
  emit({ type: "error", message: "unexpected status 401 Unauthorized" });
  process.stderr.write("Error: unauthorized\n");
  process.exit(1);
} else if (scenario === "turn_failed") {
  emit({ type: "turn.failed", error: { message: "context window exceeded" } });
} else {
  emit({ type: "item.started", item: { id: "item_1", type: "command_execution", command: "bash -lc 'git diff --stat'", status: "in_progress" } });
  emit({ type: "item.completed", item: { id: "item_1", type: "command_execution", command: "bash -lc 'git diff --stat'", exit_code: 0, status: "completed" } });
  emit({ type: "item.started", item: { id: "item_2", type: "command_execution", command: "touch x", status: "in_progress" } });
  emit({ type: "item.completed", item: { id: "item_2", type: "command_execution", command: "touch x", exit_code: 1, status: "failed" } });
  emit({ type: "item.completed", item: { id: "item_3", type: "reasoning", text: "thinking" } });

  const outputs = {
    approve: { verdict: "approve", summary: "Looks fine.", findings: [{ severity: "nit", file: "a.txt", line: null, title: "Wording", detail: "Consider rewording." }] },
    request_changes: { verdict: "request_changes", summary: "A real bug.", findings: [{ severity: "major", file: "a.txt", line: 2, title: "Off by one", detail: "Loop bound is wrong." }] },
  };
  const text = scenario === "not_json" ? "Here is my review: looks fine" : schema ? JSON.stringify(outputs[scenario] ?? outputs.approve) : "All good.";
  emit({ type: "item.completed", item: { id: "item_4", type: "agent_message", text } });
  emit({ type: "turn.completed", usage: { input_tokens: 1200, cached_input_tokens: 300, output_tokens: 80 } });
}
