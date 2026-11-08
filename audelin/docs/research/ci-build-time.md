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

### Hosted evidence

[Fresh profile 42521465535](https://github.com/igor1309/ai-labs/actions/runs/42521465535)
ran Apple Swift 6.3.3 on macOS 26.7.2, with three CPUs and 7 GiB RAM. After
dependency resolution, command wall times were core 364.72 s, app 173.65 s,
preview 24.82 s and release executable 228.71 s. The release measurement excludes
bundle assembly and signing. PR checks, including `report`, passed.

| Module / configuration | Frontend jobs | Summed frontend wall | Type checking | SIL optimization |
|---|---:|---:|---:|---:|
| FluidAudio / optimized debug | 15 | 737.15 s | 53.29 s | 394.45 s |
| Composer / optimized debug | 4 | 66.24 s | 6.37 s | 25.24 s |
| ComposerTests / optimized debug | 5 | 163.44 s | 40.66 s | 57.45 s |
| FluidAudio / release | 1 | 196.28 s | 19.57 s | 109.14 s |
| Composer / release | 1 | 15.95 s | 1.53 s | 7.66 s |

The hosted and local runs use different compiler versions and hardware; their
absolute times are not a controlled comparison. Both identify FluidAudio as
the dominant release frontend. Its hosted frontend occupies 196.28 s of the
228.71 s command. Changing the shipped build remains subject to owner approval.

The next controlled experiment compares default batching with
`-driver-batch-count 1` for optimized debug builds. Unlike the WMO experiment,
this preserves the existing compilation model, indexing and per-file outputs.
The hypothesis is less repeated module work across batches; the experiment must
measure whether reduced work outweighs reduced within-module parallelism.
The supplemental profiling job now runs both variants independently from empty
scratch directories and names artifacts with their batching variant. Release
compilation runs only in the default variant and retains its existing flags.

Locally, after cleaning compiled outputs and retaining resolved dependencies,
the single-batch core build completed in 149.78 s. FluidAudio's object-producing
frontend took 134.89 s, plus a separate 7.93 s module-emission frontend. This
is slower than the default-batching core command's 81.62 s even though that
original command also included dependency setup. Single batching is therefore
not recommended on this Mac. The hosted comparison remains an experiment,
not a production change.

An optimization with measured before/after times remains outstanding. Cache
changes alone would not answer this question.

### Controlled hosted batching result

[Run 42522875579](https://github.com/igor1309/ai-labs/actions/runs/42522875579)
completed both fresh variants successfully:

| Variant | Core | App | Preview | Combined test builds |
|---|---:|---:|---:|---:|
| Default batching | 303.72 s | 125.98 s | 18.43 s | 448.13 s |
| Single batch | 405.70 s | 175.08 s | 18.55 s | 599.33 s |

FluidAudio's summed debug frontend time fell from 644.83 s to 360.23 s,
and ComposerTests from 111.57 s to 77.20 s, but lost parallelism outweighed
the reduced work. Reject single batching: combined elapsed time rose 34%.
The default variant's release command took 177.81 s. Variation from the earlier
228.71 s run is another reason not to claim improvements across unrelated runs.

### Proposed next change, pending owner decision

Use release configuration for test compilation and execution, then reuse that
release output when constructing the bundle. Keep all test suites and time
limits. This addresses the measured duplication of FluidAudio compilation
across optimized debug and release configurations, rather than cache reuse.

A local feasibility probe, `swift build --build-tests -c release`, failed:
`RecordedCapture` was not compiled for testing. The generated production target
command lacks `-enable-testing`, while tests require `@testable import`.
Therefore switching only `-c release` is insufficient. The concrete proposal
requires `-Xswiftc -enable-testing` consistently in test compilation and bundle
compilation to reuse outputs. This enables internal declaration access for
testable imports in the shipped build; it also changes tests from optimized
debug semantics to release semantics (including DEBUG conditionals).

This is an owner decision under the issue's shipped-build constraint. It is
not implemented or assumed safe. If accepted, measure the complete pipeline
and run every existing test and limit before adopting it; compare the bundle's
compiler invocation and output reuse explicitly. The measured duplicate work
motivates the experiment but does not establish its eventual speedup.
