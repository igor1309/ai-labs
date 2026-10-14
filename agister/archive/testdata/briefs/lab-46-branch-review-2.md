# LAB-46 branch review round 2 fixes

Review rulings (code_review run 20261001T150304Z-6eb2fa). Make each fix as
its action says, with its tests.

## 1. Check Pi's continuation constraint before creating a workspace (major)

Action: Expose Pi's resume working-directory constraint through a core-owned capability or preflight contract, and check it before prepareWorkspace. Add a normal test using temporary session evidence and a checkout spy that asserts ClassRefused and zero checkout calls. Keep the coverage for a successful continuation in the same directory.

Why: The trace is concrete and complete. A resumable process declaring workspace.checkout continues a run that used checkout A. calls.go:705 prepares a new worktree B (git.go:293/298) before RunTurn. pi.go:246/254 then rejects the cwd mismatch, and pi.go:184 returns ClassRuntimeError. This contradicts README:34 ('is refused') and ADR-001 rule 7 (no workspace started before a refusal). The change introduced it.

## 2. Disable automatic package installation during Pi startup (major)

Action: Suppress startup package installation per process (for example PI_OFFLINE=1) while keeping instruction and skill loading. Add a test in a temporary project with an installation spy.

Why: The case is concrete: .pi/settings.json lists an npm package that is not installed, and ask_pi runs with host reads. It is traced through the Pi 0.85.1 sources. resource-loader.js:276 resolves packages before the noExtensions check at :316, and package-manager.js:998/1482–1484/1689 runs npm install into .pi/npm. An installation spy confirmed this path. The behaviour contradicts the package-isolation promise in README:59–61. The case shown justifies the new guard.

## 3. Treat the session directory as a literal path, not a glob pattern (major)

Action: Replace the glob in sessionCwd with os.ReadDir plus a .jsonl filename filter. Apply the same fix to fakepi/main.go:196. Add a continuation test under a temporary home whose path contains brackets.

Why: The case is concrete: --home /tmp/agister[1], then continue a run. The trace runs from the CLI (cli.go:964/978) through the session root (main.go:150) and the saved session (pi.go:269) to sessionCwd (pi.go:280). There, filepath.Glob reads [1] as a character class, so no session file is found. pi.go:248 then fails every continuation, against README:30. The change introduced it.

## 4. Bound the new CLI test calls to one minute or less (major)

Action: Add --timeout 30s to the ask_pi invocations at pi_settings_test.go:60, 116 and 130.

Why: The trace shows the three new ask_pi calls in pi_settings_test.go (lines 60, 116, 130) pass no --timeout. They therefore run under the read-only policy's 10m timeout: policy.go:94/114 → calls.go:744 → supervisor.go:146. That breaks the stated one-minute limit for tests. The change introduced these calls.

## 5. Test complete tool arguments beyond the 300-byte truncation boundary (minor)

Action: Add a tool argument longer than 300 bytes and assert the complete ToolCall.Input, following claudecode_test.go:271–290.

Why: The trace shows the only exact ToolCall.Input assertion (pi_test.go:598–600) and the fake's command (fakepi/main.go:135) are both shorter than the 300-byte preview truncation (pi.go:386). The test therefore cannot tell complete input (pi.go:385) from the preview. The difference matters: stale.go:114 compares ToolCall.Input. The sibling claudecode test already covers this with a 1,000-character argument.

## 6. Return the final assistant text instead of earlier commentary (minor)

Action: On success, set turn.Text from Final.Text. Add a reducer test with earlier commentary followed by an empty or whitespace-only final message.

Why: The case is a concrete event sequence: commentary with stopReason toolUse, then a tool call, then an empty assistant message with stopReason stop, then agent_end and exit 0. The trace shows LastText keeping the earlier commentary (pi.go:458–461), which becomes turn.Text (pi.go:495) and the completed call result (calls.go:790/798). This contradicts README:58, which says the output is the final assistant text.

Pi's docs and sources are in the installed package
(`$(npm root -g)/@earendil-works/pi-coding-agent/`). Do not call a real
provider. Tests use `t.TempDir()` and stay within one minute. Run the full
check from `agister/` (its AGENTS.md). Report each command with its exit
code and final line, and list every file you changed.
