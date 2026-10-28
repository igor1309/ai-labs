# Machine — QA

Driven through a test reducer and a test dependency made for the purpose.
The reducer appends each event to its state and answers chosen events with
an effect. The dependency holds each effect until released on cue, adds an
entry to an output the test reads, and returns a chosen result. Rows read
back the state, the subscribers' states or that output.

## S-1 Events change the state in the order they came

Ten numbered events in a row: the state lists one to ten. Evidence: `MachineTests.eventsAreReducedInArrivalOrder`.

## S-2 An effect's result changes the state

An event answered with an effect, released with a result: the state lists the result after the event. Evidence: `MachineTests.effectResultChangesState`.

## S-3 Events are taken while an effect runs

One effect held, a second event's effect released: the state lists the second result while the first is held. Evidence: `MachineTests.secondEffectFinishesWhileFirstIsHeld`.

## S-4 A result waits behind events already sent

An effect held, two events sent, the effect released with no turn between: the state lists both events before the result. Evidence: `MachineTests.resultFollowsEventsAlreadySent`.

## S-5 An unchanged state is not told again

An event the reducer ignores, then a changing one: the subscriber reads the state before and after, with no repeat. Evidence: `MachineTests.unchangedStateIsNotPublishedAgain`.

## S-6 An effect is carried out when the state is unchanged

An event answered with an effect and no change, released: the state lists the result. Evidence: `MachineTests.unchangedStateStillRunsEffect`.

## S-7 A late subscriber starts from the current state

Three events, then a subscriber: its first state lists all three. Evidence: `MachineTests.lateSubscriberStartsWithCurrentState`.

## S-8 Every subscriber is told each change

One subscriber, two events, a second subscriber, two more: the first reads four states in order, the second the current one and the last two. Evidence: `MachineTests.subscribersReceiveEveryChangeInOrder`.

## S-9 An ended machine takes no event

The machine ended, then an event answered with an effect, every effect released: the state is unchanged and the output empty. Evidence: `MachineTests.endedMachineRejectsEventsAndWork`.

## S-10 An ended machine drops a late result

An effect held whose result asks for more work; the machine ended and the effect released: the state is the one at the end, and the output holds only the first entry. Evidence: `MachineTests.endedMachineDropsLateResultAndFurtherWork`.

## S-11 A result can ask for the next step's work

An effect whose result asks for a second effect, both released: the state lists the first event, the second and its result, and the output holds both entries. Evidence: `MachineTests.resultThatAsksForWorkStartsTheNextEffect`.

## S-12 An effect starts before the next event is reduced

An event asks for a held effect, then a second event is sent without waiting: the fake's record lists the effect's synchronous work before the second reduction. Evidence: `MachineTests.effectStartsBeforeNextReduction`.
