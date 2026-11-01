# LAB-114 step 3 review fixes

Fixes from the code review of LAB-114 step 3 (commit a1a052d5, the done
gates of ADR-025; its brief is `agister/testdata/briefs/lab-114-step-3-done-gates.md`).
Docs, the Pages view and their tests only; no change to the binary's behaviour.

## 1. Caller-instruction guard checks only code snippets; prose, front matter and AGENTS.md go unguarded

The evidence holds. The concrete break is restoring SKILL.md:3's old patch-applying description or AGENTS.md:8-14's apply-changes.patch bullet. The trace shows every assertion stays green: caller_skill_test.go:38 checks only that the description is nonempty, :61 inspects only codeOf(text), and :193 drops prose without backticks. The AGENTS.md contracts at repo_settings_test.go:982 and :1140 check other content. The requirement is the goal's Done-when ban on text telling a caller to apply a patch, together with What changes item 5. This is a missing-test finding with a specific goal behaviour left unguarded, so it qualifies even though the current text is correct. Major is supported because the unguarded text is the central compatibility statement of this migration and the definition of done requires a test that fails on revert.

Do: Add ordinary document-contract tests for the ADR-025 caller guidance, covering the SKILL.md description and prose and the AGENTS.md implementation bullet. Assert that no text tells a caller to apply a run's patch, using the existing document-reading and phrase-checking precedents in the same test file.

## 2. Pages parses YAML True/TRUE as strings and hides the clean requirement

Both reviewers give the same concrete input (workspace.clean: True or TRUE) and the same independently traced chain. yaml.v3 v3.0.1 resolves these spellings to boolean true. definition/yaml.go and documents.go:218 set Process.Clean. pages/config.js:35-42 recognizes only lowercase true, :306 compares strictly and yields false, and page.js:301 omits clean. The new clean field is part of this change, so the scope is change. It breaks the goal's requirement that Pages says the same as the binary. Minor is supported: the view is wrong but the binary still enforces the requirement.

Do: Extend scalar boolean parsing in pages/config.js to accept the boolean spellings Agister's YAML parser accepts (true/True/TRUE, false/False/FALSE), keep quoted strings as strings, and add regression cases to pages/tests/config.test.js.

## 3. No Pages test covers clean: true without a pinned revision

The evidence holds as a missing-test finding. The concrete break is changing page.js:301 to `if (p.clean && p.revision)`. The trace shows the only clean: true fixture (page.test.js:410) also sets revision, and the assertions at :423 and :426 and the model tests at config.test.js:286 all still pass. The trace also shows clean-only is a supported binary case (documents.go:207/218, hold.go:520), and goal item 4 requires Pages to show clean. Minor matches the stated rationale: only an assertion is missing.

Do: Add a page.test.js fixture with workspace.clean: true and no revision, and assert that its card shows a worktree requirement of exactly 'clean'.

## 4. Caller docs promise an agent commit fails the call, but detection needs a pinned revision

The evidence holds. The concrete case is a writable process with workspace.clean: true, no revision and no verify, whose agent commits and returns valid output. The trace shows calls.go:868 installs the end-of-call collector only when the revision is nonempty, and :879 emits WORKTREE_COMMITTED only inside that collector. The call then completes without a fault (:999-1009, :736). SKILL.md:227 and README.md:284, both written in this change, promise failure without qualification. That breaks the requirement that the surfaces say the same as the binary, and the fix is wording only, so it stays inside the no-binary-change constraint. Minor is supported because verified implementer processes pin a revision.

Do: Qualify the commit-detection statement at agister/skills/agister/SKILL.md:227 and the matching statement at agister/README.md:284 to say detection applies when the process pins a revision. Do not change binary behaviour.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./... && go test -race -count=1 -timeout 1m ./internal/app/...`,
and the Pages JS tests as `agister/pages/README.md` says. Regular committed tests only.
