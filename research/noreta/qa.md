---
date: 2026-09-15
model: gpt-5.6-sol
description: "Top 7 Noreta user stories for the read-only Mac MVP, written as Gherkin features"
---

# Noreta — QA

```gherkin
Feature: See active sessions

  Rule: A session with a live runtime is active

    Scenario: A working session is active
      Given a session has a live runtime executing a turn
      When I view my sessions
      Then the session is shown as active

    Scenario: An idle session is active
      Given a session has a live runtime waiting for input
      When I view my sessions
      Then the session is shown as active

  Rule: A session without a live runtime is inactive

    Scenario: A runtime terminates
      Given an active session exists
      When its runtime terminates
      Then the session becomes inactive

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

  Rule: Inactive sessions expose when work last happened

    Scenario: An inactive session is shown
      Given an inactive session exists
      When I view my sessions
      Then I see when its last message occurred

  Rule: Recent work is available in the default view

    Scenario: A recently inactive session exists
      Given a session recently became inactive
      When I open Noreta
      Then the session is available in the default view


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

    Scenario: The runtime becomes inactive
      Given I am viewing an active session
      When its runtime terminates
      Then the session is shown as inactive


Feature: Find a session

  Rule: Search covers session context and content

    Scenario Outline: Search sessions
      Given indexed sessions exist
      When I search for <query>
      Then I see sessions matching <dimension>

      Examples:
        | query            | dimension    |
        | "rate limiter"   | message text |
        | "ai-labs"        | repository   |
        | "feature/noreta" | branch       |
        | "codex"          | agent        |

  Rule: Search covers sessions outside the default view

    Scenario: Search finds an old session
      Given an old session contains "rate limiter"
      When I search for "rate limiter"
      Then I see that session in the results


Feature: Organize sessions

  Rule: Sessions can be grouped by working context

    Scenario: Group by repository
      Given sessions from several repositories exist
      When I group sessions by repository
      Then I see a group for each repository

    Scenario: Group by workspace
      Given sessions from several workspaces exist
      When I group sessions by workspace
      Then I see a group for each workspace

    Scenario: Group by agent
      Given sessions from several agents exist
      When I group sessions by agent
      Then I see a group for each agent

  Rule: Sessions can be filtered by their attributes

    Scenario: Filter active sessions
      Given active and inactive sessions exist
      When I filter by active state
      Then I see the active sessions


Feature: Access older sessions

  Rule: Sessions remain available beyond the default view

    Scenario: Reveal older sessions
      Given sessions older than the default view exist
      When I choose to see older sessions
      Then I can browse those sessions

  Rule: A session retains its historical working context

    Scenario: Its worktree has been deleted
      Given a session belongs to a worktree
      When that worktree is deleted
      Then the session retains its historical workspace identity

    Scenario: Open a session from a deleted worktree
      Given a session belongs to a deleted worktree
      When I open the session
      Then I can read its transcript
```