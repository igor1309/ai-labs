---
date: 2026-10-22
author: Igor Malyarov
model: claude-opus-5-5
name: Audelin — Swift tests in the sandbox
version: 0.0.1
type: prompt
---

Applies to Audelin's Swift packages (`audelin/macos` and
`audelin/macos/PreviewApps`). Skip it for anything else.

Your sandbox runs Swift tests only this way, from the package's directory,
with the output in a file:

```
CLANG_MODULE_CACHE_PATH=/tmp/codex-swift/clang timeout 600 swift test --disable-sandbox --cache-path /tmp/codex-swift/cache --config-path /tmp/codex-swift/config --security-path /tmp/codex-swift/security > /tmp/<name>.log 2>&1; echo "exit $?"
```

The exit code is the one that command prints. Never take one through a
pipe: a pipe reports its last command's code, so a failed run reads as
passed. Read the failures from the log file.

The packages' dependencies are resolved before you start, and you have no
network: never resolve or update them.

Some tests cannot run in your sandbox; those that make speech with `say`
get an empty file and fail with error -50. Name each test you could not
run as unverified in your report, and never call its failure the
sandbox's: the same test can fail for a real reason. The test step after
you runs every test outside the sandbox, and its result decides.

Leave your changes uncommitted. The caller commits once the test step
passes.
