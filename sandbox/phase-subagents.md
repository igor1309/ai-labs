---
date: 2026-02-08
model: opus-4.6
prompt: >
  There is a phase doc creation requirements. What if Claude Code is instructed to run each step implementation with subagent? I’m not talking concurrent, only sequential for now. Would that bring any benefit? Explain
---

Good question. Now that I understand the codebase and the phase doc protocol, here's the analysis.

## Current Model

Each phase implementation plan has N steps (e.g., Phase 6 had 6). Today these steps execute within a **single long-running agent context**. The agent carries every file read, every edit deliberation, every test output, and every self-review from step 1 through step N. By step 5-6, the context window is saturated with stale artifacts from earlier steps.

## What Sequential Subagent Execution Would Change

The parent agent would:
1. Read the phase doc + implementation plan
2. For each step, spawn a `Task` subagent with a focused prompt: "Execute step N of this plan. Here are the spec, implementation plan, and closeout format."
3. Collect the subagent's result (commit hash, test outcomes, summary)
4. Update `phase-#-implemented.md` with the closeout ledger entry
5. Move to step N+1

Each subagent gets a **fresh context window** dedicated entirely to one step.

## Real Benefits

**Context budget reclamation.** This is the dominant benefit. A step-3 subagent doesn't carry step-1's 50 file reads, 30 edits, and 200 lines of test output. It starts clean, reads only the files relevant to its step, and uses its full context window for the task at hand. For a 6-step phase, you go from 1 context window shared across all work to 6 independent windows, each fully available.

**Reduced drift.** In long sessions, agents accumulate stale mental models. By step 5, the agent "remembers" step-1's code as it was before steps 2-4 modified it. A fresh subagent has no stale memories — it reads the current state of the codebase as-is.

**Natural alignment with the existing protocol.** Your `AGENTS.md` already mandates "stop and wait for review approval before next step." The subagent boundary maps 1:1 to this gate. The parent becomes the orchestrator that enforces the review gate between subagent spawns.

**Failure isolation.** If a subagent goes off-track on step 4 (wrong approach, confused by a test failure), that confusion dies with the subagent. The parent can re-spawn a new attempt for step 4 with adjusted instructions, without the failed attempt's reasoning polluting the context.

## Real Costs

**Lost inter-step awareness.** During step 3, the agent may have discovered something that influences how step 4 should be approached ("I noticed the config schema doesn't support arrays, so step 4 should handle that"). In a single session, this knowledge carries forward implicitly. With subagents, it's lost unless the parent explicitly captures and forwards it.

**Re-reading overhead.** Each subagent must independently discover the codebase structure. Step 4's subagent re-reads files that step 3's subagent already read. This costs tokens but is partly offset by reading the *current* state rather than relying on stale context.

**Prompt engineering surface area.** The parent must craft a prompt for each step that includes enough context (the spec, the implementation plan, relevant conventions from `AGENTS.md`, the closeout format) without being so verbose that it eats the context budget you just reclaimed.

**No parallelism gain.** Sequential is sequential. You pay the overhead of subagent spawning without any wall-clock speedup. (You mentioned this is intentional for now.)

## Net Assessment

For your specific setup — 4-6 step phases, each step touching multiple packages across a monorepo, with a mandatory review gate between steps — **sequential subagents would be a net positive**. The context reclamation alone is worth it. Your phases are structured enough (spec + implementation plan + closeout template) that each subagent can be given a self-contained brief without much prompt engineering effort.

The key risk (lost inter-step knowledge) is mitigable: the parent reads each subagent's closeout summary and can append a "notes for subsequent steps" section to the next subagent's prompt.

The architecture would look like:

```
Parent agent (orchestrator)
  ├── reads phase-#.md, phase-#-spec.md, phase-#-implementation.md
  ├── for each step:
  │     ├── spawns Task subagent with step brief + spec + conventions
  │     ├── subagent: reads code, implements, tests, self-reviews, commits
  │     ├── subagent returns: summary, commit hash, test results, notes
  │     ├── parent updates phase-#-implemented.md
  │     └── parent waits for review approval (existing gate)
  └── finalizes phase closeout
```

Would you like me to draft an implementation for this orchestration pattern?