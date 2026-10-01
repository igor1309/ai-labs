# LAB-46: Pi as an Agister runtime

Add Pi (`@earendil-works/pi-coding-agent`, installed: 0.85.1, `pi` on PATH)
as a runtime adapter with contract `pi/1`, next to `claudecode` and
`codex`. Pi's docs are in the installed package:
`$(npm root -g)/@earendil-works/pi-coding-agent/docs/` — `json.md` (event
stream), `usage.md`, `sessions.md`, `session-format.md` (usage and cost
fields), `skills.md`, `security.md`, `settings.md`; `pi --help` lists the
flags. Read them; do not guess the wire format. Do not call a real model
provider in this run: everything is proven with a fake binary.

## Adapter (`internal/adapters/runtime/pi`)

Model it on `codex` and `claudecode`, with the `supervisor` for the
process group, timeout, cancellation and cleanup. Wire it in
`cmd/agister/main.go` as adapter `pi`.

- Command line: `pi -p --mode json`, with extensions, prompt templates and
  themes off (`--no-extensions --no-prompt-templates --no-themes`): a
  user's Pi packages (e.g. a tracing extension) must not run inside a call.
  Keep context files and skills discovery on: the checkout's `AGENTS.md`
  and `.agents/skills` reach the call as ADR-006 says. Find out from the
  docs whether project-local trust needs `--approve`; decide and say why
  in the package comment.
- Sessions in a directory Agister chooses per call (`--session-dir`), not
  `~/.pi`; Agister does not choose the session ID: it takes the one the
  stream's `session` header reports. A continuation resumes that session
  in place (`--session <id>` with the same `--session-dir`); a turn that
  reports another session fails, as in `claudecode`. Report `Resume: true`
  only if this holds, and keep the session dir for the call's later turns.
- Model: the agent's model, as Pi takes it (`provider/id`, `--model`);
  effort maps to `--thinking` (`off, minimal, low, medium, high, xhigh,
  max`).
- Primitives are Pi tool names, passed as the `--tools` allowlist (`read,
  bash, edit, write, grep, find, ls`); none granted means `--no-tools`.
- Instruction and output schema go in the system prompt
  (`--append-system-prompt`); the prompt goes as Pi takes it (stdin if it
  reads one, else as the message argument — check `usage.md`). Pi has no
  structured output: the final assistant text is the output, which must be
  JSON when a schema is given (Agister validates it against the schema).
- Pi cannot limit cost: a request with `MaxCostUSD` is refused with
  `pi/1 cannot limit cost`, as `codex` does.
- Events: tool starts and ends (`tool_execution_start` / `_end`) as tool
  calls; assistant text; usage and cost from the final messages (token
  counts and `cost.total` summed over the turn); errors and the stop reason
  classified as `codex` and `claudecode` classify theirs. Identity: `pi
  --version`.

## Settings

- `examples/settings/runtimes/pi.yaml` (or `examples/pi/` if examples
  under `settings/` must all pass `agister check` on a machine without Pi —
  look at how `examples/codex/` is done and follow it): contract `pi/1`,
  efforts as above, `select: any`. Grants: `read`, `grep`, `find`, `ls` →
  repository read/search and `host.read` (Pi's file tools are not confined
  to the working directory); `edit`, `write` → `repository.write`; `bash` →
  everything, like Claude Code's `Bash`. Mark none verified: a later live
  check does that (`docs/findings.md`).
- An agent `pi-minimax` (runtime `pi`, model `opencode-go/minimax-m3`) and
  a process `ask_pi`, shaped like the existing `ask` process.
- `examples/pi/README.md`: the package and version, install (`npm i -g
  @earendil-works/pi-coding-agent`), authentication (`pi auth check
  --provider <p>`; credentials stay in Pi's own config or env, never in
  settings), what is supported (model and thinking, tools, resume,
  instructions and skills, tool-call events, cost reporting) and the
  limitations (no sandbox: `bash` grants everything; no cost limit; no
  native structured output; extensions off).

## Tests

- A fake Pi binary (`runtimetest/fakepi`) that writes the documented JSON
  stream, and the adapter through `runtimetest.Conformance` like the other
  two: success, a runtime failure, timeout and cancellation with cleanup.
- Unit tests as `codex_test.go` has: the arguments for a fresh and a
  resumed turn, tools allowlist and `--no-tools`, model and thinking, the
  refusals (cost limit, unknown primitive), resume reporting another
  session fails, structured output must be JSON, usage and cost summed,
  failures classified.
- A settings test that the example runtime mapping parses and passes
  `check`.

Run the full check from `agister/` (its AGENTS.md) and `node --test
pages/tests/*.test.js`. Report each command with its exit code and final
line, the Pi facts you took from the docs that the adapter depends on
(with the doc file), and list every file you changed.
