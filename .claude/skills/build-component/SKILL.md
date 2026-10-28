---
name: build-component
description: Take a mizan-ble component (core, adapter, UI module or preview app) from its LAB issue to trunk - brief, Codex implement through agister, review, fix rounds, PR and Multica. Use when starting or continuing a component build, writing a Codex brief, reading an agister implement or code_review result, answering a fix ruling, or merging stacked component branches. Triggers on "build LAB-", "brief for Codex", "agister implement", "code_review", "fix ruling", "stacked PRs", "next component".
---

# Build a component

The rules are in `mizan-ble/AGENTS.md`: "Running the work", "Building
cores and adapters", "UI modules". This skill is the procedure that follows
them. Keep each issue's briefs and logs in thread storage, in `lab-<n>/`.

## Steps

1. **Issue.** `multica ... issue get LAB-<n>`, then
   `issue status LAB-<n> in_progress`. Add a worktree on a new branch
   `lab-<n>-<name>` off `origin/trunk`, or off the unmerged branch it needs.
2. **Brief.** Write `goal.md` from `templates/goal.md` and `step.md` from
   `templates/step.md`. The goal fixes the API: it is a technical choice
   and yours. Read the interface of every module the root will connect
   it to (an adapter often answers several) and pick a shape each can be
   translated to in a line or two.
   - An adapter's QA rows drive the real binding; its own logic (a
     deadline, a translation) is tested as well through a fake of the
     binding, passed to an internal init. A test on a real clock or radio
     asserts lower bounds and a stream's end, never how late something
     may be, with steps long enough that a stall on a loaded runner does
     not skip one.
   - A UI module's "Done when" is its state shape, events, view,
     previews, package target, README and log line; its sources name the
     frames by node id with their dark and light PNGs and the frames' copy
     as a text file to use exactly; its "Out of scope" names the preview
     app and the machines.

   Read the brief once for contradictions between "Done when" and "Out of
   scope" before the run; Codex resolves one silently, its own way.
3. **Implement**, in the background (3 to 12 min, about $0.30–0.40 for an
   adapter):

   ```sh
   agister run --process implement --agent codex-sol-61 \
       --param brief=<lab-n>/step.md --dir <worktree> < /dev/null > <lab-n>/implement.log 2>&1
   ```

4. **Read the result** with `scripts/agister-result.py <log>`. Agister exits
   0 when a run fails, so the status line comes first:
   - `rate_limited`: send the Codex quota push (root `AGENTS.md`). A fix of
     a line and a test you make by hand, red then green; anything bigger
     waits for the reset time the reason gives.
   - `completed`: each test has a failing check before its passing one.
     Missing red lines are a claim, not evidence; ask for them in the
     next step.
5. **Look at the diff** for what the kind's rules forbid: for a UI module,
   raw sizes, fonts, colours or stroke widths; a `DesignSystem` view
   rebuilt inside the module; frame copy bent to force a line break. Fix
   by hand what needs no rerun. Your look does not replace the review,
   which reads the platform's behaviour more closely than a diff shows.
6. **Commit**, then `git merge origin/trunk` before every review, not
   only the first. Do not pipe the merge's output away: a conflict leaves
   it half done. `git merge-base --is-ancestor origin/trunk HEAD` must
   pass before the review starts. A review of a branch behind trunk
   spends its words on other issues' changes showing as reverted.
7. **Review** cores and adapters (UI modules and preview apps get none),
   in the background (4 to 8 min, $1.50–3.50; it grows with the tests):

   ```sh
   agister run code_review --param goal=<lab-n>/goal.md \
       --param base=origin/trunk --dir <worktree> < /dev/null > <lab-n>/review.log 2>&1
   ```

   The candidate is the `--dir` checkout's HEAD; it refuses any other
   commit. To review a commit you are not on, add a detached worktree at
   it. A machine's goal names its spec, whose `## Decided` fixes the order
   of events and effects.

   Read the judgement with `agister-result.py`. Each item is `fix` or
   `reject`; minor findings are rejected by rule. For a `fix`, write
   `step<k>.md` from `templates/fix-step.md`, quoting the item under
   "Acts on", run implement again, commit, and review again until the
   judge has no fix. A fix that only pins behaviour already there (a
   default value) cannot be shown red without changing the code; make it
   by hand, green only. Take a rejected minor point by hand when it is
   cheap and real, such as a comment that says why.

   Read every rejected major. The judge rejects a real finding when its
   fix contradicts the goal; the goal is yours, so correct it in the fix
   step under "Decided by the caller".

   **Codex limited:** `code_review` pins its reviewers to Codex.
   `scripts/review-fallback.sh <goal.md> <worktree> <lab-n>` runs the five
   one at a time on `claude-opus` (about 6 min, $2); there is no judge, so
   rule on the findings yourself by the same severity rule.
8. **PR** through the `pr-merge` command; its PR body ends with
   `Closes LAB-<n>`. A stack of branches follows "Stacked branches" below.
9. **Close:** `issue status LAB-<n> done` once the PR has merged and
   cleanup has passed.

## Stacked branches

Sibling branches all touch `ios/Package.swift`,
`ios/PreviewApps/Package.swift`, the READMEs' rows and `docs/log.md`.

- Resolve the log with `scripts/union-log.py mizan-ble/docs/log.md`, then
  keep one header per date. Write a manifest or a README row fresh from
  what the branch has; a union of two manifests does not compile.
- After every merge, check that the branch has both trunk and the branch
  beneath it: `git merge-base --is-ancestor <ref> HEAD`. A merge whose
  resolution changes no file still needs `git commit --no-edit`; without
  one, the next merge reuses the stale `MERGE_HEAD`.
- A PR that conflicts with trunk gets no CI run, and the watch only says
  no run exists. Merge trunk in and push again.
- Auto-merge the bottom PR only. When it merges, merge trunk into the next
  branch, push, and turn on its auto-merge.

## Definition of done

- The PR merged with a merge commit after green CI, and says
  `Closes LAB-<n>`.
- A core's or adapter's last `code_review` has no `fix` item, or its
  fallback reviews have no finding you rule major.
- The issue is `done` in Multica; the worktree and branch are removed.
