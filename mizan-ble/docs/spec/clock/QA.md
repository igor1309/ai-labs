# Clock — QA

Driven against the real `ContinuousClock` with short intervals; the
countdown's ticks are read from its stream.

## S-1 A countdown runs out

A 3 s countdown: ticks 2, 1, 0, then the stream finishes. Evidence: `SystemClockTests.countdownRunsOut(wake:)` (on time, and a late wake skipping the expired step) and `countdownRunsOutAgainstTheRealClock`.

## S-2 A countdown stopped

Stopped after the first tick: the stream finishes with no more. Evidence: `SystemClockTests.countdownStopsWhenReaderIsCancelled`.

## S-3 Now moves on

Now, a one-second sleep, now: the second is at least one second later. Evidence: `SystemClockTests.nowAdvancesMonotonically`.
