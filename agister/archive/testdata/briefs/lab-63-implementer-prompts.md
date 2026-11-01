# Implementer prompts from what Agister's docs hold (LAB-63)

What building Agister taught is in its code and in prose: the ADRs,
`agister/docs/findings.md`, `agister/docs/decisions.md`,
`agister/docs/deferred.md` and the `AGENTS.md` files. `prompts/` carries
part of it for reviewers only (`code-review-tests.md`,
`code-review-architecture.md`). Write the implementer's side as reusable
prompts, and give two of them to the implementer.

## Prompts to write, in `prompts/`

Each is for an agent that is about to write code, in any repository. It
names no Agister file, ADR, issue, package or type, and says nothing of a
process around it (reviewers, a judge, a workflow). State rules as what to
do and why, short enough to keep in mind while working: the reviewer
prompts are the model for length and tone. Use the same front matter as
`prompts/code-review-tests.md` (today's date, `model: claude-opus-5-5`,
`version: 0.0.1`, `type: prompt`). Say in the first lines what code the
prompt applies to, so a reader working on something else skips it.

1. `go-testing-seams.md`: writing Go that tests drive deterministically.
   It is the writing side of `prompts/code-review-tests.md`; an
   implementer who follows it gets no finding from that review. Sources:
   `agister/docs/adr/017-tests-fake-at-seams.md`,
   `agister/internal/adapters/system/systemtest`,
   `agister/internal/adapters/runtime/runtimetest` (`inprocess.go`,
   `fakeproc`), `agister/internal/archtest/tests_test.go` and the root
   `AGENTS.md` "Verifying fixes". Cover:
   - the seam is in the product (an injected clock, timer, process starter,
     a hook or result that says "done"), and collaborators are given, never
     defaulted;
   - a manual clock that tells the test when the code has started a
     timer, so there is no sleep and no poll;
   - a fake is one program, run built for contract tests and in process
     for the rest;
   - real machinery only where it is the claim, and the test says so;
   - parallel by default, serial with a reason;
   - a deadline only guards a hang and is never over a minute;
   - no mutation or revert checks;
   - quiet test commands, with the race detector on concurrent code.
2. `go-architecture.md`: the writing side of
   `prompts/code-review-architecture.md`. Sources: that prompt,
   `agister/docs/adr/001-agister-cli-architecture.md` and
   `agister/internal/archtest/architecture_test.go`. Cover:
   - interfaces owned by the consumer and cut by role;
   - types owned on each side of a boundary;
   - a thin composition root that owns the adapters and decorators;
   - dependencies given at construction;
   - no package-level mutable state;
   - dependency rules kept by a test over the import graph.
3. `go-process-supervision.md`: running child processes from Go. Source:
   `agister/internal/adapters/runtime/supervisor`. Cover:
   - a process group per child;
   - on timeout or cancel, TERM, then a grace period, then KILL of the
     group;
   - killing what the child left running in its group;
   - telling a reused PID apart (start time and command name), and how
     far that goes;
   - bounded capture of output (head, tail, size, digest; a tail of
     stderr);
   - a no-output limit apart from the total timeout;
   - the process start and the timer injected, so tests need no real
     process.
4. `agent-cli-behaviour.md`: not about Go. What a program that drives
   coding-agent CLIs must know, from `agister/docs/findings.md` and
   `agister/docs/adr/011-pages-shows-the-skills-a-runtime-loads.md`. Keep
   each fact with the CLI, the version and the date it was observed on, as
   the findings give them, and say the facts age: check before relying on
   one. Group by CLI (Claude Code, Codex, pi, opencode): what ends a turn
   and what does not, how errors and limits are reported, what each
   sandbox or permission setting lets an agent read and write, and which
   folders each loads skills and instructions from.

A fifth, on process, only if it holds up with no Agister in it: verify on
a clean copy with bounded repair (ADR-002, ADR-005), and deferred work as
gap, trigger and "done when" for observed gaps only. If it does not hold
up, leave it out and say why in your report.

## Edit

`prompts/code-review-architecture.md`: the sentence that ends "(ADR-001
rule 15, the client contract, which its decorators implement)" loses that
parenthesis. Bump its version and date.

## Wiring

- `.agister/prompts/go-testing-seams.md` and
  `.agister/prompts/go-architecture.md` are symlinks to
  `../../prompts/<same name>`, so there is one text. Only these two.
- `.agister/processes/implement.yaml`, `implement_codex.yaml`,
  `implement_pi.yaml` and `implement_pi_glm.yaml` each gain two optional
  inputs (ADR-019), after `brief`:
  `go_testing: {source: prompt, name: go-testing-seams, optional: true}`
  and
  `go_architecture: {source: prompt, name: go-architecture, optional: true}`.
  Add one sentence to each instruction that reads right with or without
  them: any guidance given as further inputs applies to the code it names.
- `agister/README.md`: where optional prompts are described, name this as
  the example in one sentence.

## Check

- `agister check --tree` from the repository root reports no new problem
  and shows both prompts as found for each implement process. If the
  `agister` on PATH refuses the settings, say so with its output; do not
  rebuild or install it.
- From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./...`.
- `grep -rniE 'agister|ADR-|LAB-' prompts/go-*.md prompts/agent-cli-behaviour.md`
  prints nothing.

List every file you changed.
