# A test directory that cannot be removed names what is left in it

## Observed

CI (self-hosted macOS runner, PR #851, run 36975987008) failed once:

```
--- FAIL: TestNextCallReapsAKilledRunsVerifyCommand (1.27s)
    testing.go:1617: TempDir RemoveAll cleanup: unlinkat /var/folders/.../T/TestNextCallReapsAKilledRunsVerifyCommand2541934352: directory not empty
```

Every assertion passed; only the removal of the test's temporary
directories failed. Something wrote into them after the test body
returned. The branch did not touch this test, and it passed 8 of 8 times
locally. `t.TempDir()`'s message does not say what was left, so the
cause cannot be told apart. The candidates:

- a process the run left behind (the reaped verify command or one it
  started) still writing: a real agister bug;
- git writing into a fixture repository after its command returned
  (background gc or maintenance);
- macOS Finder dropping a `.DS_Store`.

## Wanted

Only diagnosis now; no retry and no exception for any file.

- In `cmd/agister` tests, the temporary directories the tests create
  (`t.TempDir()` in the package's `_test.go` files, the `setup`,
  `repository` and other helpers included) come from one test helper
  that creates a directory the test owns and removes it at cleanup.
- When removal fails, the helper fails the test by name and lists what
  is left: up to 20 paths relative to the directory, each with its size
  and modification time, and how many more. Keep the macOS
  `/var -> /private/var` behaviour the tests rely on (`repository`
  resolves symlinks).
- Removal goes through a seam (a package variable or injected func) so a
  normal test can make it fail deterministically: inject a removal that
  leaves a known file behind and returns an error, and assert the test
  helper reports that file's path. Use a fake `testing.TB` or run the
  helper's report function directly; the test must not itself fail.
- Do not change product code. Do not add retries, sleeps or skips.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 ./... && go test -race -count=1 ./internal/app/...`.

List every file you changed.
