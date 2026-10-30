# Host choice — QA

Driven as a pure type with sequences of picker answers at fake times. The
hold is the default 1 s unless a row says otherwise. Rows read the answer.

## S-1 A host leads above the floor

A leads above the floor: A. Evidence: `HostChoiceTests.choosesLeaderAboveFloorAndKeepsItAboveFloor()`.

## S-2 A host leads between the lines

A leads between the lines, nothing chosen: hold closer. Evidence: `HostChoiceTests.heardHostsWithoutAboveFloorLeaderNeedCloser()`.

## S-3 Hosts heard with no leader

Hosts heard, no leader: hold closer. Evidence: `HostChoiceTests.heardHostsWithoutAboveFloorLeaderNeedCloser()`.

## S-4 No host heard

No host heard: none. Evidence: `HostChoiceTests.noHostWithoutChoiceAnswersNone()`.

## S-5 The chosen host between the lines

A chosen, then A between the lines: A. Evidence: `HostChoiceTests.keepsChosenLeaderBetweenLines()`.

## S-6 The chosen host briefly below the drop line

A chosen, A below the drop line since t, answers at t + 0.1 s and t + 0.9 s, then A between the lines: A at each. Evidence: `HostChoiceTests.holdsShortDipsThroughRecoveryButEndsAtHoldBoundary()`.

## S-7 The chosen host below the drop line for the hold

A chosen, below the drop line since t: A at t + 0.99 s, hold closer at t + 1.0 s. Evidence: `HostChoiceTests.holdsShortDipsThroughRecoveryButEndsAtHoldBoundary()`.

## S-8 A rival near the chosen host

A chosen, then hosts heard with no leader: hold closer. Evidence: `HostChoiceTests.rivalOrFadeEndsChoiceImmediatelyAndReevaluatesSignal()`.

## S-9 Another host leads

A chosen, then B leads above the floor: B. Evidence: `HostChoiceTests.rivalOrFadeEndsChoiceImmediatelyAndReevaluatesSignal()`.

## S-10 The chosen host fades during the hold

A chosen, below the drop line since t, at t + 0.5 s no host heard: none. Evidence: `HostChoiceTests.rivalOrFadeEndsChoiceImmediatelyAndReevaluatesSignal()`.

## S-11 No hold

Hold 0, A chosen, then A below the drop line since the answer's own time: hold closer. Evidence: `HostChoiceTests.holdsShortDipsThroughRecoveryButEndsAtHoldBoundary()`.

## S-12 The chosen host above the floor

A chosen, then A above the floor again: A. Evidence: `HostChoiceTests.choosesLeaderAboveFloorAndKeepsItAboveFloor()`.

## S-13 A host first leads below the drop line

A leads below the drop line, nothing chosen: hold closer. Evidence: `HostChoiceTests.heardHostsWithoutAboveFloorLeaderNeedCloser()`.
