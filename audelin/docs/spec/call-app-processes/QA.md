# Call app processes — QA

Driven through a fake of its own process-list interface: hand-made lists
of processes with their bundle ids and names, one list per ask. No row
needs Core Audio.

## S-1 The call app's own process is chosen

`us.zoom.xos` is chosen for the prefix `us.zoom`. Evidence:
`CallAppProcessesTests.theCallAppsOwnProcessIsChosen`.

## S-2 The call app's helpers are chosen

`com.google.Chrome.helper.Renderer` is chosen for `com.google.Chrome`, and
"Comet Helper (Renderer)" with bundle id `ai.perplexity.comet.helper.renderer`
for "Comet". Evidence: `CallAppProcessesTests.theCallAppsHelpersAreChosen`.

## S-3 Another app is left out

Music beside Zoom is not chosen. Evidence:
`CallAppProcessesTests.anotherAppIsLeftOut`.

## S-4 An app with a similar name is left out

"Cometary", and a "Comet Helper" whose bundle id has no `.helper`, are not
chosen for "Comet". Evidence:
`CallAppProcessesTests.anAppWithASimilarNameIsLeftOut`.

## S-5 A process with no bundle id is found by name

A process with an empty bundle id named `zoom-cli` is chosen for
`zoom-cli`. Evidence:
`CallAppProcessesTests.aProcessWithNoBundleIDIsFoundByName`.

## S-6 With the call app not running, all but Audelin is chosen

The first ask with no match answers "all but" the process marked as
Audelin's. Evidence:
`CallAppProcessesTests.withTheCallAppNotRunningAllButAudelinIsChosen`.

## S-7 A helper opened later is chosen

A second ask, with a new Chrome renderer in the list, adds it. Evidence:
`CallAppProcessesTests.aHelperOpenedLaterIsChosen`.

## S-8 A call app that leaves keeps its answer

An ask with none of the call app's processes left gives the latest answer
again, including after a different "only" answer or an "all but" answer
changes to "only". Evidence:
`CallAppProcessesTests.aCallAppThatLeavesKeepsItsAnswer` and
`CallAppProcessesTests.aCallAppThatLeavesKeepsItsLatestAnswer`.

## S-9 A call app that starts after is chosen

After an "all but" answer, an ask with Zoom in the list answers Zoom's
processes. Evidence: `CallAppProcessesTests.aCallAppThatStartsAfterIsChosen`.

## S-10 A list that fails is told

A list that throws makes the ask throw the same error. Evidence:
`CallAppProcessesTests.aListThatFailsIsTold`.
