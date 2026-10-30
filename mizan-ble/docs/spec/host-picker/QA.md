# Host picker — QA

Driven as a pure type with recorded reading sequences and a fake time. The
settings are the defaults. Rows read the answer.

## S-1 One host, near

A at −50 dBm, 5 readings over 1 s: A leading, above the floor. Evidence: `HostPickerTests.oneNearHost()`.

## S-3 One host, not yet long enough

A at −50 dBm, 5 readings over 0.6 s: no leader, a host heard. Evidence: `HostPickerTests.oneHostBeforeTheWindow()`.

## S-4 Two hosts, one clearly nearer

A at −50, B at −60, each 5 readings over 1 s: A leading. Evidence: `HostPickerTests.clearlyNearerOfTwoHosts()`.

## S-5 Two hosts too close to call

A at −50, B at −53: no leader, hosts heard. Evidence: `HostPickerTests.twoHostsTooCloseToCall()`.

## S-6 A host that fades out

A leading, no reading for 2.1 s: no host heard. Evidence: `HostPickerTests.chosenHostFadesOut()`.

## S-7 The fading host lets the other lead

A at −50, B at −53, then A silent for 2.1 s while B is heard: B leading. Evidence: `HostPickerTests.fadingHostLetsTheOtherWin()`.

## S-8 A reading of 127

A at −50 for 1 s with three 127 readings mixed in: A leading, above the floor. Evidence: `HostPickerTests.unavailableReadingsAreIgnored()`.

## S-9 A spike is smoothed

A at −50, B at −70, then one B reading of −45: A leading. Evidence: `HostPickerTests.spikeIsSmoothed()`.

## S-10 A newcomer near the leader's strength

A leading at −50, then B's first reading at −52: no leader, hosts heard. Evidence: `HostPickerTests.newcomerNearTheLeaderBlocksChoice()`.

## S-11 No hosts

No readings: no host heard. Evidence: `HostPickerTests.noHosts()`.

## S-12 Two equal hosts with no margin

Margin 0, A and B both at −50 over 1 s: no leader, hosts heard. Evidence: `HostPickerTests.equalHostsWithZeroMargin()`.

## S-13 A leader between the lines

A at −68 dBm, 5 readings over 1 s: A leading, between the lines; at exactly −65: between the lines; at −64.9: above the floor. Evidence: `HostPickerTests.leaderBetweenTheLinesAndAtTheFloor()`.

## S-14 Since when a leader is below the drop line

A leading at −68, a reading of −78 at t taking its average to exactly −71, then ticks to t + 0.5 s: A below the drop line since t; from −70, a reading of −73, an average of −70.9: between the lines. Evidence: `HostPickerTests.belowDropSinceTheCrossingReadingThroughTicks()`.

## S-15 A leader back over the drop line

A's average −72 since t; a raw −70 at t + 0.2 s gives −71.4: still since t; a raw −50 at t + 0.3 s gives −64.98, over the line; a raw −90 at t + 0.5 s gives −72.49: below the drop line since t + 0.5 s. Evidence: `HostPickerTests.crossingBackOverTheDropLineStartsANewRun()`.

## S-16 A host heard again after the fade

A leading, no reading or tick for 2.1 s, then one reading from A at −50: no leader, a host heard. Evidence: `HostPickerTests.heardAgainAfterTheFadeHasNoLeader()`.

## S-17 Below the drop line before it leads

A's first readings at −75 from t, 5 readings over 1 s: at t + 1 s A leading, below the drop line since t. Evidence: `HostPickerTests.belowDropBeforeTheWindowKeepsItsStartTime()`.

## S-18 A rival during a run below the drop line

A leading, average −75 since t; B at −74 heard from t + 0.2 s (no leader), then silent for 2.1 s while A stays at −75: A leading, below the drop line since t. Evidence: `HostPickerTests.rivalDoesNotResetTheRunBelowDrop()`.
