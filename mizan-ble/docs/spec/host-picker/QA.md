# Host picker — QA

Driven as a pure type with recorded reading sequences and a fake time. The
settings are the defaults. Rows read the answer.

## S-1 One host, near

A at −50 dBm, 5 readings over 1 s: A. Evidence: `HostPickerTests.oneNearHost()`.

## S-2 One host, too far

A at −70 dBm, 5 readings over 1 s: hold closer. Evidence: `HostPickerTests.oneFarHost()`.

## S-3 One host, not yet long enough

A at −50 dBm, 5 readings over 0.6 s: hold closer. Evidence: `HostPickerTests.oneHostBeforeTheWindow()`.

## S-4 Two hosts, one clearly nearer

A at −50, B at −60, each 5 readings over 1 s: A. Evidence: `HostPickerTests.clearlyNearerOfTwoHosts()`.

## S-5 Two hosts too close to call

A at −50, B at −53: hold closer. Evidence: `HostPickerTests.twoHostsTooCloseToCall()`.

## S-6 A host that fades out

A chosen, no reading for 2.1 s: none. Evidence: `HostPickerTests.chosenHostFadesOut()`.

## S-7 The fading host lets the other win

A at −50, B at −53, then A silent for 2.1 s while B is heard: B. Evidence: `HostPickerTests.fadingHostLetsTheOtherWin()`.

## S-8 A reading of 127

A at −50 for 1 s with three 127 readings mixed in: A. Evidence: `HostPickerTests.unavailableReadingsAreIgnored()`.

## S-9 A spike is smoothed

A at −50, B at −70, then one B reading of −45: A. Evidence: `HostPickerTests.spikeIsSmoothed()`.

## S-10 A newcomer near the leader's strength

A chosen at −50, then B's first reading at −52: hold closer. Evidence: `HostPickerTests.newcomerNearTheLeaderBlocksChoice()`.

## S-11 No hosts

No readings: none. Evidence: `HostPickerTests.noHosts()`.

## S-12 Two equal hosts with no margin

Margin 0, A and B both at −50 over 1 s: hold closer. Evidence: `HostPickerTests.equalHostsWithZeroMargin()`.
