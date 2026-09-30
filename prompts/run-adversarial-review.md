---
date: 2026-09-30
author: Igor Malyarov
title: Run adversarial review
version: 0.1.0
---

Run an adversarial review of the change, act on the rulings, commit.

1. Commit the candidate. If the repository has a review workflow (for
   example `agister run code_review --param base=<rev> --param
   candidate=<rev>`), run it and go to step 4.
2. Otherwise run an independent reviewer: a fresh, read-only session, on a
   different model when there is one (the repository's AGENTS.md names it).
   Give it only the base and candidate revisions and the repository's
   review prompt. Never give it your conclusions, suspected defects, scope
   limits or the answer you expect.
3. Ask for material findings only, each with a concrete case, a path:line
   trace, and whether the change introduced it, plus one line on what it
   read. A finding without that evidence is rejected.
4. Rule on every finding before editing anything:
   - **fix**: it belongs to the change;
   - **defer**: a real, observed gap outside the change; record it in the
     project's deferred work;
   - **owner**: a trade-off or a question only the owner can settle; ask;
   - **reject**: speculative ("could", "might"), taste, or no evidence.
   If a judge ruled, act on its rulings as written; don't judge them again.
5. Fix in a fresh session, briefed with the fix rulings. Prove each fix with
   a normal, deterministic test; no mutation or revert checks. Never edit an
   ADR, a prompt or AGENTS.md to make a finding go away.
6. Run the repository's checks, commit with explicit paths, and review
   again. At most 2 rounds; then report what is left.
7. If the reviewer cannot run, stop and say so. Do not substitute your own
   review.
