# Machine — QA

Driven through a test reducer and a test dependency made for the purpose.
The reducer appends each event to its state, and answers chosen events
with an effect. The dependency holds each effect until released on cue,
does its work by adding an entry to an output the test reads, as a real
dependency writes a file, and returns a chosen result. Rows read back the
state, the subscribers' states or that output, never that a function was
called.

## S-1 Events change the state in the order they came

Ten numbered events sent in a row: the state lists them one to ten.
Evidence: `MachineTests.eventsAreReducedInArrivalOrder()`.

## S-2 An effect's result changes the state

An event answered with an effect, which is released with a result: the
state lists the result after the event.
Evidence: `MachineTests.effectResultChangesState()`.

## S-3 Events are taken while an effect runs

With an effect held, a second event answered with an effect, and only that
second effect released: the state lists the second event and its result
while the first effect is still held.
Evidence: `MachineTests.laterEffectFinishesWhileFirstIsHeld()`.

## S-4 A result waits behind events already sent

An effect held; two events sent and the effect released without the
machine taking a turn in between, so both events are still waiting when the
result arrives: the state lists both events before the result.
Evidence: `MachineTests.resultQueuesBehindEventsAlreadySent()`.

## S-5 An unchanged state is not told again

An event the reducer ignores, then a changing one: the subscriber's states
are the one before and the one after, with no repeat.
Evidence: `MachineTests.unchangedStateIsNotPublishedAgain()`,
`MachineTests.equalStateIsKeptForTheNextReduction()`.

## S-6 An effect is carried out when the state is unchanged

An event answered with an effect and no change, its effect released with a
result: the state lists the result.
Evidence: `MachineTests.unchangedStateStillRunsEffect()`.

## S-7 A late subscriber starts from the current state

Three events, then a subscriber: its first state lists all three.
Evidence: `MachineTests.lateSubscriberStartsWithCurrentState()`.

## S-8 Every subscriber is told each change

One subscriber, two events, a second subscriber, two more events: the
first reads all four states in order, the second the current one and the
last two. Then an event answered with an effect, held: both read its state
while the effect is held, and after release both read the result's state
next.
Evidence: `MachineTests.everySubscriberReceivesEveryChange()`.

## S-9 An ended machine takes no event

The machine ended, then an event answered with an effect, then every effect
the dependency holds released: the state is unchanged and the dependency's
output is empty.
Evidence: `MachineTests.endedMachineIgnoresEventsAndStartsNoWork()`.

## S-10 An ended machine drops a late result

An effect held whose result the reducer answers with another effect; the
machine ended, the effect released, then every effect the dependency holds
released: the state is the one at the end and the dependency's output holds
only the first effect's entry.
Evidence: `MachineTests.endedMachineDropsLateResultWithoutMoreWork()`.
