# LAB-30: one Go toolchain for CI and local, and a redirect test that holds on both

CI for PR #847 failed: `TestRunEndpoints` (`agister/pages/runs_test.go:403`)
expects `/api/runs/..` to answer 307. CI ran Go 1.24.13 (from
`agister/go.mod`'s `go 1.24`, read by `setup-go` with `go-version-file`),
whose router redirects with 301; local Go 1.27.1 answers 307.

1. Add `toolchain go1.27.1` to `agister/go.mod` so CI and local builds use
   the same Go. Keep the `go` directive as it is. Run `go mod tidy` only if
   the toolchain line needs it.
2. Make the test assert the bare `..` is redirected, any 3xx, and not
   served, instead of one exact code. Keep its comment accurate.

Run the full check from `agister/` (its AGENTS.md) and
`node --test pages/tests/*.test.js`. Report each command with its exit
code and final line, and list every file you changed.
