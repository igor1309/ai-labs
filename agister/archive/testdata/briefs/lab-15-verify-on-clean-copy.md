# LAB-15: verify what is delivered, in a clean copy

A call with `verify` delivers `changes.patch`: the patch from its base to
the checkout's content identity, which leaves out ignored files. Verify
today runs in the agent's live checkout (`agister/internal/app/verify.go`),
so a pass can rest on a file the patch does not carry.

Case: the base ignores `*.log` and has no `new.log`. The agent creates
`new.log`; verify runs `test -f new.log` and passes; the call completes
with an empty patch; the same command fails on the base plus that patch.

## The change

Each verification attempt runs the command in a fresh checkout of the base
with the attempt's patch applied, not in the live checkout:

- The attempt's identity and patch are taken from the live checkout as now.
- A clean copy is made of the base with that patch applied, and its
  identity must equal the attempt's identity; if it does not, the call
  fails as the capture failing does today.
- The command runs in the clean copy. A run that changes the clean copy's
  content fails, as a run changing the checkout fails today.
- A failing run goes back to the agent as a repair, as today; the agent
  keeps working in its live checkout.
- The clean copy is removed after every attempt, on every path, and a reap
  after a killed CLI removes one left behind, as it does the call's own
  checkout.
- With a pass on the clean copy, the delivered patch is exactly what was
  checked: drop what the live-checkout pass needed and this makes
  redundant, such as rebuilding the patch in `collectChanges` to compare
  identities, if nothing else relies on it.

Keep the existing contracts' style: new collaborator roles go behind
interfaces declared where they are used, with test doubles, so a regular
test proves each point above. One test must be the case above: an ignored
file the agent created that the check depends on makes the attempt fail.

Update comments and `agister/docs` text that say verify runs in the call's
checkout. Leave ADR files unchanged.

Use the quiet test commands from `agister/AGENTS.md`; report each with its
exit code and final line, and list every file you changed.
