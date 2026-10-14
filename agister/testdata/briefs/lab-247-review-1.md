# LAB-247 review 1: the four findings the review ruled fix

## Goal

`testdata/briefs/lab-247-goal.md`

## Covers

- 1, 2 and 6: the git boundary is read exactly; the submodule exception is the tracked root itself; the tests prove both with mixed writers.

## Acts on

Code review run `20261013T081657Z-ba361d`:

- 2#1 (major, fix): `Root` trims all whitespace from git's output, so a root whose name ends in a space or a tab resolves to the wrong path. `EvalSymlinks` then fails and the writer is refused. Remove only git's output terminator. Extend the real-git test with root names that end in spaces and tabs, asserting their exact canonical roots.
- 2#2 (major, fix): no test mixes an independent nested writer with a tracked-submodule writer, so a cache keyed wrongly (for example by the caller's key) would reuse one's answer for the other undetected. Add mixed cases, in both record orders, using directory-dependent stubs. Include a repeated directory and two distinct directories that share a root, to show that lookups are reused correctly.
- 3#1 (major, fix): resolving an absent, unrelated gitlink path (for example `libs/missing`, tracked but not checked out) returns an error before containment is checked, so a nested writer is refused. Skip a gitlink path that does not exist and so cannot contain the existing canonical root. Keep fail-closed for real lookup failures. Add a real-git Holder test asserting admission with an absent, unrelated gitlink.
- 5#1 (major, fix): the submodule exception also catches an independent git worktree whose directory lies beneath a tracked submodule. Goal criterion 2 names "a nested git root that the outer worktree's index tracks as a submodule": the root itself. Compare canonical roots for equality. Change the descendant-worktree assertions to expect admission. Align the port comment, `docs/adr/037-*.md`, `docs/reference/worktree-and-holds.md` and the skill's overlap paragraph with the indexed-root exception. ADR-037 is new in this change, so it is corrected here.

## Constraints

- Keep fail-closed: a real `Root` or index lookup failure still overlaps.
- Say in the notes what each test asserts.
- Do not commit.

## Open

None.
