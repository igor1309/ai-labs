# Notes generation — naming the user in the request

Observer: SummaryJobs, through its make-notes port, and the root, which
builds the speaker-identification request from the same lines. The attempt
is `../notes-generation/SPEC.md`; this spec adds the user's lines and name.
Oracle: `../owner-name/SPEC.md` S-1 to S-3, S-7 and `../../ARCHITECTURE.md`
§ The user's name in notes.

## Decided

- **Lines arrive marked as the user's or not;** this adapter never learns
  the transcript's labels for the user.
- **Given a name, the user's lines carry it and the request says the user
  recorded the call under it.** With the name alone, models wrote it in
  Latin letters in Russian notes; with that one line they wrote it in the
  notes' language (`../../research/owner-naming.md`).
- **Without a name the request is today's,** byte for byte.
- **The named lines are offered on their own,** so the speaker request
  reads the same transcript as the notes request.

```gherkin
Feature: Naming the user in the request

  Scenario: S-1 The user's lines carry the name
    Given lines marked as the user's and the name "Игорь"
    When notes are asked for
    Then I can rely on the runtime reading those lines under "Игорь"

  Scenario: S-2 The request says who recorded the call
    Given the name "Игорь"
    When notes are asked for
    Then I can rely on the runtime being told "Игорь" recorded the call

  Scenario: S-3 Other lines keep their labels
    Given far-side lines labelled "Them 1 (Анна)"
    When notes are asked for with a name
    Then I can rely on those lines keeping their labels

  Scenario: S-4 No name, today's request
    Given no name
    When notes are asked for
    Then I can rely on the runtime getting the request it got before

  Scenario: S-5 The same lines for speakers
    Given lines and a name
    When the named lines are read on their own
    Then I can read the lines the notes request carries
```
