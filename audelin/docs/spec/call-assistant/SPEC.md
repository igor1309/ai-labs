# Call assistant

Observer: the user, helped during a call by an agent thread that knows the project.

## Decided

- **By hand, one thread, one call; hints only there** (owner, ADR-003): no other thread and no next call gets it unasked.
- **Where speech goes shows before any is sent,** as in `../call-notes/`; no recap, notes are Audelin's.
- **Two triggers** (owner), else silent, as hinting products are by default; they measured no delay, so none is promised (`../../research/live-call-assistants.md`).

```gherkin
Feature: Hints during a call

  Rule: Following starts by hand, after showing where speech goes

    Scenario: S-1 Asking shows where speech goes before following
      When I ask the thread to follow the call
      Then I can see the model provider both sides' speech will go to, before any is sent

    Scenario: S-2 With no call it waits, and joins the call that starts
      Given no call is being recorded
      When I ask the thread to follow the call, and a call starts
      Then I can read that it waits, then that it has joined

    Scenario: S-4 Joining mid-call takes in what was said
      Given a call has been recorded for a while
      When I ask the thread to follow it and ask about something said before
      Then I can read an answer that uses what was said before I asked

  Rule: A followed call gets hints only for questions and claims

    Background:
      Given the thread follows a call

    Scenario Outline: <id> <trigger> gets a hint
      When someone <says>
      Then I can read a short <hint> with its source, after it

      Examples:
        | id  | trigger                              | says                                          | hint       |
        | S-5 | A question answered in the project   | asks a question the project answers           | answer     |
        | S-6 | A claim against a decision           | contradicts a project decision                | correction |

    Scenario: S-7 Routine talk stays silent
      When the talk raises nothing the project answers or contradicts
      Then I see no message from the thread about it

    Scenario: S-8 The start of a long call is remembered
      Given a fact was spoken only near the start of a long call
      When I ask about that fact in text near the end
      Then I can read an answer that uses it

    Scenario Outline: <id> <what> that fails is said
      When <what> cannot be made
      Then I can read that it failed, and <after>

      Examples:
        | id   | what                      | after                  |
        | S-15 | a hint for a question     | later hints still come |
        | S-16 | a hint for a claim        | later hints still come |
        | S-17 | an answer to my text      | I can ask again        |

  Rule: Following ends with the call, or when I stop it

    Scenario Outline: <id> <when> stops following
      Given the thread <state>
      When <event>
      Then I can read that it stopped, with no recap, and the next call is not followed

      Examples:
        | id   | when             | state         | event                    |
        | S-9  | The call ending  | follows a call | the call ends           |
        | S-10 | Stopping a call  | follows a call | I ask the thread to stop |
        | S-11 | Stopping a wait  | waits for a call | I ask the thread to stop |

  Rule: Missing text is said once

    Scenario: S-12 The call's text not coming is said once
      Given the thread follows a call
      When the call's live text is off or stops
      Then I can read once that the call's text is not coming
```
