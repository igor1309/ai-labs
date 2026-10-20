# Agister provider (spike)

A feasibility spike, not a feature. It checks whether bb's public provider
plugin API (bb 0.46.1, `@get-bb/plugin-sdk` 0.6.49) can run one Agister
workflow per thread turn. Do not install it in a working bb.

## What it does

- `server.ts` registers the provider `agister-spike` with one model,
  `agister/bb_spike`.
- `host.ts` exports the bridge that the host daemon runs in the thread's
  environment.
- Each turn runs one fixed command, spawned as an argv array with no shell:
  `agister run bb_spike --param prompt=<turn text>`. The prompt is one value;
  no workflow name, executable path or flag comes from it.
- Agister's stderr progress lines are streamed verbatim as command output.
  Its final JSON becomes the assistant message plus an `extension.state`
  run reference (`runId`, `status`, `class`, `recordPath`).
- The bridge passes Agister only an allowlisted environment (`PATH`, `HOME`,
  locale, `TMPDIR`, `AGISTER_HOME`, and similar). Provider keys in the
  daemon's environment do not reach it.
- Stop and bridge shutdown cancel the run through Agister with SIGTERM and
  wait for it to finish. SIGKILL is only a last resort, and the message says
  that the record will read `lost`.

The workflow `bb_spike` must exist in the worktree's `.agister` (repository
layer) or in Agister's home. `test/fixture.ts` defines it as one bash step,
so no model is called.

## Checks

```sh
npm install
npx tsc --noEmit
npx vitest run   # smoke, missing agister, stop, shutdown, bridge conformance
```

The tests use a temporary `AGISTER_HOME` and git repository and need
`agister` on `PATH`.

## Findings

See the spike report in the bb thread that produced this directory.
Summary:
- Run IDs are known only at the end of a run.
- Progress text is not a contract.
- `--continue` and `--reuse` are not mapped.
- Stop is a real cancel only while the bridge gets to SIGTERM Agister and
  wait for it.
