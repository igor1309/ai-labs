# core/inputs, a brief form (docs/run-implementation.md, "Inputs and
# progress"; ADR-010, rule 5): a text input checked against the forms it
# names, structure never meaning. A spy answers whether a path exists.
# The form "f": "## Goal" required, referring to a file; "## Notes"
# optional; "## Open" required, reading "None.".

Feature: A text input is checked against its brief forms

  Scenario Outline: A text takes the form, or is refused saying why
    Given the input "brief" names the form "f", and the path "g.md"
      exists
    When it resolves to the text <text>
    Then it <ends>

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

  Scenario: A text that takes none of its forms says what each lacks
    Given the input "brief" names the forms "f" and "e", "e" requiring
      "## Intent"
    When it resolves to the text "x"
    Then it is refused, failed, class "refused", naming for "f" its
      parts "## Goal" and "## Open" missing, and for "e" "## Intent"
