# OpenCode settings (opt-in)

[OpenCode](https://opencode.ai) is the coding agent CLI `opencode`;
adapter `opencode`, contract `opencode/1`, written against 1.18.33. These
settings are not installed by `agister init`.
No tool is verified yet: nothing about OpenCode's tools has been checked
live through Agister. So, as shipped, the mapping fails `agister check`
(`verifies no primitive against any runtime version`), and a home it is
copied into runs nothing until a tool is verified (see Use).

## Install and authenticate

```sh
brew install opencode   # or as https://opencode.ai/docs says
opencode --version
opencode providers list
opencode providers login
```

Credentials stay in OpenCode's own store (`opencode providers`) or in the
provider's environment variable, never in Agister's settings.

## What is supported

- Model and effort: the agent's `model` as OpenCode takes it,
  `provider/model` (`-m`); its `effort` as `--variant`, the model's
  reasoning effort, which is provider-specific.
- Tools: every call runs as an OpenCode agent Agister generates for it and
  passes inline (`OPENCODE_CONFIG_CONTENT`, `--agent`). Its permission
  denies everything, then allows the granted primitives, so no call asks
  for approval and nothing else is granted. A primitive is an OpenCode
  permission: `read`, `grep`, `glob`, `skill`, `edit`, `bash`, `webfetch`,
  `websearch`. `edit` is the one permission of the tools `edit`, `write`
  and `apply_patch`; they cannot be granted apart. Subagents (`task`),
  `todowrite` and `question` are never allowed.
- Your own OpenCode config: OpenCode merges the generated agent over your
  global config and the repository's (`opencode.json`, `.opencode`). The
  agent's rules come after every global permission rule, and its name is
  the call's own (`agister-<random>`), so no config widens what it allows.
  A managed (administrator's) config is merged over it.
- Resume: OpenCode keeps sessions in its own store. A call's later turns,
  and a continuation (`--continue`) from the directory the run worked in,
  resume the session in place by the ID OpenCode reported (`-s`). A
  continuation from another directory, or of a process that works in a
  checkout of its own, is refused before any workspace is made.
- Instructions and skills: the process's instruction is the generated
  agent's prompt. OpenCode loads the repository's `AGENTS.md` (or
  `CLAUDE.md` when there is none) and discovers its `.agents/skills`,
  `.claude/skills` and `.opencode/skills`, and your own (ADR-006). Skills
  are listed and loaded by the `skill` tool only, so a call not granted
  `skill` is refused before OpenCode starts. The process's policy and the
  service must therefore allow `skill`'s permissions, `repository.read` and
  `host.read`; a home from `agister init` does not allow `host.read` (its
  service lists it as state-reaching), so there `ask_opencode` is refused
  until host reads are opted in to (below).
- Tool-call events: each tool call is reported when OpenCode's stream
  reports it (`tool_use`), so the staleness limit on repeated tool calls
  applies. The stream seen so far reports a call once it has ended; if
  that is all it does, a command still running is not seen, and
  `stale.tool_command` cannot stop one.
- Cost reporting: the turn's tokens and OpenCode's own cost, summed over
  the steps of the turn.

## Limitations

- No sandbox: `bash` grants everything, like Claude Code's `Bash`, and
  the file tools are declared to read the host (`host.read`, which the
  shipped service never grants). The generated agent denies OpenCode's
  `external_directory` permission with the rest, which should keep the
  file tools inside the working directory; that has not been checked live.
  A repository opts in to host reads in its own `service.toml`, as
  `examples/codex/README.md` describes.
- No cost limit: calls under a cost limit are refused.
- No native structured output: the schema goes in the generated agent's
  prompt, the final assistant text is the output, and anything but JSON
  fails the call.
- Plugins are off in every call (`--pure`), so no OpenCode plugin of yours
  runs inside one. The repository's `opencode.json` is still loaded, with
  whatever it configures besides tools (MCP servers, say).

## Use

With OpenCode 1.18 installed and authenticated, and Agister's home
initialized, try the settings in one repository's `.agister/` first, since
they fail `check` until a tool is verified. Check live what each tool you
need grants, add the `verified` versions to `runtimes/opencode.yaml`
(`read: {grants: [...], verified: ["1.18."]}`), and record the check in
`docs/findings.md`. Opt in to host reads in the repository's
`service.toml` as described above. Then, from the repository root:

```sh
cp -R agister/examples/opencode/. .agister/
agister check --probe
agister run ask_opencode --param question="What does this repository do?"
```
