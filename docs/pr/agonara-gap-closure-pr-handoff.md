---
date: 2026-06-04
model: gpt-5
description: "PR handoff for the Agonara product gap closure branch."
---

# Agonara Gap Closure PR Handoff

## Branch

- Branch: `codex/agonara-gap-closure`
- Target checked: `origin/trunk` at `825834c35a95237c0515c16ad82194830338ab90`
- Baseline before this handoff commit: `cf42cec9 archive agonara gap plan`

## Suggested PR Narrative

Suggested title:

```text
close Agonara product gap plan
```

Suggested body:

```markdown
## Summary

- Close the Agonara product gap plan across Quick Check UI, topic/concept/material navigation, learner-state interpretation, topic/period readiness checks, Program Membership invitations and recovery, Curator coverage gaps, and LLM-assisted curation suggestions.
- Archive the governing Agonara plans under `agonara/docs/plans/implemented/` and update Product Intent, README, backlog, implementation notes, logs, and LOC dashboard traceability.
- Keep LLM-assisted curation in the deterministic-provider first slice: no real provider credentials, no Curator Workspace direct provider network calls, no Student/Admin suggestion UI, and no accepted-corpus auto-promotion.

## Verification

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- Targeted storage, backup/restore, Curator Workspace, HTTP, executable acceptance, and Playwright browser gates for the LLM-assisted curation suggestion slice.
- `./scripts/loc-dashboard.sh --sort=name`
- Markdown front-matter/archive checks and `git diff --check`

## Scope notes

- Accepted Program corpus remains behind explicit curator acceptance.
- Student Workspace state remains separate from shared Program corpus and Program Membership.
- Curator coverage gaps and LLM suggestions remain draft guidance until explicit curator action.
- Repo policy uses merge commits for PR merge; do not squash.
```

## Scope Risk

The branch diff against `origin/trunk` is broader than a narrow Agonara PR. It includes Agonara implementation and closeout work plus non-Agonara process, agent, dev-skills, oracle, and research changes already present on the branch.

Open the PR as-is only if that full branch scope is intentional. If the intent is an Agonara-only PR, split or rebase the branch before opening the PR so review, CI, and merge ownership stay scoped.

## Merge Policy

Use the repo merge policy from `AGENTS.md`:

- Create the PR only after an explicit push/open-PR instruction.
- Enable auto-merge separately after PR creation if requested.
- Use merge commit strategy with branch deletion: `gh pr merge <number> --merge --auto --delete-branch`.
- Do not squash.

## Readiness Evidence

- Governing parent plan is archived at `agonara/docs/plans/implemented/agonara-product-gap-closure.md`.
- LLM-assisted curation plan is archived at `agonara/docs/plans/implemented/llm-assisted-curation-suggestions.md`.
- LLM-assisted curation spec status is `implemented`.
- `docs/loc-dashboard.html` was refreshed after this handoff doc at `2026-06-04 13:35`; totals were unchanged from the closeout run.
