# LAB-12: an advice schema Codex accepts

`.agister/schemas/advice.json` ties the answer to its payload with a
root-level `oneOf`. Live Codex refuses it before the turn starts (run
20261001T072821Z-fc4fe9): "Invalid schema for response_format
'codex_output_schema': In context=(), 'oneOf' is not permitted."

Change the output's shape so the tie holds without a combinator Codex's
strict structured outputs refuse: no `oneOf` anywhere, no combinator at
the root. For example, one required property whose value is `anyOf` two
objects, each closed (`additionalProperties: false`, every property
required): the owner variant (a constant kind and a nonempty reason) and
the decision variant (a constant kind and the record's fields). Keep the
record's fields as ADR-007 rules 2 and 3 name them.

Follow the change through: `prompts/advisor.md` and
`agister/docs/decisions.md` where they describe the output; the fixed
payload tests (`TestAdviceSchemaTiesTheAnswerToItsPayload`), still
covering both valid variants, mismatched payloads, missing and unexpected
fields; the advisor test on the fakes; the fake output generator
(`fakeoutput`) if the new shape needs it (and drop its root-`oneOf`
handling if nothing uses it any more).

Add a normal test that the repository's schemas given to Codex use no
combinator Codex refuses (`oneOf` anywhere; `anyOf`/`allOf` at the root),
so this cannot come back unnoticed. Do not call live Codex.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
