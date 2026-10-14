# LAB-45: OpenCode as an Agister runtime

Add OpenCode (`opencode` on PATH, installed: 1.18.33) as a runtime adapter
with contract `opencode/1`, next to `claudecode`, `codex` and `pi`. Model
it on `pi` (the closest: a CLI with a JSON event stream and no sandbox) and
use the `supervisor` for the process group, timeout, cancellation and
cleanup. Wire it in `cmd/agister/main.go` as adapter `opencode`. Do not
call a real model provider in this run: everything is proven with a fake
binary. `opencode --help`, `opencode run --help` and `opencode debug
--help` are available; the docs are at https://opencode.ai/docs (config,
agents, permissions, tools, CLI) if you can reach them.

## Facts checked live on 1.18.33 (do not re-check against a provider)

- `opencode run --format json --pure -m <provider/model> "<message>"`
  writes one JSON event per line on stdout and exits 0. `--pure` runs
  without external plugins (a user's plugins must not run inside a call).
  Events seen, each with `type`, `timestamp`, `sessionID` and `part`:
  - `step_start`: `part.type` `step-start`.
  - `tool_use`: `part.tool` (e.g. `read`), `part.callID`, `part.state`
    with `status` (`completed`, ...), `input`, `output`, `time.start/end`.
  - `text`: `part.text`, the assistant's text.
  - `step_finish`: `part.reason` (`tool-calls` mid-turn, `stop` at the
    end), `part.tokens` `{total, input, output, reasoning, cache: {write,
    read}}`, `part.cost` (USD, number). The turn's usage and cost are the
    sum over its `step_finish` events.
  - `error` (no `part`): `error.name`, `error.data.message`; e.g. an
    unknown model gave `{"name":"UnknownError","data":{"message":"Unexpected
    server error. ..."}}` and exit status 1.
  The final assistant text is the output.
- `-s <sessionID>` continues a session; `--dir` sets the directory;
  `--variant` is the model's reasoning effort (provider-specific, e.g.
  `minimal`, `high`, `max`); `--auto` auto-approves permissions not
  explicitly denied.
- Config can be given inline in the `OPENCODE_CONFIG_CONTENT` environment
  variable (JSON). An agent defined there with `--agent <name>` sets the
  system prompt and the tools: with
  `{"agent":{"agister":{"mode":"primary","prompt":"...","permission":{...},"tools":{"write":false,...}}}}`
  the call followed the prompt and did not write a file it was asked to.

## Adapter (`internal/adapters/runtime/opencode`)

- Command line: `opencode run --format json --pure --agent agister -m
  <model>` (+ `--variant <effort>` when an effort is set), the prompt as
  the message (or on stdin if `run` reads one — check), working directory
  the checkout. Agister's instruction and the output schema go in the
  generated agent's `prompt`, as `pi` builds its system prompt.
- Tools: the granted primitives, by OpenCode's tool names (read, write,
  edit, bash, grep, glob, list, webfetch, ... — find the built-in set),
  are the only tools enabled in the generated agent; every other tool is
  disabled and its permission denied, so no call asks for approval and
  none is silently granted. Say in the package comment how the config is
  merged with the user's own OpenCode config and that it cannot widen what
  the generated agent allows.
- Sessions: OpenCode keeps them in its own store; Agister takes the
  session ID from the stream's `sessionID`. A continuation resumes it with
  `-s` from the same directory; a turn that reports another session fails,
  as in `pi`. Report `Resume: true` only if this holds.
- OpenCode cannot limit cost: a request with `MaxCostUSD` is refused with
  `opencode/1 cannot limit cost`. Refuse an unknown primitive and an
  effort outside the mapping's efforts.
- Events: tool calls from `tool_use`; assistant text; usage and cost
  summed from `step_finish`; `error` events and a non-zero exit classified
  as `pi` classifies its failures; a stream that ends without a final
  `step_finish` with reason `stop` is not completed. Identity: `opencode
  --version`.
- Skills: say in the package comment and the README whether OpenCode
  discovers the checkout's `.agents/skills` and `AGENTS.md` (find out from
  the docs or the binary's help); if a call cannot read a skill without a
  read tool, refuse it as `pi` does (SkillTools).

## Settings

`examples/opencode/` like `examples/pi/`: `runtimes/opencode.yaml`
(contract `opencode/1`, the efforts, `select: any`; file-reading tools →
repository read/search and `host.read`; `edit`/`write` →
`repository.write`; `bash` → everything; `webfetch` → `network`; mark none
verified: a later live check does that), an agent `opencode-minimax`
(runtime `opencode`, model `opencode-go/minimax-m3`), a process
`ask_opencode` shaped like `ask_pi`, and `README.md`: install, auth
(`opencode providers`; credentials stay in OpenCode's own store or env,
never in settings), what is supported and the limitations (no sandbox, no
cost limit, no native structured output, plugins off).

## Tests

- A fake OpenCode binary (`runtimetest/fakeopencode`) writing the stream
  above, and the adapter through `runtimetest.Conformance` like the
  others: success, a runtime failure, timeout and cancellation with
  cleanup.
- Unit tests as `pi_test.go` has: arguments and the generated config for
  a fresh and a resumed turn, the tools enabled and the rest denied, model
  and variant, the refusals, a resume reporting another session fails,
  structured output must be JSON, usage and cost summed, failures
  classified.
- A CLI settings test like `cmd/agister/pi_settings_test.go`.

Run the full check from `agister/` (its AGENTS.md) and `node --test
pages/tests/*.test.js`. Report each command with its exit code and final
line, the OpenCode facts the adapter depends on that you found yourself
(and where), and list every file you changed.
