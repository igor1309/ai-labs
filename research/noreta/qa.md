---
date: 2026-09-15
model: claude-opus-5
description: "Top 7 Noreta user stories for the read-only Mac MVP, written as Gherkin features"
---

# Noreta — Top 7 User Stories

Derived from the MVP section of [product-vision.md](product-vision.md), using the
vocabulary established in [implementation-notes.md](implementation-notes.md)
(agent, session, runtime state, workspace/worktree, deeplink).

## Scope and method

These seven stories cover the read-only Mac MVP only: session discovery, live
state, history and transcript, search, and navigation. Nothing here requires
sending input to a runtime, approving a request, resuming a session, notifying,
or a mobile client — those belong to V2 and later.

Each story is one Gherkin `Feature` whose free-form description carries the
user-story narrative, as the
[Gherkin reference](https://cucumber.io/docs/gherkin/reference) describes.
Scenarios assert observable product behaviour rather than daemon internals.

Ordering is by value: discovery and live state are what make the product worth
opening at all; the rest deepen what can be done once sessions are visible.

## 1. Every session shows up on its own

```gherkin
Feature: Session discovery

  As someone who starts Claude Code and Codex sessions from a terminal
  I want every session on this Mac to appear in Noreta without my configuring it
  So that no work is lost simply because I did not launch it through Noreta

  Scenario: A session started outside Noreta appears
    Given Noreta is running
    And no session is listed for the repository "ai-labs"
    When I start a Claude Code session in "ai-labs" from my terminal
    Then that session is listed within seconds
    And it shows its agent, repository, worktree and start time

  Scenario: Sessions created while Noreta was not running
    Given Noreta is not running
    And two Codex sessions are started and left running
    When Noreta starts
    Then both sessions are listed
    And each shows its current runtime state

  Scenario: Both agents appear in one list
    Given Claude Code and Codex sessions exist on this Mac
    When I open Noreta
    Then sessions from both agents are listed together
    And I did not have to choose an agent before seeing them
```

## 2. I can see what needs me right now

```gherkin
Feature: Live runtime state

  As someone running several agents at once
  I want to see which sessions are working, which are waiting on me, and which are done
  So that I can go to the one that is blocked instead of checking terminals in turn

  Background:
    Given Noreta is running
    And a Claude Code session "auth-refactor" is listed

  Scenario: A session executing a turn reads as working
    Given "auth-refactor" is executing a tool call
    When I look at the session list
    Then "auth-refactor" is shown as working

  Scenario: A session blocked on me becomes distinguishable without a refresh
    Given "auth-refactor" is shown as working
    When its agent asks for approval to edit a file
    Then "auth-refactor" is shown as waiting within seconds
    And I did not reload the page

  Scenario: A runtime terminated elsewhere stops reading as live
    Given "auth-refactor" is shown as idle
    When I quit that agent in its terminal
    Then "auth-refactor" is shown as inactive
    And it shows the time of its last message
```

## 3. I can read what a session actually did

```gherkin
Feature: History and transcript

  As someone returning to work I left hours or days ago
  I want to read a session's full conversation, tool calls and diffs
  So that I can rebuild my context without re-reading the repository

  Scenario: Reading an inactive session
    Given a Codex session from last week is listed as inactive
    When I open it
    Then I see its messages in order
    And I see the tool calls and file diffs it produced

  Scenario: The transcript is structured, not a terminal dump
    Given I am reading a session transcript
    When it contains a file diff
    Then the diff is rendered as a diff
    And tool calls are distinguishable from the agent's prose

  Scenario: A live session's transcript keeps up
    Given I am reading the transcript of a session shown as working
    When the agent produces a new message
    Then that message appears in the transcript I am reading
```

## 4. I can find a session by what happened in it

```gherkin
Feature: Search across sessions

  As someone who remembers what a session was about but not where or when it ran
  I want to search every indexed session, old ones included
  So that finding past work does not depend on my having kept it visible

  Scenario Outline: Searching a single dimension
    Given sessions exist across several repositories, worktrees and agents
    When I search for <query>
    Then the results contain every session matching <dimension>
    And each result shows enough context to tell the matches apart

    Examples:
      | query               | dimension       |
      | "rate limiter"      | message text    |
      | "ai-labs"           | repository      |
      | "feature/noreta"    | branch          |
      | "codex"             | agent           |

  Scenario: Old sessions stay findable after they drop out of the default view
    Given the default view shows only sessions from the last 14 days
    And a session from three months ago mentions "rate limiter"
    When I search for "rate limiter"
    Then the three-month-old session is among the results
```

## 5. I can see sessions grouped by the context they belong to

```gherkin
Feature: Grouping and filtering by working context

  As someone with several repositories and worktrees in flight
  I want to group and filter sessions by repository, worktree and agent
  So that one project's work is not interleaved with everything else

  Scenario: Grouping by repository
    Given sessions exist in the repositories "ai-labs" and "foliotell"
    When I group the session list by repository
    Then each repository is a separate group
    And every listed session appears under exactly one of them

  Scenario: Two worktrees of one repository stay apart
    Given "ai-labs" has a session in its main checkout
    And "ai-labs" has a session in the worktree "feature/noreta"
    When I group the session list by workspace
    Then the two sessions appear in different groups

  Scenario: Filtering to what is live
    Given sessions exist in every runtime state
    When I filter to active sessions
    Then only sessions shown as working, waiting or idle remain listed
```

## 6. A deleted worktree does not erase its history

```gherkin
Feature: Sessions outlive their workspace

  As someone who deletes worktrees and branches as soon as work merges
  I want sessions from a removed workspace to keep their identity and history
  So that cleaning up my disk does not cost me the record of how the work was done

  Scenario: The session survives its worktree
    Given a session ran in the worktree "feature/noreta" of "ai-labs"
    When that worktree is deleted from disk
    Then the session is still listed under "feature/noreta"
    And its transcript is still readable

  Scenario: The workspace is marked as gone rather than reassigned
    Given a session whose worktree has been deleted
    When I look at that session
    Then it is marked as having no workspace on disk
    And it is not listed as if it had run in the repository root
```

## 7. I can link straight to a session

```gherkin
Feature: Deeplink navigation

  As someone who refers to sessions from notes, tickets and other local tools
  I want every session to have a stable link that opens it
  So that a session can be addressed like any other artifact I work with

  Scenario: A session link survives a restart
    Given I copied the link to a session yesterday
    And Noreta has restarted since
    When I open that link
    Then Noreta opens that same session

  Scenario: A link to a session whose runtime has ended
    Given I hold a link to a session that is now inactive
    When I open that link
    Then Noreta opens the session's transcript
    And the session is shown as inactive
```

## Open questions

- **What "waiting" covers.** Scenario 2 treats an approval request as waiting.
  Whether a plain input prompt and a permission prompt should be one state or
  two is undecided, and it affects how the list is sorted.
- **Search result granularity.** Story 4 asserts that a matching session is
  returned; whether a match points at the session or at the specific message
  inside it is unsettled.
- **Default recency window.** Story 4 names 14 days to make the scenario
  concrete. The cutoff is a UI/configuration choice per
  [implementation-notes.md](implementation-notes.md), not a product commitment.
- **Grouping by workspace vs worktree.** Stories 5 and 6 use both words for the
  same idea. One term should win before these become tests.
