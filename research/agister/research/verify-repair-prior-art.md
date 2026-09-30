# Verify and repair: prior art

How agent orchestrators model "implement, verify deterministically, feed the
failure back, repair". Collected on 2026-09-30 for
[ADR-002](../../../agister/docs/adr/002-verify-and-bounded-repair.md) and
Multica LAB-7.

The question: is verification with repair (a) a check attached to the
implementation step that loops back into the same agent session, (b) a
separate graph node or retry node, or (c) something else, such as a stop hook
inside the agent runtime?

## Public systems

Checked against docs or source unless marked otherwise.

| System | Shape | Where the failure goes | Bound | At the bound |
|---|---|---|---|---|
| Aider `--auto-test --test-cmd` | (a) check after each edit | same chat, as the next user message | `max_reflections = 3`, hard-coded, shared by edit-format, lint and test failures | stops quietly, not a failure |
| Claude Code Stop / SubagentStop hook | (c) runtime stop gate | same session (`decision: block`, `reason`) | overridden after 8 blocks in a row without progress (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`) | the agent stops |
| Claude Code `/goal` | (c) prompt-based stop hook judged by a small model | same session | none fixed; the docs suggest writing "or stop after 20 turns" into the goal | stops after several turns with no tool use |
| Ralph Wiggum plugin | (c) stop hook re-feeds the prompt | same session | `--max-iterations`, unlimited by default | context overflow after roughly 20–30 iterations |
| OpenHands SDK iterative refinement | an LLM critic scores the result; a refactoring phase runs again below a threshold | new `Conversation` per iteration in the guide's example | `MAX_ITERATIONS`, 5 in the example | loop ends |
| CrewAI task guardrail | (a) | same agent | `guardrail_max_retries`, default 3 | raises (`task.py`: "Task failed … validation after N retries") |
| Pydantic-AI `ModelRetry` | (a) output validator | same run | output retries, default 1 | raises (not fully verified) |
| Instructor | (a) validation re-ask | same messages list (checked in source) | `max_retries` | raises `InstructorRetryException` |
| LangGraph | (b) conditional edge back to a node | depends on the state design | recursion limit (default 1000 since 1.0.6, 25 before) | `GraphRecursionError` |
| OpenAI Agents SDK output guardrail | gate only | none | no retry | tripwire exception |
| DSPy `Refine` | feedback as hints for the next attempt | next attempt | `N` | |
| SWE-agent `RetryAgent` | fresh attempts, best one picked | fresh (not verified) | not verified | |
| Agentless | no loop: many sampled patches, tests pick one | none | sample count | |
| Temporal activity retry | same input again, no feedback | none | `maximumAttempts` | (general knowledge, not fetched) |

Not verified: Devin, Sweep, AutoCodeRover, Factory, Amp, Cursor background
agents, GitHub Copilot coding agent (follow-ups by `@copilot` mention; whether
it resumes the session is not documented).

Session resume, which same-session repair depends on: `codex exec resume
<SESSION_ID>` keeps the original model and settings; `claude -p --resume
<id>`. See the [runtime research](codex-claude-orchestrator-runtime-research.md).

## Hackathon corpus

From the Podlodka AI Club hackathon #1 mining reports and syntheses (15
orchestrator repos, May 2026):

- **blast-furnace** ran `QUALITY_GATE_TEST_COMMAND` as a Codex Stop hook,
  feeding failures to the same session, at most 2 blocks. The hook config is
  written into the agent's own workspace (`.codex/hooks.json`). If it cannot
  run, a gate after the session runs instead and the correction chance is lost.
- **the-furnace** separates an in-session correction budget
  (`CORRECTION_BUDGET = 3`, specific nudges) from `PHASE_MAX_ATTEMPTS = 3`,
  each in a fresh container: confusion the model can fix goes to the same
  session; a model that is off-track gets fresh context.
- **X15 (Archon)** keeps `runAttempts` (environment and runtime failures)
  apart from `fixAttempts` (code-quality remediation). The synthesis rates
  "separate retry budgets per failure mode" as durable.
- **the-foundry** runs IMPLEMENT → VERIFY (checks, then an LLM reviewer) up to
  `MAX_IMPLEMENT_ATTEMPTS = 2`. Each retry gets the plan and the previous
  verification report after `git reset --hard`: fresh attempts, not repair.
- **the-smelters** caps fix loops (`MAX_FIX_ITERATIONS = 4`) and records the
  abort as an event.
- The strategic synthesis: persist sessions for continuity; use fresh context
  for phase separation and contamination control.

## Verger lessons

From [the lessons](verger/lessons/):

- **L5, #13 "a fresh builder for every step":** resumed builders grew to 298k
  and 520k tokens. This was reuse across steps, not a short repair inside one.
- **L120:** a FAIL is final for its SHA; a fix is a new commit; scripts refuse
  to run again on a failed SHA.
- **L121:** never retry a test or a gate.
- **#9:** a failure in a test the change did not touch is its own flake row,
  not the builder's problem.
- [The orchestrator design](verger/orchestrator.md): retry is process
  execution policy, not workflow repetition; product failures return through
  a bounded correction route.

## Writing

- Anthropic, [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents):
  evaluator-optimizer loop; agents need ground truth from the environment such
  as code execution; include stopping conditions such as a maximum number of
  iterations.
- Birgitta Böckeler, [Harness engineering](https://martinfowler.com/articles/harness-engineering.html):
  computational sensors (tests, linters) are cheap enough to run on every
  change; signals work best when written for the model; trusting AI-written
  tests is not good enough yet.
- OpenAI, Harness engineering: Codex loops until its reviewers are satisfied;
  custom lints carry fix instructions (search snippets only; the page
  returned 403).
- [ImpossibleBench](https://arxiv.org/abs/2510.20270): frontier models cheat
  on impossible tasks often; Claude models mostly by editing tests.

## Synthesis

- **Dominant pattern:** a check after the turn, its bounded output sent back
  into the same session, with a small hard cap (1–3; Claude Code 8). Aider is
  the closest to a deterministic test command; CrewAI, Instructor and
  Pydantic-AI validate output rather than run tests. Graph-cycle repair is mostly found in general frameworks.
- **Converging combination:** same-session repair up to N, then fail for good;
  a fresh-context attempt, if any, is an outer step's job.
- **At the cap:** systems differ. Aider stops quietly; CrewAI, Instructor and
  LangGraph raise. Failing the node at the cap is established practice, not
  new. (An earlier draft of this note called it novel; review round 1
  corrected that, and the OpenHands row.)
- **Failure modes to design for:** test tampering; unbounded loops (Claude
  Code issue #55754); retrying the same failure; flaky tests; hung checks;
  output bloating the context; a gate firing while background work runs.

## Sources

- https://aider.chat/docs/usage/lint-test.html
- https://github.com/Aider-AI/aider/blob/main/aider/coders/base_coder.py
- https://github.com/Aider-AI/aider/issues/3865
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/hooks-guide
- https://code.claude.com/docs/en/goal
- https://github.com/anthropics/claude-code/issues/55754
- https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md
- https://github.com/anthropics/claude-code/issues/16440
- https://developers.openai.com/codex/noninteractive
- https://docs.openhands.dev/sdk/guides/iterative-refinement
- https://docs.crewai.com/en/concepts/tasks
- https://github.com/crewAIInc/crewAI/blob/main/lib/crewai/src/crewai/task.py
- https://pydantic.dev/docs/ai/core-concepts/output/
- https://github.com/567-labs/instructor
- https://docs.langchain.com/oss/python/langgraph/graph-api
- https://openai.github.io/openai-agents-python/guardrails/
- https://dspy.ai/current/tutorials/output_refinement/best-of-n-and-refine/
- https://swe-agent.com/latest/reference/agent_config/
- https://arxiv.org/abs/2407.01489
- https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent
