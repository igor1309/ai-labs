# LAB-120: the intent reviewer, a fifth review node in code_review

## Intent

Multica LAB-120, which re-scopes LAB-105 after ADR-023 and ADR-026: a
change that is correct, tested and clean but implements the wrong reading
of its goal passes the other four reviews, which check the goal's claims
but do not set out its readings. The intent reviewer is descriptive, not
prescriptive (borrowed from the BMAD code review skill's intent-alignment
auditor): it lists the goal's defensible readings, names the one the
change implements, and reports where they diverge.

## Done when

1. **The prompt.** `prompts/code-review-intent.md`, in the shape of the
   other review prompts (front matter, the evidence rules every finding
   carries, the goal paragraph, a numbered definition of done, coverage
   reporting). Its definition of done, adapted from LAB-105 with "brief"
   read as "goal":
   1. The defensible readings of the goal are listed, each quoted from its
      words.
   2. The reading the change implements is named, with the trace that
      shows it.
   3. Each requirement of the goal is met by the change, or its absence is
      a finding.
   4. The surface the goal speaks of (a command, a record, a page) is the
      surface the change and its tests exercise; a change proven one layer
      below is a finding.
   5. Nothing in the change goes beyond every reading of the goal without
      a stated reason.

   The reviewer does not prescribe more work; a finding's `requirement`
   quotes the goal. A divergence between two defensible readings is
   reported as such, so the judge can rule it `owner`.
2. **The process.** `.agister/processes/intent_review_codex.yaml`, the same
   shape as `clarity_review_codex.yaml` (agent, policy, params, the `goal`
   param, `review-result` output), with `prompts/code-review-intent.md` as
   its `review_prompt`.
3. **The node.** `.agister/workflows/code_review.yaml` fans out to a fifth
   node, `intent`, using `process:intent_review_codex`, with the same
   `goal`. The judge stays blind: it gets no goal, as today.
4. `agister check` passes on this repository's settings, and the
   repository's tests that read its `.agister/` settings say the same.
5. The done gates say the same as the settings where they name
   `code_review`'s reviews: the caller skill
   (`agister/skills/agister/SKILL.md`), `agister/README.md`,
   `agister/docs/settings-architecture/` and `agister/pages/` with its
   tests. Say in the notes which needed no change and why.

## Out of scope

- Any change to the binary: this is settings and a prompt.
- The judge's prompt and its blindness (ADR-003 rule 4, ADR-023).
- Giving reviewers the step brief: they get the goal (ADR-026 rule 9).
- The home settings under `~/.agister`: updated after the deploy, as
  `agister/AGENTS.md` says.

## Sources

- Multica LAB-120 and LAB-105.
- ADR-023 rules 1 and 2; ADR-026 rule 9; ADR-003 rule 4.
- `research/agister/research/brief.md` §7, "How processes and reviewers
  get it".
- `prompts/code-review-clarity.md`, the shape to follow.

## Decisions

- 2026-10-07, owner: take LAB-120. This goal expressly directs the new
  prompt `prompts/code-review-intent.md`, the process and the node.

## Open

None.
