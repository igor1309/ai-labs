## Fresh-build measurements, 2026-11-08

The question is how much compilation a fresh build performs, independently of
cache reuse. No optimization has been selected yet.

### Existing CI evidence

[Run 42517092051](https://github.com/igor1309/ai-labs/actions/runs/42517092051)
spent 205 s building core tests, 130 s building app tests, 16 s building preview
tests and 198 s bundling the release app: 549 s total. Test execution took 58 s.
These are GitHub step wall times. The log contains no per-module compiler timers.
Counting `Compiling` lines cannot supply those timers.

The app-test step reused the core Swift modules. The release step compiled those
modules again, including FluidAudio. Optimized debug and release are different
compiler configurations; output reuse between them cannot be assumed safe.

### Local evidence

Revision `12fe68b672a9a13d767faa0aa9b2f6ea39af449f`, Apple M3 Max, 14 cores,
36 GB RAM, macOS 26.6.2, Apple Swift 6.2.4 / Xcode 26.3.
Started with no package build directory. Dependencies and SDK caches are a
separate concern from source compilation; these are not hosted-runner timings.

| Build | Command wall time | Frontend span |
|---|---:|---:|
| Core tests, optimized debug | 81.62 s | 45.11 s |
| App tests, shared scratch directory | 26.25 s | 16.49 s |
| Preview tests, shared scratch directory | 9.00 s | not separated |
| Release executable | 69.28 s | 64.69 s |

Command time includes planning, dependency resolution, resources and linking.
The core command included a 29.32 s dependency fetch. Frontend span is from the
earliest compiler-statistics timestamp to the latest frontend completion.
Summed frontend wall times overlap across parallel jobs and are not elapsed
build time or CPU time.

| Module / configuration | Frontend jobs | Summed frontend wall | Type checking | SIL optimization |
|---|---:|---:|---:|---:|
| FluidAudio / optimized debug | 15 | 424.52 s | 37.94 s | 183.96 s |
| Composer / optimized debug | 15 | 39.48 s | 5.63 s | 14.51 s |
| ComposerTests / optimized debug | 15 | 76.80 s | 21.91 s | 24.51 s |
| FluidAudio / release | 1 | 60.88 s | 7.14 s | 37.75 s |
| Composer / release | 1 | 6.55 s | 0.85 s | 3.96 s |

FluidAudio dominates the release critical path: its single frontend took
60.88 s of the 69.28 s command. SIL optimization accounts for 37.75 s within
that frontend. This identifies actual compiler work, rather than timestamp
invalidation, as a substantial fresh-build cost.

### Whole-module test-build experiment

After `swift package clean`, core tests built with `-O
-whole-module-optimization`, indexing disabled and `-num-threads 14` took
78.25 s, with a 74.14 s frontend span. FluidAudio alone took 66.31 s.
Compared with the original 45.11 s frontend span, this does not demonstrate a
local speedup. It is not proposed as the fix. Tests were compiled but not run
for this diagnostic experiment.

Plain WMO in a debug SwiftPM build first failed on index output names; disabling
indexing alone then failed at linking because expected per-file objects were
absent. Supplying backend threads allowed compilation to complete. These
failures are excluded from the timing comparison.

### Reproduce and collect hosted evidence

`-driver-time-compilation` produced no output in a standalone compiler probe
with this toolchain. `-stats-output-dir` produced JSON with frontend, semantic
analysis and SIL optimization timers. Use one absolute statistics directory
for all three debug packages so instrumentation flags do not themselves force
dependency recompilation when the package root changes:

```sh
mkdir -p "$STATS/debug" "$STATS/release"
swift build --build-tests -Xswiftc -O \
  -Xswiftc -stats-output-dir -Xswiftc "$STATS/debug"
# App and PreviewApps use the same flags and --scratch-path ../.build.
swift build --package-path App --scratch-path "$PWD/.build" -c release \
  --product Audelin -Xswiftc -stats-output-dir -Xswiftc "$STATS/release"
```

The opt-in `profile` input on Audelin Core adds a fresh-build diagnostic job
without restoring a build cache. It uploads machine details, command timings,
logs and compiler JSON as `audelin-fresh-build-profile`. Existing tests, limits,
bundle construction and signing still run in the unchanged core job. The
diagnostic release compilation does not create a shipped bundle.

Hosted per-module evidence and an optimization with measured before/after
times remain outstanding. Cache changes alone would not answer this question.
