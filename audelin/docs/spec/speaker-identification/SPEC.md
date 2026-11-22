# Accept supported speaker identities

Observer: the caller applying optional identities to notes.

## Decided

- Only requested known labels with unique entries are accepted; malformed JSON or missing required fields fails the attempt, enabling root fallback.
- Names require an exact quote/time that occurs in the transcript and is either the label's own self-introduction, or another speaker's line addressing the label by name (a word sharing the name's first three letters) that the label answers next. Merely mentioning a name or matching an invitee is insufficient. Ambiguous, conflicting or unsupported claims retain original labels; one name claimed for two labels names neither.
- A label carrying a name in parentheses, `Them 1 (Анна)`, was named by the call app and keeps that name.
- Transcript bytes remain unchanged; root checkpoints accepted mapping before notes. Evidence checks reduce guessing but cannot prove semantic truth; prompts and adversarial fixtures must also be evaluated.

```gherkin
Feature: Accept supported speaker identities

  Scenario: S-1 Accept supported name
    Given a requested label introduces itself in the transcript
    When I validate matching quoted evidence
    Then I can use its supported name in notes

  Scenario: S-2 Keep unknown identity
    Given a requested label cannot be identified
    When I validate the response
    Then I can keep its original label

  Scenario: S-3 Reject mention as identity
    Given a label only mentions another person
    When a response proposes that name
    Then I keep the original label

  Scenario: S-4 Reject conflicting identities
    Given evidence gives conflicting names for one label
    When I validate the response
    Then I keep the original label

  Scenario: S-5 Reject invented evidence
    Given response evidence does not occur at the claimed time and label
    When I validate the response
    Then I cannot apply the proposed name

  Scenario: S-7 Accept a label addressed by name that answers
    Given another speaker addresses a label by name
    And that label speaks next
    When I validate matching quoted evidence
    Then I can use that name in notes

  Scenario: S-8 Keep the call app's name
    Given a label carries the call app's name
    When a response proposes another name
    Then I keep the call app's name

  Scenario: S-6 Reject malformed structure
    Given the response is malformed JSON
    When I validate it
    Then I can report invalid output for fallback
```
