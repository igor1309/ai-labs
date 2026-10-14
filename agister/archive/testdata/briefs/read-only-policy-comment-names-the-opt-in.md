# The read-only policy's comment names the service opt-in

Review (run 20261001T062924Z-f5b039) ruled one fix: the comment at the top
of `agister/examples/settings/policies/read-only.yaml` claims Codex
compatibility without its prerequisite. Add it: a process under this
policy runs on Codex only when the repository's service opts in to host
reads; under the shipped service it is still refused.

Comment only: no behaviour, test or seam change. Use the quiet test
commands from `agister/AGENTS.md`; report each with its exit code and
final line, and list every file you changed.
