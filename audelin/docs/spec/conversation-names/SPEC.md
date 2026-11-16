# Name the far side from the conversation

Observer: the user, reading a recorded call's transcript and notes.

## Decided

- People on calls greet and address each other by name all the time
  ("Да, Василий, привет", "Женя, а у тебя?"). After the call, the notes
  model reads the whole transcript and names each far-side speaker it can
  from that evidence. This needs no call app, extension or calendar, so it
  works for every call Audelin records. Bot-free note takers such as Amanu
  and Granola name speakers the same way.
- Accepted evidence: the speaker introduces themselves; the speaker is
  addressed by name and answers; the speaker is referred to by name and
  then speaks as that person. A name only mentioned is not evidence.
- A speaker without such evidence keeps its label. Leaving a speaker
  unnamed is a good outcome; a wrong name is not.
- A name the call app showed (Zoom's tiles, the Telemost extension) wins
  over a name from the conversation. The conversation names only speakers
  the call app left unnamed.
- A name from the conversation is a suggestion. The transcript shows it as
  inferred from the conversation, distinct from a name the call app showed.
- Calendar invitees are not used.
- The notes use every name the transcript carries, from the call app and
  from the conversation, and write people mentioned by name in the
  conversation by those names. They still never invent a name.

```gherkin
Feature: Name the far side from the conversation

  Scenario: S-1 Notes use the names the call app showed
    Given the transcript names a far-side speaker from the call app
    When the call's notes are made
    Then I can read the notes calling that speaker by their name

  Scenario: S-2 A speaker addressed by name is named
    Given a far-side speaker is addressed by name and answers
    When the call's notes are made
    Then I can read that speaker's name in the transcript and the notes

  Scenario: S-3 A speaker who introduces themselves is named
    Given a far-side speaker says who they are
    When the call's notes are made
    Then I can read that speaker's name in the transcript and the notes

  Scenario: S-4 A name only mentioned names nobody
    Given a name is mentioned but nobody answers to it
    When the call's notes are made
    Then I can read every far-side speaker still under their label

  Scenario: S-5 Conflicting evidence names nobody
    Given the conversation suggests two names for one speaker
    When the call's notes are made
    Then I can read that speaker still under their label

  Scenario: S-6 The call app's name wins
    Given the call app named a far-side speaker
    And the conversation suggests another name for them
    When the call's notes are made
    Then I can read the call app's name for that speaker

  Scenario: S-7 A name from the conversation reads as inferred
    Given a far-side speaker was named from the conversation
    When I read the transcript
    Then I can tell that name was inferred from the conversation

  Scenario: S-8 People mentioned in the notes keep their names
    Given the conversation mentions people by name
    When the call's notes are made
    Then I can read those people by name in the notes
```
