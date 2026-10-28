# Brief form rules generated into the skill from shipped settings.

Feature: The skill states the rules of every brief form home ships

  Scenario: The shipped skill is what the forms render
    Given home/brief-forms and skills/agister/SKILL.md as committed
    When the forms are rendered
    Then the skill's text between its markers is the rendering, byte for
      byte

  Scenario: A new form fails the test until it is regenerated
    Given a temp directory holding the forms "goal" and "step" as home
      ships them, a third form "spike" with the required part "## Ask",
      and a skill rendered from the first two
    When the skill is checked against the forms
    Then it fails, naming the form "spike"
    When "go run ./cmd/skillforms <forms> <skill>" runs on them
    Then the check passes, and the skill names the forms in the order
      "goal", "spike", "step"

  Scenario: Regenerating is deterministic and touches only the section
    Given a skill with text before and after its markers
    When the generator runs twice
    Then both runs write the same bytes, and the text outside the markers
      is unchanged

  Scenario: Each part's rule is rendered from its settings
    Given the form "f" with "## Goal" required, referring to a file;
      "## Notes" optional; "## Open" required, reading "None."
    When it is rendered
    Then it reads:
      """
      ### `f`

      | Part       | Required | Rule                                  |
      | ---        | ---      | ---                                   |
      | `## Goal`  | yes      | names an existing file in back quotes |
      | `## Notes` | no       |                                       |
      | `## Open`  | yes      | reads `None.`                         |
      """

  Scenario Outline: What cannot be rendered is an error, and writes nothing
    Given <state>
    When the generator runs
    Then it exits 1 naming <names>, and the skill is unchanged

    Examples:
      | state                                    | names                       |
      | a form whose part has no heading         | the form's file and problem |
      | a skill with no begin marker             | the marker missing          |
      | a skill with the end marker before begin | the markers out of order    |
