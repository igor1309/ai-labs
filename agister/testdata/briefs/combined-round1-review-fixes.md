# Round 1 review fix: a test for the new Agister CI triggers

One ruling from the review of this branch; confirm it before fixing.

- **No regression test for the new Agister CI triggers.** The `agister`
  filter in `.github/workflows/ci.yml` now includes `.agister/**` and
  `prompts/code-review-*.md` (LAB-22), and nothing tests it. Extend
  `scripts/tests/ci-workflow-paths.test.js` to prove that a change to only
  `.agister/processes/tests_review_codex.yaml` matches the `agister`
  filter, and so does a change to only `prompts/code-review-tests.md`;
  also that the `agister` filter output selects the `agister-core` job.

Test what paths-filter would match, not just the text of the patterns,
using what the repository already has; add no dependency.

Run it with `node --test scripts/tests/ci-workflow-paths.test.js`, and use
the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
