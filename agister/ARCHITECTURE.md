---
date: 2026-09-28
status: draft
description: "Agister CLI architecture (Go): what code knows, what settings define, layers, ports and acceptance tests"
---

# Agister CLI architecture (draft)

Target for the Go implementation. The TypeScript in `src/` is the prototype
that produced the evidence this draft relies on. Its tests and fixtures are
the behavioural spec; its structure is not the model.

## 1. Principle: code knows an agent call, settings know everything else

The code knows one generic thing: **run an agent call**. It resolves a
process definition, composes its policy, gathers inputs, turns capabilities
into runtime primitives, runs one turn in the agent's runtime, validates the
output and records the run.

The code has no concept of *review*, *reviewer*, *findings*, *verdict* or any
other particular kind of work. Those are settings, and any of them can change
without recompiling:

| Defined in settings | Format | Example |
|---|---|---|
| Agents: runtime, model, model family, effort | TOML (flat) | `agents/reviewer.toml` |
| Processes: instruction, inputs and their sources, workspace, output contract, policy overrides | YAML (hierarchical) | `processes/adversarial_review.yaml` |
| Process policies: reusable execution defaults | YAML | `policies/static-review.yaml` |
| Output contracts | JSON Schema | `schemas/agister.review-result.v1alpha1.json` |
| Runtime capability mappings: what each primitive grants | YAML | `runtimes/claude-code.yaml` |
| Service: ceilings, capability vocabulary | TOML (flat) | `service.toml` |
| Prompt and result templates (optional overrides) | Go `text/template` | `templates/*.tmpl` |

TOML is used for flat settings and YAML for hierarchy, chosen by how
expressive each needs to be, not for uniformity.

**What stays in code** are the mechanisms, each an extension point (§7):

- how to drive a runtime (process protocol, arguments, stream parsing,
  outcome rules);
- how to resolve an input source (`git.diff`, `file`, …);
- how to evaluate a constraint kind (model family vs provenance);
- how to turn a capability set into runtime primitives (one generic
  algorithm over the mapping in settings, §4).

## 2. Concepts

| Concept | Meaning |
|---|---|
| **Agent** | Reusable runtime profile: runtime, model, model family, effort, session mode. No prompt, no capabilities. |
| **Process** | A named agent call: instruction, input declarations, workspace, output contract, reference to an agent and a policy, and narrowing overrides. |
| **Policy** | Reusable execution defaults: allowed and denied capabilities, workspace access, timeout, attempts, constraints, resources, retained artifacts. |
| **Capability** | An opaque name from the service vocabulary (`repository.read`, …). Code never interprets a capability name; only the mappings do. |
| **Runtime** | Code that drives one provider CLI (Claude Code, Codex). It knows its own primitives, not capabilities. |
| **Runtime mapping** | Settings that declare each primitive of a runtime and the capabilities it grants, including implicit ones. |
| **Enforcement plan** | For one call: the primitives granted, the capabilities withheld, or a refusal. Computed purely from the effective capabilities and the runtime mapping. |
| **Run** | One execution of a process: identities, inputs, effective definition with source digests, events, outcome, output. |
| **Outcome** | Turn level: `completed \| failed \| interrupted \| lost`. Call level: `accepted \| rejected \| failed \| refused`. |

## 3. Settings

```text
.agister/
  service.toml                    ceilings, capability vocabulary
  agents/<name>.toml              agister.agent/v1alpha1
  processes/<name>.yaml           agister.process/v1alpha1
  policies/<name>.yaml            agister.process-policy/v1alpha1
  runtimes/<name>.yaml            agister.runtime/v1alpha1
  schemas/<id>.json               JSON Schema output contracts
  templates/<name>.tmpl           optional prompt / result templates
  provenance/<sha>.json           written by Agister for revisions it produced
  runs/<run-id>/                  run evidence (§9)
  logs/agister.jsonl              diagnostics (§9)
```

`agister init` copies an example set (the research review definitions) into
this layout. The examples are data shipped next to the binary, not code
paths.

### Process: inputs have sources, the workspace references an input

