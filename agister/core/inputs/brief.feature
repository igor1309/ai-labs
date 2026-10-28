# core/inputs, a brief form: a text input checked against the forms it
# names, structure never meaning. A spy answers whether a path exists.
# The form "f": "## Goal" required, referring to a file; "## Notes"
# optional; "## Open" required, reading "None.".

Feature: A text input is checked against its brief forms

  Scenario Outline: A text takes the form, or is refused saying why
    Given the input "brief" names the form "f", and the path "g.md"
      exists
    When it resolves to the text <text>
    Then it <ends>; where refused, its reason starts "it takes none of
      its forms; closest \"f\": " and holds the fault text given

    Examples:
      | text                                                    | ends                                                    |
      | "## Goal\n\n`g.md`\n\n## Open\n\nNone."                 | resolves                                                |
      | "## Goal\n\n`g.md`\n\n## Notes\n\n## Open\n\nNone."     | resolves                                                |
      | "## Goal\n\n`g.md`"                                     | is refused: part "## Open" is missing                   |
      | "## Goal\n\n## Open\n\nNone."                           | is refused: part "## Goal" is empty                     |
      | "## Goal\n\ng.md\n\n## Open\n\nNone."                   | is refused: part "## Goal" names no file in back quotes |
      | "## Goal\n\n`h.md`\n\n## Open\n\nNone."                 | is refused: part "## Goal": "h.md" does not exist       |
      | "## Goal\n\n`g.md`\n\n## Open\n\nSome."                 | is refused: part "## Open" must read "None."            |
      | "## Goal\n\n`g.md`\n\n## Goal\n\nx\n\n## Open\n\nNone." | is refused: part "## Goal" appears 2 times              |
      | "## Goal\n\n`g.md`\n\n```\n## Open\n```\n"              | is refused: part "## Open" is missing                   |

  Scenario: A text needs to take one of its forms
    Given the input "brief" names the forms "f" and "e", "e" requiring
      "## Intent"
    When it resolves to a text of the form "f"
    Then it resolves

  Scenario: A text that takes none of its forms names the closest form's
    faults, and counts the others'
    Given the input "brief" names the forms "f" and "e", "e" requiring
      "## Intent"
    When it resolves to the text "x"
    Then it is refused, failed, class "refused", reading: it takes none
      of its forms; closest "e": part "## Intent" is missing; other
      forms: "f" 2 faults

  Scenario Outline: The closest form has the fewest faults, the first
    declared winning a tie
    Given the input "brief" names the forms <forms>
    When it resolves to a text <faults>
    Then the refusal names <closest> closest, lists its faults alone,
      and reads "other forms: <others>"

    Examples:
      | forms         | faults                            | closest | others                    |
      | "a", "b"      | with 3 faults of "a" and 1 of "b" | "b"     | "a" 3 faults              |
      | "a", "b"      | with 2 faults of each             | "a"     | "b" 2 faults              |
      | "a", "b", "c" | with 2 of "a", 1 of "b", 1 of "c" | "b"     | "a" 2 faults, "c" 1 fault |

  Scenario: A form alone that the text does not take has no other forms
    Given the input "brief" names the form "f" alone
    When it resolves to the text "x"
    Then the refusal reads: it takes none of its forms; closest "f":
      part "## Goal" is missing, part "## Open" is missing

  Scenario: Paths failing to tell is the error, not a fault
    Given the input "brief" names the forms "f" and "e", and paths fail
      for "g.md"
    When it resolves to a text whose "## Goal" names "g.md"
    Then it fails with paths' error, naming the part and the path, and
      no form is named closest

  Scenario: A text is checked against forms without resolving an input
    Given the forms "f" and "e" and the path "g.md" exists
    When the resolver checks a text of the form "e" against them
    Then it gives the form "e", and no source is asked for a value
