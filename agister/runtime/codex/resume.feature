# runtime/codex, a resumed turn (docs/run-implementation.md,
# "Continuation"; ADR-004, rule 5). A spy answers in place of the
# supervisor (ADR-009, rule 3); the schema's folder is a temporary
# directory.

Feature: The codex wrapper resumes a session

  Scenario: A turn given a session runs exec resume
    When codex runs the message "m" with the option "workspace-write",
      the model "gpt-6.1-sol", the schema "{}" and the session "s1"
    Then the arguments are "exec", "resume", "--json",
      "--skip-git-repo-check", "--config", "sandbox_mode=\"workspace-write\"",
      "--config", "approval_policy=\"never\"", "--ignore-user-config",
      "--ignore-rules", "--model", "gpt-6.1-sol", "--output-schema", a
      file holding "{}", "s1" and "-"; it is given the text "m"
    And the file is gone once the turn has returned