```yaml
schema: agister.process/v1alpha1
name: adversarial_review
type: process
uses: agent:reviewer
policy: process-policy:static-review

input:
  instruction: >-
    Review the exact candidate independently and adversarially. …
  params:                     # supplied by the caller: --param base=main
    base: {default: origin/HEAD}
    candidate: {default: HEAD}
  values:                     # what the agent receives, and where each comes from
    base_revision:      {source: git.revision, rev: "{{ .params.base }}"}
    candidate_revision: {source: git.revision, rev: "{{ .params.candidate }}"}
    diff:               {source: git.diff, base: "{{ .params.base }}", head: "{{ .params.candidate }}"}
    changed_files:      {source: git.changed_files, base: "{{ .params.base }}", head: "{{ .params.candidate }}"}

workspace:
  checkout: candidate_revision   # detached worktree at this input's revision

output:
  format: json
  schema: agister.review-result/v1alpha1
  require_valid: true
  result:                        # how the output maps to accepted / rejected
    field: verdict
    reject: [request_changes]
  render: review                 # optional templates/review.tmpl
```

Compared with the research files, `input.required` becomes `input.values`
with explicit sources, and `workspace.scope: candidate` becomes
`workspace.checkout: <input>`. Nothing in code knows the names
`candidate_revision` or `diff`.

### Runtime mapping: capability semantics live in settings

```yaml
schema: agister.runtime/v1alpha1
name: claude-code
adapter: claude-code          # which code adapter drives it
primitives:
  select: any                 # any subset may be granted
  items:
    Read:  {grants: [repository.read]}
    Glob:  {grants: [repository.read]}
    Grep:  {grants: [repository.search]}
    Edit:  {grants: [repository.write]}
    Write: {grants: [repository.write]}
    # Exposed Bash auto-approves read-only commands and cannot be fenced by
    # prefix rules (observed live), so it grants everything it can reach.
    Bash:  {grants: [process.execute, repository.read, repository.search, repository.diff,
                     repository.history.read, repository.write, repository.history.write, network]}
```

```yaml
schema: agister.runtime/v1alpha1
name: codex
adapter: codex
primitives:
  select: one                 # exactly one sandbox mode
  items:
    read-only:       {grants: [repository.read, repository.search, repository.diff,
                               repository.history.read, process.execute]}
    workspace-write: {grants: [repository.read, repository.search, repository.diff,
                               repository.history.read, process.execute,
                               repository.write, repository.history.write]}
```

The "sandboxed execution vs `process.execute`" question from step 3 becomes
a settings decision. An operator who wants one static-review policy for both
runtimes adds `process.execute.sandboxed` to the vocabulary and maps Codex's
`read-only` mode to it. No code change is needed.

Runtime mappings are trusted operator configuration, like the service
ceiling. A wrong mapping over-grants. They are therefore validated against
the vocabulary, recorded with their digest in every run, and covered by the
conformance suite's live checks (§10).

## 4. Enforcement plan (domain, pure)

```text
Plan(effective capabilities E, mapping M, process requirements R):
  select: any  -> grant every primitive p with grants(p) ⊆ E
  select: one  -> grant the primitive with grants(p) ⊆ E covering most of E;
                  none fits -> refused ("mode X also grants Y")
  withheld = E − ∪ grants(granted)
  R ∩ withheld ≠ ∅ -> refused (the process declared it needs them: tools.require)
  otherwise -> Plan{primitives, withheld}; withheld is recorded as an event
```

A primitive is granted only when *everything* it grants is allowed, so no
mapping-consistent plan can over-grant. Under-granting is recorded, and a
process can turn it into a refusal by declaring `tools.require`.

## 5. Layers and dependency rule

```text
                  ┌───────────────────────────────────────────────┐
                  │ cmd/agister — composition root                │
                  │ builds adapters, decorates them, injects them │
                  │ into use cases, hands use cases to the CLI    │
                  └──────┬───────────────┬───────────────┬────────┘
                         ▼               ▼               ▼
              ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐
              │ internal/cli │─►│ internal/app   │◄─│ internal/adapters/* │
              │ driving side │  │ use cases +    │  │ driven side:        │
              └──────────────┘  │ port interfaces│  │ implement the ports │
                                └───────┬────────┘  └──────────┬──────────┘
                                        ▼                      │
                                ┌────────────────┐             │
                                │internal/domain │◄────────────┘ (types only)
                                │ pure, no I/O   │
                                └────────────────┘
```

- `domain` imports only the standard library and the YAML, TOML and
  JSON Schema libraries (parsing and validation are pure functions).
- `app` imports `domain`. It declares every port it uses.
- `adapters/*` import `app` (for port types) and `domain`. Adapters never
  import one another, except that decorators wrap ports.
- `cli` imports `app` only.
- `cmd/agister` is the only package that imports adapters.

Enforced by a test (§10), not by convention.

## 6. Packages and responsibilities

