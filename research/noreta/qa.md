---
date: 2026-09-15
description: QA scenarios for the Noreta read-only Mac MVP, one Gherkin
  feature per user story
model: gpt-5.6-sol
---

# Noreta - QA

``` gherkin
Feature: See active sessions

  Rule: A session with a live runtime is active

    Scenario: A working session is active
      Given a session has a live runtime executing a turn
      When I view my sessions
      Then the session is shown as active

    Scenario: A session waiting for input is visible as waiting
      Given a session has a live runtime waiting for input
      When I view my sessions
      Then the session is shown as active
      And the session is shown as waiting

    Scenario: A session waiting for approval is visible as waiting
      Given a session has a live runtime waiting for approval
      When I view my sessions
      Then the session is shown as active
      And the session is shown as waiting

    Scenario: An idle session is active
      Given a session has a live runtime doing nothing
      When I view my sessions
      Then the session is shown as active

  Rule: A session without a live runtime is inactive

    Scenario: A runtime terminates
      Given an active session exists
      When its runtime terminates
      Then the session is shown as inactive

  Rule: Sessions are discovered independently of how they were started

    Scenario: A session starts outside Noreta
      Given Noreta is running
      When I start a supported coding agent from another application
      Then its session appears in Noreta

    Scenario: Noreta starts after the agent
      Given a supported coding agent is already running
      When I start Noreta
      Then its session appears in Noreta


Feature: See recent sessions

  Rule: Inactive sessions expose their last activity

    Scenario: An inactive session is shown
      Given an inactive session exists
      When I view my sessions
      Then I see when its last activity occurred

  Rule: Recent work is available in the default view

    Scenario: A recently inactive session exists
      Given a session recently became inactive
      When I open Noreta
      Then the session is available in the default view

    Scenario: Recent sessions are ordered by last activity
      Given several inactive sessions have different last activity times
      When I view recent sessions
      Then the most recently active session appears first


Feature: Read a session

  Rule: Session history preserves conversational order

    Scenario: Open an inactive session
      Given an inactive session has a transcript
      When I open the session
      Then I see its messages in chronological order

  Rule: Agent activity has semantic presentation

    Scenario: A transcript contains a tool call
      Given a session contains a tool call
      When I read its transcript
      Then I can distinguish the tool call from conversation

    Scenario: A transcript contains a file diff
      Given a session contains a file diff
      When I read its transcript
      Then I see the change as a diff


Feature: Follow an active session

  Rule: An open transcript reflects new activity

    Scenario: The agent produces a message
      Given I am viewing an active session
      When the agent produces a new message
      Then the message appears in the transcript

    Scenario: An active session starts waiting for input
      Given I am viewing an active session executing a turn
      When its agent starts waiting for input
      Then the session is shown as active
      And the session is shown as waiting

    Scenario: An active session starts waiting for approval
      Given I am viewing an active session executing a turn
      When its agent starts waiting for approval
      Then the session is shown as active
      And the session is shown as waiting

    Scenario: The runtime becomes inactive
      Given I am viewing an active session
      When its runtime terminates
      Then the session is shown as inactive


Feature: Find a session

  Rule: Search covers session context and content

    Scenario Outline: Search sessions
      Given sessions exist
      When I search for <query>
      Then I see sessions matching <dimension>

      Examples:
        | query            | dimension    |
        | "rate limiter"   | message text |
        | "ai-labs"        | repository   |
        | "feature/noreta" | branch       |
        | "codex"          | agent        |

  Rule: Search covers sessions outside the recent history

    Scenario: Search finds a session outside the recent history
      Given a session outside the recent history contains "rate limiter"
      When I search for "rate limiter"
      Then I see that session in the results


Feature: Organize sessions

  Rule: Sessions can be grouped by working context

    Scenario: Group by repository
      Given sessions from several repositories exist
      When I group sessions by repository
      Then every session appears in exactly one repository group

    Scenario: Group by workspace
      Given sessions from several workspaces exist
      When I group sessions by workspace
      Then every session appears in exactly one workspace group

    Scenario: Group by agent
      Given sessions from several agents exist
      When I group sessions by agent
      Then every session appears in exactly one agent group

  Rule: Sessions can be filtered by their attributes

    Scenario: Filter active sessions
      Given working, waiting, idle, and inactive sessions exist
      When I filter by active state
      Then working, waiting, and idle sessions are shown
      And inactive sessions are not shown


Feature: Access older sessions

  Rule: Sessions remain available outside the recent history

    Scenario: Reveal sessions outside the recent history
      Given sessions outside the recent history exist
      When I choose to see sessions outside the recent history
      Then I can browse those sessions

  Rule: A session retains its historical working context

    Scenario: Its worktree has been deleted
      Given a session belongs to a worktree
      When that worktree is deleted
      Then the session remains associated with that worktree
      And the worktree is shown as no longer on disk

    Scenario: Open a session from a deleted worktree
      Given a session belongs to a deleted worktree
      When I open the session
      Then I can read its transcript
```
