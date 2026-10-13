# Permissions and runtimes

[Reference](README.md) · [Agister](../../README.md)

## Workflow bindings

`check` resolves every node of every workflow as a call would, up to the
runtime's installed version: the process, the agent, its runtime mapping
and the plan. A binding whose mapping gives no primitive the process
allows, that would withhold a permission in `tools.require`, or that
fails as a call on that agent would, is a problem of that workflow,
naming the node; another workflow that binds the same process to an agent
that can run it still runs. A permission allowed and not required that
the runtime does not give is no problem: `check` and `workflow show` list
it as `withheld` on that binding. `process show` shows the process on no
agent; `workflow show` shows each node as its binding runs: its process,
agent and runtime, the params it receives, its plan and what it
withholds.

## Runtime version probes

A runtime mapping lists, per primitive, the runtime versions it is
`verified` for. A call, or `check --probe`, on a version the mapping
verifies no primitive for has the adapter probe that version first, where
the adapter has a probe; Codex's does
([ADR-029](../adr/029-an-unverified-runtime-version-is-probed.md)). It
runs one script in each sandbox mode, and in a read-only turn that resumes
a workspace-write thread, on `gpt-6-luna` at effort `low`: about 20
seconds. The modes whose sandbox held are verified for that version, and
the probe is kept as `~/.agister/probes/<adapter>/<version>.json`, which
later calls read. A probe that fails, or proves nothing, refuses the call
with its outcomes, and is not run again by that process.

## Example services

`examples/settings/` is what `init` installs; `examples/codex/`,
`examples/pi/` and `examples/opencode/` are opt-in. The shipped service
lists `host.read` and `host.write` as `state_reaching`, so on it
`implement` gets no file tool (Claude Code's reach the host) and a
read-only process is refused on Codex, whose sandbox reads the host. A service that lists neither accepts that
reach, as `home/service.toml` does.