```text
agister/
  cmd/agister/main.go            composition root
  internal/domain/
    definition/                  parse + validate agent, process, policy, runtime mapping,
                                 service documents (bytes -> values), field-path errors
    policy/                      narrowing composition, ceiling, isolation, vocabulary
    enforce/                     Plan (§4)
    constraint/                  constraint model + evaluator interface
    run/                         run record, events, turn and call outcomes
    render/                      default prompt template, input rendering
  internal/app/
    ports.go                     all port interfaces (§7)
    runprocess.go                RunProcess use case
    showprocess.go               ShowProcess (definition, effective policy, plan per runtime)
    agents.go, runs.go, init.go  CreateAgent, List*, Init, ListRuns, ShowRun
  internal/adapters/
    fsdefs/                      DefinitionSource over .agister/ (bytes + path + sha256)
    fsruns/                      RunRecorder / RunReader: run.json, events.jsonl, provider.jsonl
    fsprovenance/                Provenance
    git/                         InputProvider (git.revision, git.diff, git.changed_files),
                                 Workspaces (detached worktrees)
    inputs/                      InputProvider: param, file
    runtime/supervisor/          spawn, process group, timeout, abort, stderr tail
    runtime/claudecode/          TurnRunner: stream-json protocol, primitives -> --tools/--allowedTools
    runtime/codex/               TurnRunner: exec --json protocol, primitive -> --sandbox
    schema/                      OutputValidator (generic JSON Schema)
    logging/                     decorators for any port; slog; run ID from context
    clock/, ids/
  internal/cli/                  flags -> use case input; result -> text/JSON/template; exit codes
  examples/                      definitions copied by `agister init`
```

| Package | Owns | Must not |
|---|---|---|
| `domain/definition` | document schemas and versions, strict decoding, field-path errors | read files |
| `domain/policy` | narrowing rules, ceiling, allow − deny | know runtimes |
| `domain/enforce` | capability set → primitives, withheld, refusals | know any runtime by name |
| `app` | sequencing a use case over ports | parse bytes, spawn, print |
| `adapters/runtime/*` | one provider's protocol and outcome rules | know capabilities, processes or runs |
| `adapters/logging` | observation of ports | change arguments, results or errors |
| `cli` | presentation and exit codes | know git, files, runtimes |
| `cmd/agister` | construction and wiring | contain logic |

## 7. Ports and extension points

Ports are small and declared by `app` (interface segregation):

```go
type DefinitionSource interface {
    Read(ctx context.Context, kind Kind, name string) (Document, error) // bytes + Source{Path, SHA256}
    List(ctx context.Context, kind Kind) ([]string, error)
}

type TurnRunner interface { // one per runtime adapter
    RunTurn(ctx context.Context, req TurnRequest, events EventSink) (TurnResult, error)
}
type Runtimes interface { // keyed by the mapping's `adapter`
    Runner(adapter string, command string) (TurnRunner, error)
    Adapters() []string
}

type InputProvider interface {
    Source() string                                        // "git.diff", "file", …
    Resolve(ctx context.Context, spec InputSpec) (Value, error)
}
type Workspaces interface {
    Checkout(ctx context.Context, repo, revision string) (dir string, release func() error, err error)
}

type RunRecorder interface {
    Create(ctx context.Context, r run.Record) (RunHandle, error) // handle: Append(event), Raw(line), Finish(result)
}
type RunReader interface {
    List(ctx context.Context) ([]run.Summary, error)
    Get(ctx context.Context, id string) (run.Record, error)
}

type Provenance interface { Writer(ctx context.Context, revision string) (*run.Writer, error) }
type OutputValidator interface { Validate(schema []byte, value any) error }
type ConstraintEvaluator interface { Kind() string; Evaluate(ctx context.Context, c constraint.Spec, env constraint.Env) (constraint.Result, error) }
type Clock interface { Now() time.Time }
type IDs interface { New() string }
```

Each use case holds only the ports it uses. `ShowProcess` has no
`TurnRunner` and no `RunRecorder`, so it cannot spawn or write. `ListRuns`
has only `RunReader`.

Extension points (open/closed):

| To add … | Change |
|---|---|
| a process, agent, policy, output contract, template | settings only |
| a capability, or remap a runtime's primitives | settings only (`service.toml`, `runtimes/*.yaml`) |
| an input source (e.g. `http.get`) | new `InputProvider` + one registration line in `main.go` |
| a constraint kind | new `ConstraintEvaluator` + one line |
| a runtime (e.g. Gemini CLI) | new `TurnRunner` package + one line, plus its `runtimes/*.yaml` |
| a storage backend | new `RunRecorder`/`RunReader` (+ `DefinitionSource`) + wiring in `main.go` |

