---
date: 2026-10-22
model: claude-opus-5-5
description: "Call delete — removing a whole call from the calls list"
---

# Call delete — spec

## Oracle

[The user spec](../SPEC.md), the client; Screen 4 (hover, confirm delete) in
[the design](../../design/README.md); [mvp.md](../../mvp.md) § Controls.

## Decided

Gaps closed by the agent (2026-10-22); the owner may overturn any.

1. Deleting moves the call's folder to the macOS Trash (S-3): a mistaken
   confirm can still be undone from the Trash.
2. A call that is recording offers no Удалить (S-5): Стоп comes first, and
   deleting the folder being written would lose the call mid-call.

## Observer

The user: the owner, or an agent running the app, in the calls list.

## Behaviour

```gherkin
Feature: The user deletes a whole call

  Scenario: S-1 Delete asks first
    Given a stopped call in the calls list
    When the user presses its Удалить
    Then the user can confirm deleting the whole call

  Scenario: S-2 Cancelling a delete
    Given the user is asked to confirm deleting a call
    When the user cancels
    Then the user can still find the call in the calls list

  Scenario: S-3 Delete removes the whole call
    Given the user is asked to confirm deleting a call
    When the user confirms
    Then the user can no longer find the call in the calls list
    And the user can find its folder in the Trash

  Scenario: S-4 Deleting a call that is catching up
    Given a stopped call whose text is still catching up
    When the user deletes it and confirms
    Then the user can no longer find the call in the calls list

  Scenario: S-5 A recording call cannot be deleted
    Given a recording is running
    When the user hovers its call in the calls list
    Then the user cannot delete it
```
