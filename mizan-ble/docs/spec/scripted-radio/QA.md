# Scripted radio — QA

Driven through the root's radio interfaces in `ScriptedRadioTests`, with
settings given as values and a fake clock; the test plays the app's side
with session crypto and the codec.

## S-1 A scripted client decides

For each row: serve, advertise, read the key event, derive, send the sealed amount; open the decision as the row's; send the acknowledgement (and the outcome after a confirm); advance the clock past every delay in the settings, then read that no client was lost; then finish. Evidence: ScriptedRadioTests.clientDecisions.

## S-2 A scripted host's outcome

For each row: scan, connect, read the session, write the key, open the amount, write a sealed confirm: the next two messages open as the acknowledgement, then the row's outcome. Evidence: ScriptedRadioTests.hostOutcomes.

## S-3 A scripted host takes a decline

As S-2 with a sealed decline: the acknowledgement opens, and after the clock passes every delay no further message arrives. Evidence: ScriptedRadioTests.hostDecline.

## S-4 A scripted host cancels

Open the amount under a cancelling host: the next message opens as the host's end. Evidence: ScriptedRadioTests.hostCancels.

## S-5 Readings as the settings give them

Scan under two hosts with timed readings and advance the clock: each reading reads back with the settings' host, signal and time; after stopping the scan no reading arrives, and a connect to a chosen host still completes. Evidence: ScriptedRadioTests.timedReadings.

## S-6 A drop at a named point

One case per row: at that point the row's event (for the host before the key, none after every delay) arrives, and no later key, message or reading of that transaction does. The client's "before it arrives" row also shows that the scripted host sealed the amount: the settings' delay for its arrival passes with the link already lost. Evidence: ScriptedRadioTests.clientDrops, ScriptedRadioTests.hostDrops, ScriptedRadioTests.amountIsSealedBeforeDeliveryLoss.

## S-7 Bluetooth's state from the settings

For each row: that side's radio, given the settings, reads the row's state. Evidence: ScriptedRadioTests.bluetoothStates.

## S-8 A message the scripted side cannot open

For each row, mid-transaction (after the amount on the host; after the key on the client), send a frame sealed with a wrong key: the row's loss is read before the clock advances, and also for a wrong-key acknowledgement and outcome on the host. Evidence: ScriptedRadioTests.unreadableHostMessages and ScriptedRadioTests.unreadableClientMessage.
