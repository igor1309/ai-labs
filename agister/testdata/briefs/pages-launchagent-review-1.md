# agister pages LaunchAgent: branch review round 1 fixes

Review rulings (code_review run 20261002T064806Z-42368b). Make each fix as
its action says, with its tests.

## 1. A failed reinstall destroys the previous plist and leaves a partial installation (major)

Action: Set up the log directory before publishing the plist. When bootstrap fails, restore the previous plist, or remove the new one if there was no previous plist. Add t.TempDir() tests for a log-setup failure and a bootstrap failure that assert the earlier plist is still there.

Why: The reviewer gives a concrete sequence and traces it line by line. There is an existing unloaded plist and ~/Library/Logs/agister is a regular file. The new plist replaces the old one at install.sh:47, mkdir fails at :49, and set -e exits at :15 without restoring anything. The trace also shows that the bootstrap failure branch at :52 leaves the new plist in place. The change introduced this ordering.

## 2. The bootstrap and bootout failure guards have no tests (major)

Action: Let the launchctl shim be set to return nonzero for bootstrap and for bootout. Add tests asserting exit 1, the refusal diagnostic, no success message, and that the plist survives a failed bootout.

Why: The trace shows the guards (uninstall.sh:17 exits before the plist is removed at :19; install.sh:52 handles bootstrap failure). It also shows that the shim only ever succeeds (deploy_test.go:29-32) and that the existing tests cover success paths only (:184, :227, :256). No normal test can fail if either guard breaks. The fix is to make the existing shim seam able to fail.

## 3. The launchctl shim joins arguments with "$*", so a split plist path goes unnoticed (major)

Action: Record each argument separately with a count, or make the shim check that bootstrap gets exactly the expected number of arguments and the exact plist path as one argument.

Why: Concrete input: the fixture's `home & <x>` HOME. The reviewer checked with a shell command that quoted and unquoted expansion log the same string while passing 3 versus 5 arguments. The trace shows the joined log (:26), a bootstrap branch that checks no arguments (:29), and a comparison against the joined string only (:140). So the space-containing HOME fixture cannot catch the quoting bug it was written for.

## 4. No test covers the chmod 0700 on an existing log directory (minor)

Action: Add a t.TempDir() test that creates ~/Library/Logs/agister with mode 0755 before installing and asserts its mode is 0700 afterwards.

Why: The trace shows that install.sh:50 sets 0700 on a directory that already exists. The only permission test (deploy_test.go:175-180) runs on a fresh HOME, where mkdir at :49 already creates the directory as 0700, so that guard has no test that can fail. The concrete case is an existing directory with mode 0755.

## 5. The second substitution rewrites @PATH@ inside the inserted HOME value (minor)

Action: Replace the tokens in one pass over the original template so inserted values are never scanned again. Add a t.TempDir() test whose HOME contains a literal @PATH@.

Why: Concrete input with a reproduced result: with HOME=/Users/@PATH@, the extracted renderer produced ProgramArguments[0]=/Users//usr/bin:/bin/.local/bin/agister, and the plist still passed plutil lint. The trace runs from install.sh:41-42 (the two substitutions run one after the other) to the template lines that render wrong. That breaks the brief's requirement to render paths from HOME faithfully. The input is unusual, but the reproduced output proves the defect.

Tests use `t.TempDir()` and the launchctl shim; never the real
`~/Library/LaunchAgents` or launchctl. Run the full check from `agister/`
(its AGENTS.md). Report each command with its exit code and final line,
and list every file you changed.
