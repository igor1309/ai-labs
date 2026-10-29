# App — QA

Driven on a real iPad and iPhone with the log streamed from Console; a
row reads the log lines.

## S-1 Both radios built, one mode at work

Launch on the iPad: the log names both radios built and the host flows built; the client radio logs no scan. Evidence: RootTests `AppRootTests.launchUsesDeviceRole` and `radiosKeptAcrossSwitchesAndNeverStartedByShell` prove the shell's launch role, radio build log and idle radios; host flows await wiring.

## S-2 A switch tears the old mode down

Switch at rest: the host flows' teardown is logged before the client flows are built; neither radio is torn down. Evidence: RootTests `AppRootTests.teardownPrecedesBuildAndSameChoiceDoesNothing`, `switchAtRest` and `radiosKeptAcrossSwitchesAndNeverStartedByShell` prove the shell's mode lifecycle order and retained radios; flow teardown and build await wiring.

## S-3 Every message is logged without its contents

A payment from lock through confirm to a success result: each message logged with kind, counter and length; no amount or key. Evidence: Missing.

## S-4 Every state change is logged

A payment from lock through confirm to a success result: each flow's states in order. Evidence: Missing.

## S-5 A hand-over builds the next flow

A handshake: client find logged handed over, not ended; client connect ended; client review built with the same session id. Evidence: Missing.
