Apply strict TDD to the current task: invoke the **strict-tdd** skill, or **tdd-interactive** when the user wants reviewer gates at RED and after REFACTOR.

**Key reminders:**
- Two-level process: inner R-G-R cycle for individual tests, outer cycle runs ALL tests before commit
- One test at a time, minimal implementation, commit only after ALL tests pass

Arguments: $ARGUMENTS (the feature/functionality to implement using TDD)
