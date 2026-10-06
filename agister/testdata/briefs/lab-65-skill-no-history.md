# The caller skill holds instructions only (LAB-65)

`agister/skills/agister/SKILL.md` is read by an agent using Agister in
some other repository. It carries text about how Agister was built, which
that agent does not need. Remove it; change nothing else in the skill's
instructions.

1. Delete the paragraph "This skill is for the agent that runs Agister.
   It is not a settings skill that Agister gives to the agents it starts
   (ADR-021)."
2. Remove every ADR citation in parentheses: `(ADR-006)`, `(ADR-012)`,
   `(ADR-018)`, `(ADR-013)`. Keep the sentence they end.
3. "Home's settings usually have:" — state it plainly, e.g. "Home's
   settings typically provide:" is still a hedge; say what the listing
   commands show and list the items as what to look for, without
   "usually".
4. In "Review a change", replace the sentences about "the repository that
   holds the Agister source" and `.agister/schemas/judgement.json` with
   one telling the caller where to read the judge's item fields from its
   own settings, using a command that exists (check `agister --help`;
   `agister process show review_judge` or `agister workflow show
   code_review`, whichever actually prints the output schema or its
   name). Keep the item fields and the per-ruling actions.
5. Keep the pointer to `agister --help`, the README and `docs/adr/` for
   detail.

The caller-skill guard test must still pass. Done when the repository's
verify command passes. List every file you changed.
