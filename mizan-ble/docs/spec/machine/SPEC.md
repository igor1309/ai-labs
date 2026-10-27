# Machine

Observer: the root, which builds each flow (amount entry, host broadcast,
host payment, client find, client connect, client review, client payment)
from a reducer and an effect handler on this loop, feeds it events and
subscribes the UI to its state. No flow keeps its scenarios unless this
loop takes events in order, carries out what the reducer asks and tells
every view each change.

Machine is the generic loop: it takes events, runs the reducer on each,
publishes the state and hands any effect to the handler, whose result comes
back as an event. It knows no flow's state, events or effects; it decides
nothing. It is audelin's loop, rebuilt here: the projects share no code.

## Decided

- Events are reduced one at a time, in the order they arrive, so a table
  test of a reducer is the flow's behaviour.
- An effect holds neither the queue nor later effects: the link can drop
  while a message is being sent, and the reducer decides what that means.
- A handler's result waits behind the events already queued, as one more
  event, so a cancel sent before a result is reduced first.
- A state equal to the one before is not published again; its effect is
  still carried out.
- Every subscriber gets the current state first, then each later one in
  order, so a screen built mid-flow draws the same state as the others.
- Once ended, a machine reduces nothing and starts no work; a result that
  still arrives is dropped. The root ends a flow when it is done, when
  it hands over in the middle of a chain, or when its mode is torn down.

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
    Given a machine ended while an effect was running
    When that effect returns a result that would ask for more work
    Then I can read the state as it was when the machine ended, and no more work was done
```

Not the machine's: what any state, event or effect means (each flow's
reducer), carrying effects out (each flow's handler), mapping sources to
events and building and ending machines (the root).
