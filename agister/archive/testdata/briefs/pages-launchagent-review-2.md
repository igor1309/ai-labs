# agister pages LaunchAgent: branch review round 2 fixes

Review rulings (code_review run 20261002T070006Z-c67769). Make each fix as
its action says. All are tests in `agister/deploy/deploy_test.go`; change
the scripts only if a new test shows a defect.

## 1. Uninstall never tests an existing plist whose job is not loaded (major)

Action: Add a t.TempDir() test that seeds an installed plist with no loaded marker. Run uninstall and assert three things: it succeeds, launchctl gets only the print call, and the plist is removed.

Why: The trace cites brief line 27: the plist must be removed whether or not the job is loaded. uninstall.sh:16/19 shows bootout depends on the loaded state but plist removal does not. The tests cover only two cases: loaded with a plist (deploy_test.go:388) and no job with no plist (deploy_test.go:428). So a regression that moved removal inside the loaded branch would pass every test. That is a concrete untested path for a requirement in this change.

## 2. No test covers backup cleanup after a successful install over an existing plist (minor)

Action: Add a successful install over a seeded plist whose job is not loaded. Assert that the installed plist is the newly rendered one, and that no backup or temporary files remain.

Why: install.sh:59-60 creates a backup when a plist already exists, and :73 removes it after a successful bootstrap. This change added that path. The two existing-plist fixtures (deploy_test.go:301, :319) both force failure, and the successful-install test (:207) starts with no plist. So no test would catch it if the cleanup were removed.

## 3. Uninstall preservation check seeds only the stdout log and checks only that files exist (minor)

Action: Seed both the stdout and stderr logs and take a snapshot of the binary. After uninstall, compare their bytes to the originals and check that the binary is still executable.

Why: Brief line 28 says uninstall must leave the logs and the binary in place. deploy_test.go:392 seeds only pages.out.log, and :407-408 checks with os.Stat only. So if uninstall deleted the stderr log, or changed the binary, the test would still pass. The requirement is part of this change, and the test cannot show it holds.

## 4. No test checks that the installed plist has mode 0644 (minor)

Action: In the existing successful-install test, add an os.Stat assertion that the installed plist's permissions are 0644.

Why: install.sh:8 documents mode 0644. Line 34 renders the plist into a mktemp file, and line 63 sets 0644 before publishing it. The suite checks permissions only on the log directory (deploy_test.go:269). If the chmod were removed, the plist would keep mktemp's restrictive mode and no test would fail.

Tests use `t.TempDir()` and the launchctl shim; never the real
`~/Library/LaunchAgents` or launchctl. Run the full check from `agister/`
(its AGENTS.md). Report each command with its exit code and final line,
and list every file you changed.
