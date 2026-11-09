# Recurring profiling

The current baseline is the existing two-track, real-model `AudelinBaseline`
workload at 1×. It replays a fixed Russian synthetic speech fixture through
production composition, writes both tracks and counts transcript words per
speaker. The fake-recognizer rehearsal remains useful for pipeline diagnostics.

## Collection and baseline

`Audelin Nightly` runs daily at 01:43 UTC (04:43 Europe/Moscow) on the quiet,
self-hosted `local-mac`. `macos/scripts/nightly.sh` collects a three-hour run
without Instruments, then short Time Profiler windows at 1,620 and 6,000
preloaded entries. Nightly three-hour coverage supersedes the proposed monthly
soak. Do not start a competing benchmark during collection.

The `audelin-nightly` Actions artifact contains `identity.json`, `endurance.log`,
`report.json`, `report.md` and capture summaries. Reports contain every minute
sample plus the convenient minute 1/30/90/180 subset. Read the JSON for numbers
and the Markdown for evidence failures, unavailable metrics and comparisons.
Do not copy private audio or raw private call data into issues or the repository.

The Mac's history `latest` points to the previous successful, evidence-validated
run. It advances only after both collection and reporting succeed. A done line
alone is insufficient: the intended `--minutes` duration must be reached, one
written result must show both positive track lengths agreeing with fed duration
within 0.1 seconds, and both transcript speakers must have positive word counts.
Missing, malformed or truncated evidence fails reporting even if the harness
exited zero; the report files are still written for diagnosis.

Only a complete, correct previous report with identical workload (fixture and
capture settings included), build configuration, models, machine and toolchain
is comparable. The commit may differ. The first run, legacy/unverified reports,
or a changed setup have no comparable baseline: record the current valid result
and wait for a subsequent matching run. An invalid previous report is skipped,
never treated as zero. The automatic comparison uses `latest`; it does not
search older history across a setup change. For artifact review, select a
previous successful matching report explicitly:

```sh
python3 -I audelin/macos/scripts/nightly-report.py CURRENT --previous BASELINE
```

This only reads collected evidence and writes reports in CURRENT. Invalid
current evidence returns nonzero after writing; performance warnings return zero.

## Weekly artifact review

The Multica weekly profiling agent is scheduled for Wednesday 03:20
Europe/Moscow. Review completed nightly artifacts only, including failed runs
with reports, and record workflow/run IDs and compared commits. At this hour
Wednesday's 04:43 collection has not started: use the latest completed nights.
Do not dispatch workflows, build models, run Instruments or launch another soak.

Check audio loss and evidence validity first. Compare CPU seconds/share, peak
footprint, final-minute newest/final mean lag and backlog, and hangs per capture.
An increase above 10% is an investigation signal requiring repetition on a
matching quiet setup, not a CI failure or proof of regression. A change from a
zero baseline has no meaningful percent; inspect its numeric delta and repeat.
There are no universal absolute resource budgets. Missing measurements remain
unavailable, including in deltas.

Before creating a finding, search existing open findings and recent review notes
for the same symptom, metric, setup and likely cause. Update that finding with
new run evidence; create one only for a distinct reproducible problem. Record
no-baseline and invalid-evidence cases explicitly without inventing comparisons.
When a regression repeats, locate its cause and give the fix a regular count,
ratio or correctness regression test in the affected component.

## Interpretation and gaps

Lag values are pooled minute means from the harness, not per-track acoustic
partial/final p50/p95 and not screen-drawing latency. Paced wall time includes
waiting; raw throughput and backlog retain the harness's definitions. Written
track shortfall measures duration loss at printed precision, not source-frame
continuity, gap count or acoustic correctness; positive speaker counts are a
coverage guard, not WER evidence.

Footprint slope is a descriptive least-squares fit from minute 30 onwards,
reported with its sample count when at least three samples exist. Backlog gets a
whole-run slope and maximum. Retained transcripts legitimately grow; a positive
footprint slope alone does not establish a leak. Model/disk caches may be warm,
and the run does not identify a controlled cold start or prove post-stop memory
release. Real call audio interference, device dropouts, acoustic p95, rendering
latency, thermal/energy effects and quality against aligned reference words
remain separate measurements. Profile windows measure only their captured work;
no reported hangs in them is not evidence of a hang-free three-hour call.
