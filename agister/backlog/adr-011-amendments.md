---
date: 2026-10-15
model: claude-opus-5-5
description: "Backlog: the amendments ADR-011 needs before process, verify and workflow settings can be specified"
---

# ADR-011 amendments

ADR-011 is accepted and supersedes ADR-005 and ADR-007. Its consequences
name the amendments it needs: ADR-001, 002, 003, 004, 006 and 010. Until
they are written, `settings/documents` types no process, verify or
workflow.

## Plan

1. **List the conflicts.** For each of ADR-001, 002, 003, 004, 006 and
   010, the rules ADR-011 contradicts or leaves open. Reading only.
2. **Decide the open points.** Each with a proposed answer and its reason;
   a change to an ADR-001 rule is the owner's.
   - Whether `verify` stays a kind, as a named command execution.
   - Where a pinned revision and a clean worktree are asked for: the
     process, the command or the workflow.
   - Whether a process's `session` stays, or a binding continues a
     session (ADR-004).
   - Process inputs from bindings: workflow inputs, earlier results,
     repetition state; whether `workflow.collection` goes (ADR-010).
   - The kinds, and each operator's shape: sequence, parallel, branch,
     bounded repetition (ADR-002).
   - The first conditions (ADR-011, rule 4) and their settings syntax,
     which ADR-011 leaves out.
   - The core parts replacing `core/attempts` and the ADR-007 runner
     (ADR-001), and recovery across nested workflows (ADR-006).
3. **Write the amendments.** First decide the form: an amendments section
   in each ADR, or new ADRs superseding the rules changed. Design only
   (agister/AGENTS.md), one ADR per commit.
4. **Review** with the `adr_review` workflow, then merge.
5. **Update `docs/settings-implementation.md`**: kinds, steps, where each
   check sits.
6. **Specify process, verify and workflow** in `settings/documents`.
