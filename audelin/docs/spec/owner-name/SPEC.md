# Name the user in call notes

Observer: the user, reading a recorded call's notes.

## Decided

- **The notes call the user by name, not "Me".** Notes written from a
  transcript labelled `Me` call the user «Me» or invent a role when nobody
  says the user's name aloud, as in most 1:1s; who did what is right either
  way. Amanu names the user the same way before it writes notes.
- **The name is the one Zoom last showed for the user, else the Mac
  account's full name.** Neither needs the user to type anything; the
  Zoom name is what colleagues see, so it matches how they address the user.
- **The name is written in the notes' language,** declined in Russian, the
  way the conversation would say it, not copied in another script.
- **Only the notes change.** Live text, the transcript file and the call
  view keep marking the user's lines as theirs, as now; they are a record
  of who spoke, read by the user, who needs no name.
- **Notes already made keep the name they were made with;** notes made
  later use the current name.
- **Without any name the notes are made as before,** never with an
  invented name.

```gherkin
Feature: Name the user in call notes

  Scenario: S-1 Notes call me by name
    Given nobody said my name during the call
    When the call's notes are made
    Then I can read my name, never "Me", where the notes mean me

  Scenario: S-2 What I did stays mine
    Given I took on a task during the call
    When the call's notes are made
    Then I can read that task under my name

  Scenario: S-3 My name in the notes' language
    Given the call was in Russian
    When the call's notes are made
    Then I can read my name in Cyrillic, declined as the sentence needs

  Scenario: S-4 The Mac account's name without a Zoom name
    Given Zoom never showed my name
    When the call's notes are made
    Then I can read my Mac account's full name in the notes

  Scenario: S-5 The transcript still marks my lines as mine
    Given the call's notes were made with my name
    When I read the call's transcript
    Then I can read my lines marked as mine, as before

  Scenario: S-6 Earlier notes keep their name
    Given notes were made while Zoom showed one name for me
    And Zoom later showed another
    When I read those notes
    Then I can read the name they were made with

  Scenario: S-7 No name, no invented name
    Given neither Zoom nor the Mac account gives a name
    When the call's notes are made
    Then I can read notes that name nobody in my place
```
