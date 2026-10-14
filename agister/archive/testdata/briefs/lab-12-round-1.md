# LAB-12: round 1 review fixes

The review (run 20261001T071515Z-df04b7) of this branch ruled these fixes. Make each as
written; change nothing else.

- **Advice schema accepts answer=decision with decision=null.** Tie the 
  answer discriminator to the payload in .agister/schemas/advice.json: 
  decision requires an object and an empty reason; owner requires null and a 
  nonempty reason. Add schema tests for both valid variants and for 
  mismatched payloads.
- **Advisor tests validate schema-generated output against the same 
  schema.** Add deterministic tests against the repository advice schema 
  using fixed decision and owner payloads, plus missing-field and 
  unexpected-field cases, through the existing validator.
- **Advisor test does not assert the read-only sandbox.** In 
  TestAdvisorAnswersAQuestionFile, inspect the fake runtime's captured argv 
  (provider.jsonl) and assert --sandbox read-only.
- **New advisor test inherits the 20-minute production timeout.** Pass a 
  test-only --timeout of at most one minute in the advisor test invocation; 
  leave production settings unchanged.

Tests are committed and deterministic: injected clock or timer, no
wall-time waits beyond a hang guard, no mutation or revert checks. Use the
quiet test commands from `agister/AGENTS.md`; report each with its exit
code and final line, and list every file you changed.
