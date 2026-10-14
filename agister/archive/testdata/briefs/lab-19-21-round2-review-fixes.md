# LAB-19, LAB-20, LAB-21: round 2 review fixes

Three rulings from the review; confirm each before fixing.

- **Prove inspection limits through the real resolver.** Add a normal test
  that builds the resolver with `NewResolver`, inspects process `p`, and
  asserts the process view's effective timeout, permissions and permission
  plan (`repository.read` and `repository.search` granted,
  `repository.diff` withheld). Keep the existing test with the external
  double.
- **Give resolved runtime metadata a Calls-owned type.** `ResolvedCall`
  still uses the shared `RuntimeIdentity` type. Define a Calls-owned type
  holding `Contract`, `Version` and `Resume`, and translate those fields
  at the boundary (where `callResolution` builds `ResolvedCall`) instead of
  assigning the shared type.
- **Clean up even when cancellation registration fails.** In
  `TestCallsCancelThroughTheCancelsTheyDeclare`, give the blocking runner
  its own release channel owned by the test, and register the cleanup
  before `Submit`, so the runner is released and the call joined even when
  the missing-callback assertion fails.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
