# strict-tdd → fold into tdd-interactive

- strict-tdd/SKILL.md is 30 lines: RED/GREEN/REFACTOR rules + no-junk scope lock.
- tdd-interactive/SKILL.md is 317 lines with the same cycle plus reviewer gates and a references/ directory.
- Every rule in strict-tdd (compile errors ≠ RED, GREEN minimum, no scaffolding, no-junk lock) belongs inside tdd-interactive's phase descriptions. Reviewer gates can be a mode toggle (auto-continue vs human-review-gated), which strict-tdd already references.
- Action: absorb strict-tdd content into tdd-interactive; delete strict-tdd; update CLAUDE.md reference (## Strict TDD Mode currently points to dev-skills/public/strict-tdd/SKILL.md).
- Risk: trigger condition differs — strict-tdd fires on "TDD/RED/GREEN" keywords, tdd-interactive on explicit invocation. Preserve the keyword trigger when merging.

## MY Qs
`tdd-interactive` is interactive by name and nature. It is long and detailed exactly for the reason to make agent interactively follow TDD in a pair-programming-style session.
- what if it defines two roles - doer and reviewer - and allows switching reviewer between human and AI? auto-continue then become ai-review-gated
- better criteria of done, like "is it a compiler failure or failure for a right reason: complier pass but assertion fails"