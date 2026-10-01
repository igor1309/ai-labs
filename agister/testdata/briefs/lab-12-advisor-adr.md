# LAB-12: propose the ADR for an advisor that decides open questions

Write `agister/docs/adr/007-an-advisor-decides-open-questions.md`, status
Proposed, for the owner to accept. ADR only: no code, settings or prompt
change in this run.

## Context to state (briefly)

The review judge (`.agister/processes/review_judge.yaml`,
`prompts/code-review-judge.md`) rules `owner` on a question only the owner
can settle, and each such item stops the work until the owner answers.
Many are build questions whose answer the project's recorded decisions
already imply (observed: "may this change also change the agent
instructions it depends on?", implied by ADR-004). Verger's experience
(`research/agister/research/verger/lessons/agent-orchestration.md` item 8,
`verger-orchestration-lessons-addendum-4.md` L133, L158, I8): an advisor
decides build questions and records each decision; the owner rules on
policy only. Read those and the existing ADRs before writing.

## The ADR decides

- Which questions an advisor may decide and which stay the owner's. A
  policy question stays the owner's: one that changes or contradicts an
  accepted ADR, the project's rules (`AGENTS.md`), scope, security
  boundaries, or cost. Say how the line is drawn and who draws it.
- What the advisor sees: the question, its options, and the project's
  recorded decisions (ADRs, earlier advisor decisions); nothing the asker
  adds beyond the question and options.
- How each decision is recorded: a superseding record (who asked, the
  options, what was excluded, the decision, follow-ups), where later runs
  can read it.
- How an advisor decision reaches the owner for review, and how the owner
  overrides it.
- How this fits Agister as it is: processes, workflows, the judge's
  rulings, ADR-001's rules. Name the smallest mechanism that does it, and
  what is left out.

Where the issue leaves a real choice, state the options and recommend one;
list those under "Open for the owner".

## Form

Follow the shape and length of ADR-004 to ADR-006: decisions, not a
history of how we got here. Plain statements; no war story.

Report the files you changed. Tests are untouched, so run only
`agister check` equivalents if the repository has a docs check.
