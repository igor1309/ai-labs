# Lifecycle

Observer: compose, which sends Lifecycle the user's quit, each participant's
settled outcome, what blocks a relaunch and each update check, answers its
ports (the calls-folder claim, starting the new instance, terminating) and
reads its phase. Lifecycle owns termination policy only: it reads no
participant and drives none.

## Decided

- **A quit is published as an intention,** and termination waits until
  every participant that exists has settled (Shutdown in the architecture).
- **A relaunch holds the calls-folder claim,** so no recording or folder
  move starts behind the decision to restart. Lifecycle takes the claim
  itself, keeps its token, and starts the new instance only once granted.
- **What blocks a relaunch arrives whenever it changes,** its first value
  included, and Lifecycle keeps it. An update check asks for a relaunch; it
  goes ahead only while running with nothing blocking.
- **A refusal ends the attempt.** The next update check asks again; the
  claim's holder is not waited for.
- **A blocker or a quit during the take cancels the relaunch.** The answer is
  still awaited, and a late grant is released before Lifecycle runs on.
- **Starting the relaunch schedules the new instance** to open after this
  process exits; it does not wait for it. A helper that fails to start is a
  failed start.
- **A failed start releases the claim** before Lifecycle is running again,
  so the claim can be taken by the next attempt or anyone else.
- **A scheduled relaunch keeps the claim** until the process exits: it quits
  through the same intention, and nothing may start behind it.
- **A quit while the relaunch is starting stays a quit.** Its answer is still
  awaited: a scheduled relaunch keeps the claim, a failed one releases it,
  and neither returns Lifecycle to running.
- **Termination also waits for Lifecycle's own work:** a take, a relaunch
  start or a release still unanswered holds it; a held token does not.

```gherkin
Feature: Quitting and relaunching into an update

  Scenario: S-1 Quit waits for every participant
    Given Audelin is running
    When the user quits and not every participant has settled
    Then I can read that Audelin is quitting and not yet terminating

  Scenario: S-2 The last settled participant terminates
    Given Audelin is quitting
    When the last participant settles
    Then I can see Audelin terminate

  Scenario: S-3 An unblocked relaunch takes the claim
    Given Audelin is running with nothing blocking a relaunch
    When an update check asks for a relaunch
    Then I can see Lifecycle take the calls-folder claim

  Scenario: S-4 A blocked relaunch does nothing
    Given something blocks a relaunch
    When an update check asks for a relaunch
    Then I can read that Audelin is running and takes no claim

  Scenario: S-5 A granted claim starts the relaunch
    Given Lifecycle is taking the claim
    When the claim is granted
    Then I can see the relaunch being scheduled with the claim held

  Scenario: S-6 A refused claim keeps Audelin running
    Given Lifecycle is taking the claim
    When the claim is refused
    Then I can read that Audelin is running

  Scenario: S-7 A blocker during the take releases a late grant
    Given Lifecycle is taking the claim
    When something blocks a relaunch and then the claim is granted
    Then I can see the claim released and then Audelin running

  Scenario: S-8 A quit during the take releases a late grant
    Given Lifecycle is taking the claim
    When the user quits and then the claim is granted
    Then I can see the claim released and no new instance started

  Scenario: S-9 A failed start releases the claim
    Given the relaunch is being scheduled
    When its helper fails to start
    Then I can see the claim released and then Audelin running

  Scenario: S-10 A scheduled relaunch quits holding the claim
    Given the relaunch is being scheduled
    When it is scheduled
    Then I can read that Audelin is quitting with the claim held

  Scenario: S-11 Termination waits for an unanswered take
    Given Audelin is quitting with every participant settled
    When Lifecycle's take is still unanswered
    Then I can read that Audelin is not yet terminating

  Scenario: S-12 A quit while scheduling keeps quitting after a failure
    Given the relaunch is being scheduled
    When the user quits and then its helper fails to start
    Then I can see the claim released and read that Audelin is quitting

  Scenario: S-13 Termination waits for an unanswered relaunch start
    Given the user quit while the relaunch is being scheduled
    When every participant settles before its answer
    Then I can read that Audelin is not yet terminating
```
