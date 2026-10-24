# Machine

Observer: compose, which builds each of the app's state machines (Recording,
Reading, Settings, Recordings) from a reducer and an effect handler and
subscribes their inputs and views to it (`docs/app-shape.md`). No machine
has a spec yet; each will keep user scenarios only if this loop takes its
events in order (S-1, S-7 starting and stopping a recording), carries out
what its reducer asks (S-9 the call is recorded), and tells every view
each change (S-3, S-16 the panel and the menu bar).

Machine is the generic loop of the app shape: it takes events, runs the
reducer on each, publishes the state and hands any effect to the handler,
whose results come back as events. It knows no machine's state, events or
effects; it decides nothing.

## Decided

- Events are reduced one at a time, in the order they arrive, so a table
  test of a reducer is the machine's behaviour.
- An effect holds neither the queue nor later effects: a call can end
  while a recording is starting, and the reducer, not the loop, decides
  what that means and what work to ask for (app shape, Pattern).
- A handler's result waits behind the events already queued: it is one more
  event, and no source jumps the line, so a stop sent before a result is
  reduced first.
- A state equal to the one before is not published again, so views redraw
  only on change (`RxViewModel`'s predicate, with equality as the test). Its
  effect is still carried out: publishing and acting are separate.
- Every subscriber gets the current state first, then each later one in
  order: the panel, the menu bar and other machines subscribe at different
  times and must all draw the same machine.
- Compose ends a machine when that instance's lifetime ends: Reading when
  its recording ends, every machine when the app quits. Compose ends one
  only once its state shows nothing left to clean up, such as Recording
  idle, so ending is never how a recording stops. Work that holds or may
  still acquire a resource has settled by then; only work whose result can
  never need cleanup may still run. So once ended a machine reduces nothing
  and starts no work, and a result that still arrives is dropped.

```gherkin
Feature: Running a state machine

  Scenario: S-1 Events change the state in the order they came
    Given a running machine
    When several events are sent
    Then I can read a state that took them in the order they were sent

  Scenario: S-2 An effect's result changes the state
    Given a reducer that answers an event with an effect
    When that event is sent and the effect is carried out
    Then I can read the state its result leads to

  Scenario: S-3 Events are taken while an effect runs
    Given an effect that has not finished
    When another event that asks for work is sent
    Then I can read the state that work's result leads to before the first effect ends

  Scenario: S-4 A result waits behind events already sent
    Given an effect that has not finished and events sent after it
    When the effect returns its result
    Then I can read a state that took those events before the result

  Scenario: S-5 An unchanged state is not told again
    Given a subscriber to the machine's state
    When an event leaves the state as it was
    Then I can follow its changes without reading the unchanged state again

  Scenario: S-6 An effect is carried out when the state is unchanged
    Given a reducer that answers an event with an effect and no change
    When that event is sent
    Then I can read the state the effect's result leads to

  Scenario: S-7 A late subscriber starts from the current state
    Given a machine that has already changed its state
    When a view subscribes
    Then it can read the current state first

  Scenario: S-8 Every subscriber is told each change
    Given two subscribers that joined at different times
    When the state changes several times
    Then each can read every change, in order

  Scenario: S-9 An ended machine takes no event
    Given an ended machine
    When an event that asks for work is sent
    Then I can read the state as it was, and no work was done

  Scenario: S-10 An ended machine drops a late result
    Given a machine ended while work whose result needs no cleanup was running
    When that work returns a result that would ask for more work
    Then I can read the state as it was when the machine ended, and no more work was done
```

Not the machine's: what any state, event or effect means (each machine's
reducer), carrying effects out (each machine's handler), merging sources
into events (the merge mapping), and building and ending machines
(compose).
