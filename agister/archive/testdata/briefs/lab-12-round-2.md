# LAB-12: round 2 review fixes

The review (run 20261001T073402Z-3a8acc) of this branch ruled these fixes. Make each as
written; change nothing else.

- **Advisor tests do not check the runtime's checkout.** In 
  TestAdvisorAnswersAQuestionFile, assert that the runtime cwd the fake 
  captured equals the recorded workspace and differs from the caller's 
  repository, following TestAgentCallEndToEnd (main_test.go:214).
- **Repository-wide advisor subtest inherits a 20-minute timeout.** Give 
  the repository-wide advisor invocation a test-only timeout of at most one 
  minute. Leave the production policy timeout as it is.
- **Compatibility guard accepts a nested allOf.** Reject allOf at every 
  depth and keep the root-only rule for anyOf. Change the nested-allOf 
  fixture to expect a rejection.

Tests are committed and deterministic: injected clock or timer, no
wall-time waits beyond a hang guard, no mutation or revert checks. Use the
quiet test commands from `agister/AGENTS.md`; report each with its exit
code and final line, and list every file you changed.
