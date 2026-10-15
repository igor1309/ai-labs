# settings/documents (docs/settings-implementation.md, steps 2 to 5;
# ADR-002, rules 1, 3 and 4) is pure (ADR-001): given a snapshot, each
# document's sources by kind and name, one slot per layer, and the
# problems of its files, it gives one document: a definition, or its
# problems.
  # The brief: a brief form, which checks a text's structure, never its
  # meaning (ADR-010, rule 5): its parts in order, and the template a
  # caller copies. Checking a text against it is not documents' work.

Feature: Documents gives a brief

  Scenario: A brief's fields
    Given the brief "a" has a home source:
      """
      schema: agister.brief/v1alpha1
      name: a
      parts:
        - {heading: "## Goal", required: true, reference: file}
        - {heading: "## Notes", required: false}
        - {heading: "## Open", required: true, reads: None.}
      template: |
        ## Goal

        ## Notes

        ## Open

        None.
      """
    When documents is asked for the brief "a"
    Then it gives the brief "a" with its parts, in the file's order:
      | heading  | required | reads | reference |
      | ## Goal  | yes      |       | file      |
      | ## Notes | no       |       |           |
      | ## Open  | yes      | None. |           |
    And its template, the template's text
    And each field's origin is "/home/.agister/briefs/a.yaml"
    And it has no problem

  Scenario: A brief needs its parts and its template
    Given the brief "a" has a home source of its schema and its name
    When documents is asked for the brief "a"
    Then there is no definition
    And it has exactly two problems: at "parts" and "template", each "it
      is missing"

  Scenario Outline: A brief's parts
    Given the brief "a" has a home source of a valid brief but for
      <fault>
    When documents is asked for the brief "a"
    Then there is no definition
    And it has a problem at "<field>": <message>

    Examples:
      | fault                                     | field               | message                                            |
      | the parts []                              | parts               | it names a part                                    |
      | a first part with no heading              | parts[0].heading    | it is missing                                      |
      | a first part headed "Goal"                | parts[0].heading    | it is a Markdown heading line, as "## Goal"        |
      | a second part headed as the first         | parts[1].heading    | it is also the heading of parts[0]                 |
      | a first part with no required             | parts[0].required   | it is missing                                      |
      | a first part whose required is "yes"      | parts[0].required   | it is a boolean, not a string                      |
      | a first part whose reference is "url"     | parts[0].reference  | it is "file"                                       |

  # The template is the form's own example: its headings are the parts',
  # each once, in the parts' order, so that the two cannot drift. A
  # template's heading is a line that is a part's heading.
  Scenario Outline: A brief's template has the parts' headings
    Given the brief "a" has parts headed "## Goal" and "## Open"
    And its template is <template>
    When documents is asked for the brief "a"
    Then there is no definition
    And it has a problem at "template": <message>

    Examples:
      | template                         | message                                         |
      | "## Goal\n"                      | it has the heading "## Open"                    |
      | "## Goal\n## Goal\n## Open\n"    | it has the heading "## Goal" once               |
      | "## Open\n## Goal\n"             | it has the heading "## Open" after "## Goal"    |
