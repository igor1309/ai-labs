# The command table names only flags the parser registers (LAB-65, D-17)

The owner decided D-17 in `agister/docs/decisions.md` (option A). Add a
test in `agister/internal/cli` that fails when an entry of `Commands()`,
or of `GlobalFlags()`, names a flag the parser's real FlagSet (`flags`)
does not register. Read the registrations from the FlagSet itself, not
from a list in the test. Show it can fail: include a case that feeds the
check a table with a flag the FlagSet lacks and expects it reported (give
the check a seam that takes the table, as the caller-skill guard's
self-test does).

Do not change the table, the parser or anything outside `internal/cli`
tests, unless the test finds a real mismatch; then fix the table.

Done when the repository's verify command passes. List every file you
changed.
