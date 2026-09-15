---
date: 2026-09-15
description: Top 7 Noreta user stories for the read-only Mac MVP,
  written as Gherkin scenarios
model: gpt-5.6-sol
---

# Noreta — User Stories

``` gherkin
Feature: Coding agent sessions

  Scenario: See active sessions
    Given I have coding agent sessions on my Mac
    When I open the app
    Then I see which sessions are currently active

  Scenario: See recent sessions
    Given I have inactive coding agent sessions
    When I open the app
    Then I see my recent sessions ordered by their last activity

  Scenario: Read a session
    Given a coding agent session exists
    When I open the session
    Then I see its history

  Scenario: Follow an active session
    Given I am viewing an active session
    When new activity occurs
    Then I see the updated session

  Scenario: Find a session
    Given I have many coding agent sessions
    When I search for a session
    Then I see sessions matching my search

  Scenario: Organize sessions
    Given I have sessions across different agents and work contexts
    When I choose how to group or filter them
    Then I see the corresponding view

  Scenario: Access older sessions
    Given I have sessions outside the recent history
    When I choose to view older sessions
    Then I can browse and open them with their historical working context
```
