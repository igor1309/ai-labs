#!/usr/bin/env node
// Stand-in for `claude -p --output-format stream-json`. The scenario is chosen
// by a `SCENARIO:<name>` marker anywhere in the prompt read from stdin.

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
const scenario = /SCENARIO:([a-z_]+)/.exec(prompt)?.[1] ?? "approve";
const sessionId = scenario === "mismatch" ? "00000000-0000-0000-0000-000000000000" : flag("--session-id");
const emit = (message) => process.stdout.write(JSON.stringify(message) + "\n");

emit({ type: "system", subtype: "init", session_id: sessionId, model: flag("--model") ?? "fake-model", permissionMode: flag("--permission-mode"), tools: ["Read"], cwd: process.cwd(), argv: args });

if (scenario === "hang") {
  setInterval(() => {}, 1_000);
} else if (scenario === "exit_nonzero") {
  process.stderr.write("fatal: provider exploded\n");
  process.exit(3);
} else if (scenario === "no_result") {
  process.exit(0);
} else {
  emit({ type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "README.md" } }] } });
  emit({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }] } });
  emit({ type: "assistant", message: { content: [{ type: "text", text: "Done looking." }] } });
  emit("not json at all");
  process.stdout.write("{broken\n");

  const outputs = {
    approve: { verdict: "approve", summary: "Looks fine.", findings: [{ severity: "nit", file: "a.txt", title: "Wording", detail: "Consider rewording." }] },
    request_changes: { verdict: "request_changes", summary: "A real bug.", findings: [{ severity: "major", file: "a.txt", line: 2, title: "Off by one", detail: "Loop bound is wrong." }] },
    invalid_output: { verdict: "maybe", summary: 1, findings: "none" },
    mismatch: { verdict: "approve", summary: "ok", findings: [] },
  };

  if (scenario === "error_result") {
    emit({ type: "result", subtype: "error_during_execution", is_error: true, session_id: sessionId, errors: ["tool crashed"], num_turns: 2, total_cost_usd: 0.01, duration_ms: 1200, permission_denials: [] });
  } else {
    const result = { type: "result", subtype: "success", is_error: false, session_id: sessionId, result: "All good.", num_turns: 2, total_cost_usd: 0.0123, duration_ms: 3400, permission_denials: [{ tool_name: "Edit" }] };
    if (args.includes("--json-schema") && scenario !== "no_structured_output") result.structured_output = outputs[scenario] ?? outputs.approve;
    emit(result);
  }
}
