# LAB-30 branch review round 2 fixes

Review rulings (code_review run 20261001T110759Z-095212, base 2fbd5876).
Make each fix as its action says, with its tests. The owner item about
ADR-001 rule 15 is not part of this brief: keep how pages reads runs.

## 1. Page tests do not assert the rendered comparison, run and detail data (major)

Action: Fill the page-test fixtures with summaries that carry this data. Assert the comparison cells, run cells, detail facts, judge counts and the folded record in the DOM tests.

Why: The trace shows README:44 and :56 promise comparison metrics, policy, outcome, skills, judge counts and the stored record. The page fixtures (page.test.js:38, :63) leave this data out, and the assertions (:101, :102, :158, :173) check only identities and one string. The rendering code at page.js:448, :519 and :578 is never asserted. This is a concrete gap the change left.

## 2. Process and status filters are untested through the page controls (major)

Action: Add a DOM test with several processes and statuses. Dispatch changes on both selects, assert the exact visible run IDs, and check that clearing the filters restores the list.

Why: Filtering is tested only through direct U.filterRuns calls (runs.test.js:130). The select listeners at page.js:462 and the filter wiring at :505 are never exercised: page.test.js:87–221 dispatches no select change. README:54 promises this behaviour.

## 3. Grouping fixtures never isolate the adapter dimension (major)

Action: Add a run that differs from an existing one only in adapter. Assert that it forms its own group with its own totals.

Why: The fixtures at runs_test.go:371–383 show every codex run also differs from every claude-code run in model or effort. So the expected groups at :396 would be the same if adapter were dropped from the key at runs.go:519. The brief (lab-30-runs-api.md:69) requires adapter as a grouping dimension.

## 4. Mean verify attempts is proven with one sample (minor)

Action: Add a second verified run with a different attempt count. Assert the fractional mean, and keep one run without verify in the group.

Why: Only o-1 has verification (runs_test.go:377–379), so the expected mean of 2 at :398 is also the sum and the only value. The division at runs.go:566 is untested, though the brief (:72) requires a mean over the runs with verify.

## 5. Default (200) and maximum (1000) list limits have no boundary test (minor)

Action: Add temp-directory fixtures past both boundaries. Send one request with no limit and one with a limit above 1000, and assert the exact newest IDs and the total.

Why: The brief (:34) specifies both limits, and serve.go:106 and runs.go:158 implement them. Yet the list fixtures hold at most three records, and no test references MaxRunLimit (runs_test.go:92, :173, :270, :284, :318, :322). Changing either value would leave every test passing.

## 6. A late Settings response overwrites the Runs status (minor)

Action: Make Settings status updates check the active view, as loadRuns does. Add controlled-promise tests for both orderings.

Why: The reviewer reproduced both orderings with the candidate's fake DOM. A delayed Settings success clears a Runs failure (page.js:79, :84), and a delayed Settings failure shows its error over Runs (:76). The cause: switching views (:635) does not invalidate renderToken. loadRuns (:417) already checks the active view, and the Runs view is new in this change.

## 7. A finished ownership observation can fall back to running (minor)

Action: When the observer reports finished but the record is unfinished, re-read the record. Extend the existing temp-directory test to cover this ordering.

Why: The reviewer traced a concrete interleaving. Store.Get reads the record while unfinished (fsruns.go:248). The owner then writes the finished record and releases its lock (:226–227). The store's status check re-reads it and returns StateFinished (:332–335), but Get returns its earlier unfinished record (:258). observe in pages rejects StateFinished because Result is nil (runs.go:232) and reports running (:240). ReadRun's own re-read is skipped (:193). The existing test (runs_test.go:209) does not cover this ordering.

Use `t.TempDir()` for Go fixtures and node:test for the page; no new
dependencies. Run the full check from `agister/` (its AGENTS.md) and
`node --test pages/tests/*.test.js`. Report each command with its exit
code and final line, and list every file you changed.
