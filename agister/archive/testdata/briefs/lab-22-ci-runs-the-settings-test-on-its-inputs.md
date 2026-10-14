# LAB-22: CI runs the repository-settings test when its inputs change

A review finding, never ruled on. Confirm it before fixing; if it does not
hold, say so and change nothing.

The `agister` path filter in `.github/workflows/ci.yml` covers Go files,
module files, examples and research policies, but not the inputs of the
repository-settings test (`agister/cmd/agister/repo_settings_test.go`):
the repository's `.agister/**` settings and the `prompts/**` files those
settings name. A PR changing only those skips `agister-core`, so the test
meant to check them does not run.

Add those inputs to the filter. Check what else the test reads from the
repository, and add only what it actually reads.

A YAML filter has no Go test. Check the workflow still parses (e.g. with
the tool CI already uses, or a YAML parser), and say how you checked it.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
