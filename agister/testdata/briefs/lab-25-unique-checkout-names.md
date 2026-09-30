# LAB-25: concurrent checkouts race on git's worktree name

Every checkout and every verification copy
(`agister/internal/adapters/git/git.go`) is created at
`<tmp>/agister-checkout-*/workspace`. Git names a worktree's admin
directory after the path's basename, so concurrent `git worktree add`
calls in one repository (a workflow's fan-out nodes) race on
`.git/worktrees/workspace`. Seen failing a `code_review` node in
`TestRepositoryProcessesRunOnFakeRuntimes/workflow_code_review`:

    git worktree add --detach --quiet <tmp>/agister-checkout-3361389567/workspace 47783a07…:
    fatal: failed to read .git/worktrees/workspace/commondir: Undefined error: 0

Give every checkout and copy a basename no other one in the repository
can have, so their worktree admin directories never collide. Everything
that recognises or reaps a checkout by its path (e.g. the basename check
in `git.go`) must keep recognising both the new names and any left behind
under the old `workspace` name.

A regular test with a `t.TempDir()` repository proves: checkouts and
copies made at the same time get distinct worktree admin directories and
all succeed; a checkout left behind under the old name is still reaped.
No test may depend on timing to pass.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
