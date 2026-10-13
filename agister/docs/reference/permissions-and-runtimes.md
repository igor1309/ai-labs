# Permissions and runtimes

[Reference](README.md) · [Agister](../../README.md)

## Permission planning

Runtimes are used as shipped, with documented options only; no
runtime-specific workarounds. Their permissions are best effort
([ADR-036](../adr/036-a-runtimes-permissions-are-best-effort.md), amending
ADR-001 and ADR-029). `tools.require` is a hard check. `tools.allow`, after
limit composition, is a best-effort ceiling, not a sandbox guarantee.
The service's `state_reaching` permissions are never granted.

For `select: one`, the plan chooses the safe primitive with the fewest
grants that supplies everything required; equal sizes use mapping order.
Grants beyond the effective allow set are `extra`: a loud warning, not a
refusal. This also applies when a primitive fits allow: optional allowed
permissions may be withheld by a narrower mode. For `select: any`, the
plan grants every primitive whose grants fit allow and avoid state reach.
A required permission no selected primitive provides refuses the call.
An extra writing grant makes the call a writer, holding the worktree alone.

## Workflow bindings

`check` resolves every node of every workflow: the process, agent, runtime
mapping and plan. A binding withholding `tools.require`, with no safe
mode, or failing another hard check is a problem of that workflow,
naming the node. Another workflow binding the process to a suitable
agent still runs. Optional allowed permissions the plan does not give
are listed as `withheld`. Extra grants are named in a warning for each
binding, alongside its process, agent and runtime, and in the JSON
binding's `extra` list. `workflow show` shows the plan and warnings for
each node. `process show` shows the process on no agent.

The call record's `plan` holds `declared` (effective permissions),
`granted`, `extra` and `withheld`. Its `result.warnings` carries the
permission and version warnings. A workflow result carries its nodes'
warnings with node names; the printed result shows `WARNING` even for a
completed run and with `--quiet`. Warnings keep the completion status and
exit code.

## Runtime version probes

A mapping lists version prefixes each primitive was checked against in
`verified`. A call or `check --probe` on a version with no verified
primitive invokes the adapter's probe, where it has one
([ADR-029](../adr/029-an-unverified-runtime-version-is-probed.md)).
Codex probes its modes and a resumed read-only turn on `gpt-6-luna` at
`low`, taking about 20 seconds. Passing evidence is cached under
`~/.agister/probes/<adapter>/<version>.json`; a failed probe is remembered
by that process. A probe describes what happened, not what a later call
can do. An unverified version, selected unverified primitive, or probe
failure warns and still uses the mapping's declared offer. No edit to
`verified` is needed to run after an upgrade.

## Example services

`examples/settings/` is what `init` installs; `examples/codex/`,
`examples/pi/` and `examples/opencode/` are opt-in. The shipped service
marks `host.read` and `host.write` as `state_reaching`; tools with those
grants are withheld, and Codex modes reading the host refuse. A service
listing neither accepts that reach, as `home/service.toml` does.
