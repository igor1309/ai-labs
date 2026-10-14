# LAB-63 review round 1: optionality has a test; the leftover kill is safe

Candidate: the branch head. code_review `20261005T125640Z-156a04` (its
judge was rate limited; the reviews are ruled on by hand) leaves two
fixes.

## 1. No test protects that the Go prompts are optional

Case: remove `optional: true` from `go_testing` in
`.agister/processes/implement.yaml`. Every test stays green, because both
prompts are present. In a repository without the prompt the call would
then be refused.

Wanted: a regular test beside `TestImplementersAreGivenTheGoPrompts`
(`agister/cmd/agister/repo_settings_test.go`), on the same fakes. For
each of the four implement processes, run the repository's real process
definition in settings that have neither `go-testing-seams` nor
`go-architecture` in any layer. Assert that the call completes, that the
record lists both as absent prompts, and that the agent's inputs have no
`go_testing` or `go_architecture`. Mark it as the other test is
(`t.Parallel()`, no real machinery).

## 2. `prompts/go-process-supervision.md` prescribes a kill that can hit a stranger

Under "What the child left running", the prompt says to SIGKILL the group
right after `Wait` returns. Once the leader is reaped and its group is
empty, the kernel may give that ID to an unrelated process group, and no
lock of ours prevents that. A kill that then succeeds hits a stranger and
is reported as leftovers. This contradicts the prompt's own "Prefer
leaving a process to killing a stranger".

Rewrite that bullet, and the one before it ("Signal the group only while
it is known to exist…") if needed, so the guidance is safe:

- Observe the leader's exit without reaping it: `waitid` with `WEXITED |
  WNOWAIT` (`golang.org/x/sys/unix.Waitid`). An unreaped leader keeps its
  ID, and so the group's, reserved.
- SIGKILL the group then. `ESRCH` or `EPERM` on a group whose only member
  is the zombie leader means nothing was left. Say which results mean
  leftovers and which do not, precisely, for Linux and macOS. If you are
  not certain of a platform's result, say that it must be checked by a
  contract test and do not assert it.
- Only then reap (`Wait`).
- Say plainly what a supervisor that kills after reaping risks.

Keep the prompt free of Agister, ADR, issue and package names. Bump its
version to 0.0.2. Do not change `gokit/supervisor`.

## Check

From `agister/`: `test -z "$(gofmt -l .)" && go vet ./... && go test -count=1 -timeout 1m ./...`.
`grep -rniE 'agister|ADR-|LAB-|gokit' prompts/go-*.md prompts/agent-cli-behaviour.md` prints nothing.

List every file you changed.
