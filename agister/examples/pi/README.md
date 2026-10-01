# Pi settings (opt-in)

[Pi](https://pi.dev) is the coding agent CLI of the npm package
`@earendil-works/pi-coding-agent`; adapter `pi`, contract `pi/1`, written
against 0.85.1. These settings are not installed by `agister init`:
`agister check` refuses them as shipped, because the mapping is not
verified against a live Pi (no primitive lists a `verified` version).

## Install and authenticate

```sh
npm i -g @earendil-works/pi-coding-agent
pi --version
pi auth check --provider opencode-go
```

Credentials stay in Pi's own configuration (`~/.pi/agent`) or in the
provider's environment variable (`OPENCODE_API_KEY` for `opencode-go`;
`pi --help` lists them), never in Agister's settings.

## What is supported

- Model and thinking: the agent's `model` as Pi takes it, `provider/id`
  (`--model`); its `effort` as `--thinking` (`off` to `max`).
- Tools: the granted primitives are Pi's tool names, passed as the
  `--tools` allowlist; none granted is `--no-tools`.
- Resume: Agister keeps Pi's sessions under its home
  (`$AGISTER_HOME/pi/sessions`, `--session-dir`), not in `~/.pi`. A call's
  later turns, and a continuation (`--continue`) from the directory the
  run worked in, resume the session in place by the ID Pi reported. Pi
  finds a session only from its own working directory, so continuing a run
  that worked in a checkout of its own is refused.
- Instructions and skills: the process's instruction goes in the system
  prompt; Pi loads the repository's `AGENTS.md` and, as each turn trusts
  the project (`--approve`), its `.agents/skills` (ADR-006). A skill is
  used by reading it, so only an agent granted `read` or `bash` can.
- Tool-call events: each tool execution is reported as it starts and
  finishes, so the staleness limits on tool calls apply.
- Cost reporting: the turn's tokens and Pi's own `cost.total`, summed over
  the messages of the turn.

## Limitations

- No sandbox: Pi's file tools read outside the working directory
  (`host.read`, which the shipped service never grants), and `bash` grants
  everything, like Claude Code's `Bash`. A repository opts in to host
  reads in its own `service.toml`, as `examples/codex/README.md` describes.
- No cost limit: calls under a cost limit are refused.
- No native structured output: the schema goes in the system prompt, the
  final assistant text is the output, and anything but JSON fails the call.
- Extensions, prompt templates and themes are off in every call, so no
  Pi package of yours runs inside one; trusting the project also loads its
  `.pi/settings.json`.

## Use

Verify what each tool grants on your Pi version, add the `verified`
versions to `runtimes/pi.yaml` (and record the check in
`docs/findings.md`), copy these files into `$AGISTER_HOME`, or into one
repository's `.agister/` to try them there only, and run
`agister check --probe`. Every command runs `check` first, so until these
files pass it, every command in that scope stops. Then:

```sh
agister run ask_pi --param question="What does this repository do?"
```