## 8. One agent call, end to end

```text
cli: agister run adversarial_review --param base=main
 → app.RunProcess.Run(ctx, {Process, Params, Agent?, Timeout?})
   1  DefinitionSource.Read(process, policy, agent, runtime mapping, service)   port
      definition.Parse* → values; policy.Compose → Effective                    pure
   2  enforce.Plan(Effective.Capabilities, mapping, requires) → Plan|refused    pure
      refused → error (exit 64), nothing recorded
   3  InputProviders[source].Resolve(spec) for each input value                 port
   4  RunRecorder.Create(record{definition, sources+digests, inputs, plan})     port
      ConstraintEvaluators[kind].Evaluate(…, Provenance)                         port
      unsatisfied → Finish(refused), return
   5  Workspaces.Checkout(repo, inputs[workspace.checkout]) → dir, release      port
      render.Prompt(process, effective, inputs)                                 pure
      Runtimes.Runner(mapping.adapter, agent.command).RunTurn(…)                port
   6  OutputValidator.Validate(schema, result.Output)                           port
      run.CallOutcome(turn outcome, output, process.output.result)              pure
      RunHandle.Finish(outcome, output); release()                              port
 ← cli renders output (template or JSON); exit 0 accepted, 1 rejected, 2 failed, 64 refused/invalid
```

## 9. Encoding, evidence and logging

**Encoding goes where the format varies with it:**

- Definitions have a fixed format and a variable location, so the domain
  parses them and adapters only fetch bytes.
- Run storage format and medium vary together, so the store adapter
  encodes.
- Provider streams vary with the provider, so the runtime adapter parses.

**Run evidence** (`runs/<id>/run.json`, `events.jsonl`, `provider.jsonl`) is
always written and is the source of truth. Every record carries the process,
policy, agent, runtime mapping, effective policy, enforcement plan and the
SHA-256 of every definition used.

**Diagnostics** (`logs/agister.jsonl`) are a cross-cutting concern.
`cmd/agister` wraps ports with `adapters/logging` decorators, which observe
without changing anything. `slog` carries the run ID, process and agent from
`context.Context`. Prompts are never logged, only their size.

## 10. Acceptance tests: SOLID as checks, not claims

| Property | Test |
|---|---|
| Dependency rule | `go list -deps` per package: `domain` and `app` import no adapter; `cli` imports only `app`; only `cmd/agister` imports adapters. |
| Settings, not code | A temp state directory with a *new* process, agent, policy, schema, capability and runtime mapping (no review anywhere) runs end to end against the fake runtimes. `grep -ri review internal/ cmd/` is empty. |
| Liskov (runtimes) | One conformance suite runs against every `TurnRunner` and every decorator, using fake provider binaries. It checks the outcome precedence rules, identity reporting, timeout/abort, primitives honoured exactly, and raw stream passthrough. |
| Liskov (stores) | One suite for every `RunRecorder`/`RunReader` pair: sequence numbers, crash-safe appends, finish semantics. |
| Interface segregation | Compile-time: use cases are constructed with only their ports (`ShowProcess{}` has no runner field). |
| Enforcement | Property tests over `enforce.Plan`: granted primitives never grant outside the effective set, for random mappings and sets. |
| Live checks (opt-in) | Against real CLIs, for each primitive in the shipped mappings: exercise the primitive and assert nothing outside its declared grants happened (the check that caught Bash). |

## 11. Migration from the TypeScript prototype

- **Carries over as spec:** the fake Claude and Codex runtimes and their
  scenarios, the narrowing cases (they parse the research YAML), the CLI
  scenarios, and the live observations in `README.md`.
- **Is removed from code:** the `review` command, `review-result.ts`, the
  hardcoded capability list and mappings, the `CANDIDATE_INPUTS` names and
  the service ceiling constant. Each becomes settings (§3).
- **Research files:** the policies stay as written. The processes gain
  `input.values` sources and `workspace.checkout`.
- The TypeScript is deleted once the Go CLI passes the carried-over
  scenarios.

## 12. Open decisions

1. `input.params` / `input.values` syntax and the template language for
   bindings (Go `text/template` shown).
2. Call-level outcome names (`accepted | rejected | failed | refused`) and
   their exit codes.
3. Whether a withheld capability should refuse by default (strict) or only
   when listed in `tools.require` (shown).
4. Module path and location: `ai-labs/agister/` with a `go.mod` here, or a
   separate repository.
