# Pi settings (opt-in)

[Pi](https://pi.dev) is the coding agent CLI of the npm package
`@earendil-works/pi-coding-agent`; adapter `pi`, contract `pi/1`, written
against 0.85.1. These settings are not installed by `agister init`.
Every tool (`read`, `grep`, `find`, `ls`, `edit`, `write` and `bash`) is
verified for 0.85; `agister check` accepts the example.

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
  `--tools` allowlist. A call needs `read` or `bash` (see below), so
  `--no-tools` is never passed.
- Resume: Agister keeps Pi's sessions under its home
  (`$AGISTER_HOME/pi/sessions`, `--session-dir`), not in `~/.pi`. A call's
  later turns, and a continuation (`--continue`) from the directory the
  run worked in, resume the session in place by the ID Pi reported. Pi
  finds a session only from its own working directory, so a continuation
  from another directory, or of a process that works in a checkout of its
  own, is refused before any workspace is made.
- Instructions and skills: the process's instruction goes in the system
  prompt; Pi loads the repository's `AGENTS.md` and, as each turn trusts
  the project (`--approve`), its `.agents/skills` (ADR-006). A skill is
  used by reading it, and Pi reads with `read` or `bash` only, so a call
  granted neither is refused before Pi starts. The process's policy and
  the service must therefore allow `read`'s permissions,
  `repository.read` and `host.read`; a home from `agister init` does not
  allow `host.read` (its service lists it as state-reaching), so there
  `ask_pi` is refused until host reads are opted in to (below).
- Tool-call events: each tool execution is reported as it starts and
  finishes, so the staleness limits on tool calls apply.
- Cost reporting: the turn's tokens and Pi's own `cost.total`, summed over
  the messages of the turn.

## Limitations

- No sandbox: Pi's file tools read outside the working directory
  (`host.read`, which the shipped service never grants), `edit` and
  `write` write there too (`host.write`), and `bash` grants everything,
  like Claude Code's `Bash`. A repository opts in to host
  reads in its own `service.toml`, as `examples/codex/README.md` describes.
- No cost limit: calls under a cost limit are refused.
- No native structured output: the schema goes in the system prompt, the
  final assistant text is the output, and anything but JSON fails the call.
- Extensions, prompt templates and themes are off in every call, so no
  Pi package of yours runs inside one; trusting the project also loads its
  `.pi/settings.json`. Every call starts Pi offline (`--offline`), so Pi
  installs no package that file lists; instructions and skills still
  load.

## Use

With Pi 0.85 installed and authenticated, and Agister's home initialized,
opt in to host reads in the repository's `service.toml` as described above.
From the repository root, copy the example into your Agister home, then
ask a question:

```sh
cp -R agister/examples/pi/. "${AGISTER_HOME:-$HOME/.agister}/"
agister run ask_pi --param question="What does this repository do?"
```

You can instead copy the settings into one repository's `.agister/` to
try them there only. `agister check --probe` checks the installed runtime;
every command runs `check` first. For other Pi versions or the unverified
tools, check their grants live, add the `verified` versions to
`runtimes/pi.yaml`, and record the check in `docs/findings.md`.
