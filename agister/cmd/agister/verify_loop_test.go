package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git/gittest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/schema"
	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
	"github.com/igor1309/ai-labs/agister/internal/app"
	runtimecomposition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
)

// The verification loop (ADR-002; where the command runs, ADR-025 rule 5)
// in the worktrees of temporary repositories of the fake of git, with the
// real command runner and evidence store; a few tests keep real git, where
// their claim is the content and patches git makes. The runtime is a
// scripted fake whose turns write files in the worktree, and
// the verification command is a fixture driven by those files: by default
// it prints the file state and passes when it says "pass". The shell the
// runner starts for it is a fake run in process (inProcessCommands); what
// the real one does is the supervisor's contract (command_test.go).

const passWhenStateSaysPass = "cat state; grep -qx pass state"

// step is one scripted turn: it may change the worktree and says how the
// turn ended.
type step func(t *testing.T, request app.TurnRequest) domain.Turn

// scripted is a runtime that plays its steps in order, one per turn.
type scripted struct {
	t        *testing.T
	mu       sync.Mutex
	steps    []step
	requests []app.TurnRequest
	// toolCalls is whether the runtime reports its tool calls; reports,
	// when set, is what turn n, counted from 0, reports before its step:
	// it returns once the turn may end. Both are set before the first call.
	toolCalls bool
	reports   func(ctx context.Context, sink app.EventSink, n int)
}

func (s *scripted) Identity(context.Context) (app.RuntimeIdentity, error) {
	return app.RuntimeIdentity{Contract: "fake/1", Version: "1.0.0", Resume: true, CostLimit: true, ToolCalls: s.toolCalls}, nil
}

func (*scripted) Admit(app.TurnStart) *domain.Error { return nil }

func (s *scripted) RunTurn(ctx context.Context, request app.TurnRequest, sink app.EventSink) domain.Turn {
	s.mu.Lock()
	n := len(s.requests)
	s.requests = append(s.requests, request)
	s.mu.Unlock()
	if s.reports != nil {
		s.reports(ctx, sink, n)
	}
	if n >= len(s.steps) {
		return domain.Turn{Status: domain.Failed, Error: domain.Fault(domain.ClassRuntimeError, "no turn %d scripted", n+1)}
	}
	return s.steps[n](s.t, request)
}

func (s *scripted) turns() []app.TurnRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]app.TurnRequest(nil), s.requests...)
}

// noProblems is the check the resolver reads: no document has a problem.
type noProblems struct{}

func (noProblems) Check(context.Context) (app.ResolverChecked, error) {
	return app.ResolverChecked{}, nil
}

// goneProcesses finds every process an earlier in-place run recorded gone.
type goneProcesses struct{}

func (goneProcesses) Reap(context.Context, string) (app.BorrowReaping, error) {
	return app.BorrowReapGone, nil
}

// fakeRuntimes builds the scripted runtime for the fake adapter.
type fakeRuntimes struct{ runner *scripted }

func (f fakeRuntimes) Runner(string, string) (app.TurnRunner, error) { return f.runner, nil }

func (f fakeRuntimes) Identity(ctx context.Context, _, _ string) (app.RuntimeIdentity, error) {
	return f.runner.Identity(ctx)
}

// turn is a completed turn with valid output, in session sess-1, costing
// one dollar.
func turn(mutate ...func(*domain.Turn)) domain.Turn {
	cost, in, out := 1.0, int64(10), int64(5)
	result := domain.Turn{
		Status: domain.Completed, Output: json.RawMessage(`{"done":true}`), ProviderSessionID: "sess-1",
		CostUSD: &cost, Usage: &domain.Usage{InputTokens: &in, OutputTokens: &out},
	}
	for _, m := range mutate {
		m(&result)
	}
	return result
}

// writes is a step that writes files in the worktree and ends as turn does.
func writes(files map[string]string, mutate ...func(*domain.Turn)) step {
	return func(t *testing.T, request app.TurnRequest) domain.Turn {
		for name, content := range files {
			if err := os.WriteFile(filepath.Join(request.Cwd, name), []byte(content), 0o600); err != nil {
				t.Error(err)
			}
		}
		return turn(mutate...)
	}
}

// state is a step that writes the state file the fixture command reads.
func state(content string, mutate ...func(*domain.Turn)) step {
	return writes(map[string]string{"state": content + "\n"}, mutate...)
}

// verifySettings is what differs between the tests' processes.
type verifySettings struct {
	command     string
	timeout     string // verify.timeout; 20s when empty
	maxAttempts int    // 3 when zero
	policy      string // appended to the policy
	// setup is the process's workspace.setup, in flow style; none when
	// empty. A call ignores it (ADR-025 rule 3).
	setup string
	// workspace is the settings' workspace.yaml; none when empty.
	workspace string
}

type loopHarness struct {
	t    *testing.T
	repo string
	home string
	// left lists the checkouts and clean copies not yet removed.
	left     func() []string
	runner   *scripted
	commands *recordingCommands
	setup    *recordingSetupCommands
	calls    *app.Calls
	runs     *app.Runs
	// hosted holds the harness's calls; wait awaits their Done.
	hosted *app.Hosted
	store  fsruns.Store
}

// recordingCommands is the real command runner, noting what each run was
// asked for.
type recordingCommands struct {
	app.VerifyCommands
	mu   sync.Mutex
	seen []app.CommandRequest
}

func (c *recordingCommands) Run(ctx context.Context, request app.CommandRequest, started func(string) error) app.CommandResult {
	c.mu.Lock()
	c.seen = append(c.seen, request)
	c.mu.Unlock()
	return c.VerifyCommands.Run(ctx, request, started)
}

func (c *recordingCommands) requests() []app.CommandRequest {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]app.CommandRequest(nil), c.seen...)
}

// recordingSetupCommands keeps setup requests while preserving command injection.
type recordingSetupCommands struct {
	app.SetupCommands
	mu   sync.Mutex
	seen []app.SetupCommandRequest
}

func (c *recordingSetupCommands) Run(ctx context.Context, request app.SetupCommandRequest, started func(string) error) app.SetupCommandResult {
	c.mu.Lock()
	c.seen = append(c.seen, request)
	c.mu.Unlock()
	return c.SetupCommands.Run(ctx, request, started)
}
func (c *recordingSetupCommands) requests() []app.SetupCommandRequest {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]app.SetupCommandRequest(nil), c.seen...)
}

// seams are the harness's collaborators a test replaces; each left zero is
// the harness's own.
type seams struct {
	// changes captures changes and names content, for the call and its
	// verification alike.
	changes app.CallChanges
	// clock tells the time, for the call and its verification alike.
	clock app.CallClock
	// commands runs the verification command.
	commands app.VerifyCommands
	// groups numbers the process groups of the commands run in process,
	// verification's and setup's alike: a test that gives commands of its
	// own (inProcessCommands) gives the Groups they number from.
	groups *supervisortest.Groups
}

// newLoop is a repository of the fake of git with a base revision,
// settings for process impl with the verify given, and a Calls over them
// and the scripted steps.
func newLoop(t *testing.T, settings verifySettings, steps ...step) *loopHarness {
	return newLoopWith(t, seams{}, settings, steps...)
}

// newLoopWith is newLoop with the seams given.
func newLoopWith(t *testing.T, with seams, settings verifySettings, steps ...step) *loopHarness {
	t.Helper()
	return loopOn(t, fakeLoopGit(t), with, settings, steps...)
}

// newGitLoop is newLoop in a real git repository, for the tests whose
// claim is what git makes of the content and patches.
func newGitLoop(t *testing.T, settings verifySettings, steps ...step) *loopHarness {
	return newGitLoopWith(t, seams{}, settings, steps...)
}

// newGitLoopWith is newGitLoop with the seams given.
func newGitLoopWith(t *testing.T, with seams, settings verifySettings, steps ...step) *loopHarness {
	t.Helper()
	return loopOn(t, realLoopGit(t), with, settings, steps...)
}

// loopGit is the git a harness runs on: its repository, whose base
// revision on main has state "base" and ignores *.log, and the git-backed
// ports over it.
type loopGit struct {
	repo       string
	workspaces app.CallWorkspaces
	content    app.CallChanges
	copies     app.VerifyCopies
	revision   app.InputProvider
	// state reads the worktree an in-place call borrows.
	state app.BorrowWorktrees
	// left lists the checkouts and clean copies not yet removed.
	left func() []string
	// given gives the git to every composition over home.
	given func(home string)
}

// fakeLoopGit is the harness's git over a fake.
func fakeLoopGit(t *testing.T) loopGit {
	t.Helper()
	repo, err := filepath.EvalSymlinks(tempDir(t))
	if err != nil {
		t.Fatal(err)
	}
	base := map[string]string{"state": "base\n", ".gitignore": "*.log\n"}
	for name, text := range base {
		write(t, filepath.Join(repo, name), text)
	}
	fake := gittest.New(tempDir(t))
	fake.Record(repo).Commit("main", base)
	return loopGit{
		repo: repo, workspaces: fake, content: fake, copies: fake, revision: fake.Revision(), state: fake,
		left: func() []string {
			left, err := fake.Left()
			if err != nil {
				t.Fatal(err)
			}
			return left
		},
		given: func(home string) { gitThrough(t, home, fake) },
	}
}

// realLoopGit is the harness's git over a real repository.
func realLoopGit(t *testing.T) loopGit {
	t.Helper()
	repo, err := filepath.EvalSymlinks(tempDir(t))
	if err != nil {
		t.Fatal(err)
	}
	gitCmd(t, repo, "init", "--quiet", "--initial-branch=main")
	gitCmd(t, repo, "config", "user.email", "test@example.com")
	gitCmd(t, repo, "config", "user.name", "Test")
	gitCmd(t, repo, "config", "maintenance.auto", "false")
	write(t, filepath.Join(repo, "state"), "base\n")
	write(t, filepath.Join(repo, ".gitignore"), "*.log\n")
	gitCmd(t, repo, "add", ".")
	gitCmd(t, repo, "commit", "--quiet", "-m", "base")
	workspaces := git.NewWorkspaces(git.NewWorktrees(tempDir(t)))
	return loopGit{
		repo: repo, workspaces: workspaces, content: workspaces, copies: workspaces, revision: git.Revision{}, state: git.Workspaces{},
		left:  func() []string { return strings.Split(gitCmd(t, repo, "worktree", "list"), "\n")[1:] },
		given: func(home string) { onRealGit(t, home) },
	}
}

// loopOn is newLoopWith over the git given.
func loopOn(t *testing.T, over loopGit, with seams, settings verifySettings, steps ...step) *loopHarness {
	t.Helper()
	if with.changes == nil {
		with.changes = over.content
	}
	if with.clock == nil {
		with.clock = system.Clock{}
	}
	// A turn or a command that ends by itself waits on no time: its
	// timeout, graces and staleness limits are on a clock that never moves.
	still := clocktest.NewClock(time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC))
	if with.groups == nil {
		with.groups = supervisortest.NewGroups()
	}
	if with.commands == nil {
		with.commands = runtimecomposition.Commands{Supervisor: inProcessCommands(with.groups, still.Timer)}
	}
	repo := over.repo

	if settings.command == "" {
		settings.command = passWhenStateSaysPass
	}
	if settings.timeout == "" {
		settings.timeout = "20s"
	}
	if settings.maxAttempts == 0 {
		settings.maxAttempts = 3
	}
	defs := tempDir(t)
	for name, text := range map[string]string{
		"service.toml": `schema = "agister.service/v1alpha1"
max_timeout = "1h"
max_attempts = 1
max_verify_attempts = 3
permissions = ["repository.read", "repository.write", "process.execute"]
writing = ["repository.write"]
state_reaching = []
`,
		"runtimes/fake.yaml": `schema: agister.runtime/v1alpha1
name: fake
adapter: fake
contract: fake/1
primitives:
  select: any
  items:
    Edit: {grants: [repository.read, repository.write], verified: ["1."]}
`,
		"agents/impl.toml": `schema = "agister.agent/v1alpha1"
name = "impl"
runtime = "fake"
model = "m"
model_family = "fam"
command = "fake"
session = "resumable"
`,
		"policies/impl.yaml": `schema: agister.process-policy/v1alpha1
name: impl
timeout: 1m
tools: {allow: [repository.read, repository.write]}
workspace: {access: read-write, scope: candidate}
` + settings.policy,
		"schemas/done.json": `{"type":"object","required":["done"],"properties":{"done":{"type":"boolean"}}}`,
		"processes/impl.yaml": fmt.Sprintf(`schema: agister.process/v1alpha1
name: impl
type: process
uses: agent:impl
policy: process-policy:impl
input:
  instruction: Make the check pass.
  params:
    candidate: {default: HEAD}
  values:
    candidate_revision: {source: git.revision, rev: "${param.candidate}"}
workspace:
  checkout: candidate_revision
  clean: true
%soutput:
  format: json
  schema: done
  require_valid: true
verify:
  command: %s
  timeout: %s
  max_attempts: %d
  instruction: The check failed. Fix the cause, not the check.
`, setupLine(settings.setup), strconv.Quote(settings.command), settings.timeout, settings.maxAttempts),
		"workspace.yaml": settings.workspace,
	} {
		if text == "" {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(filepath.Join(defs, name)), 0o700); err != nil {
			t.Fatal(err)
		}
		write(t, filepath.Join(defs, name), text)
	}

	h := &loopHarness{t: t, repo: repo, home: tempDir(t), left: over.left, runner: &scripted{t: t, steps: steps}, commands: &recordingCommands{VerifyCommands: with.commands}, setup: &recordingSetupCommands{SetupCommands: runtimecomposition.SetupCommands{Supervisor: inProcessCommands(with.groups, still.Timer)}}}
	h.store = fsruns.Store{Dir: filepath.Join(h.home, "runs"), Appends: fsruns.NewAppends()}
	over.given(h.home)
	runtimes := fakeRuntimes{runner: h.runner}
	h.hosted = app.NewHosted()
	var definitions app.ResolverDefinitions = fsdefs.Store{Dir: defs}
	preparer := app.NewPreparer(with.changes, h.setup, with.clock)
	borrower := app.NewBorrower(app.BorrowAdapters{
		Locks:     system.WorktreeLocks{Dir: filepath.Join(h.home, "locks", "in-place")},
		Worktrees: over.state, Content: with.changes, Runs: h.store, Writers: goneProcesses{},
	}, app.BorrowPreparer{Preparer: preparer})
	h.calls = app.NewCalls(
		app.NewResolver(definitions, runtimes, schema.Validator{}, noProblems{}), runtimes,
		map[string]app.InputProvider{"git.revision": over.revision},
		over.workspaces, with.changes, preparer, borrower, app.NewVerifier(with.changes, over.copies, h.commands, with.clock), app.NewRecoverer(with.clock), schema.Validator{},
		h.store, h.store, with.clock, still.Timer, system.IDs{}, h.home, h.hosted,
	)
	// Observing a call hosted here waits on its appends, never on a poll.
	h.runs = app.NewRuns(h.store, h.store, h.hosted, unpolled(t), 0)
	return h
}

// inProcessCommands is the command runner, the bash it starts a fake run
// in process: no command is started as a process. Its groups are numbered
// by groups and its waits are on timer.
func inProcessCommands(groups *supervisortest.Groups, timer timer) supervisor.Commands {
	return supervisor.Commands{Starter: runtimetest.InProcess{Groups: groups}, Timer: timer}
}

// unpolled is Observe's poll timer for tests whose runs all run in the
// test's process, which are never polled: it fails the test if started.
func unpolled(t testing.TB) app.RunsTimer {
	return func(time.Duration) (<-chan time.Time, func()) {
		t.Error("a run hosted in the test's process was polled")
		return make(chan time.Time), func() {}
	}
}

// setupLine is the process's workspace.setup line for setup, in flow
// style; none when empty.
func setupLine(setup string) string {
	if setup == "" {
		return ""
	}
	return "  setup: " + setup + "\n"
}

func (h *loopHarness) submit(request contract.CallRequest) string {
	h.t.Helper()
	request.Process, request.Cwd = "impl", h.repo
	id, err := h.calls.Submit(context.Background(), request)
	if err != nil {
		h.t.Fatal(err)
	}
	return id
}

// wait returns the run's record once the call is done; the checkout and
// every clean copy are gone by then.
func (h *loopHarness) wait(id string) domain.Record {
	h.t.Helper()
	<-h.hosted.Done(id)
	record, state, err := h.store.Get(context.Background(), id)
	if err != nil || state != domain.StateFinished || record.Result == nil {
		h.t.Fatalf("run %s: %s, %v", id, state, err)
	}
	if left := h.left(); len(left) != 0 {
		h.t.Fatalf("checkout left: %v", left)
	}
	return record
}

func (h *loopHarness) call(request contract.CallRequest) domain.Record {
	h.t.Helper()
	return h.wait(h.submit(request))
}

// outcome is a finished run's status and class; message is its error's.
func outcome(record domain.Record) (domain.Status, domain.Class, string) {
	if record.Result.Error == nil {
		return record.Result.Status, "", ""
	}
	return record.Result.Status, record.Result.Error.Class, record.Result.Error.Message
}

// runsOf lists the attempts that ran the command.
func runsOf(record domain.Record) []*domain.CommandRun {
	var ran []*domain.CommandRun
	for _, attempt := range record.Attempts {
		if attempt.Run != nil {
			ran = append(ran, attempt.Run)
		}
	}
	return ran
}

// compact is JSON output as one line; the record stores it indented.
func compact(raw json.RawMessage) string {
	var out bytes.Buffer
	_ = json.Compact(&out, raw)
	return out.String()
}

func expect(t *testing.T, record domain.Record, status domain.Status, class domain.Class, message string) {
	t.Helper()
	gotStatus, gotClass, gotMessage := outcome(record)
	if gotStatus != status || gotClass != class || !strings.Contains(gotMessage, message) {
		t.Fatalf("result %s/%s (%s), want %s/%s (%s)", gotStatus, gotClass, gotMessage, status, class, message)
	}
}

// A first run that passes completes the node with no repair turn.
func TestVerifyFirstPassMakesNoRepairTurn(t *testing.T) {
	t.Parallel()
	h := newLoop(t, verifySettings{}, state("pass"))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Completed, "", "")
	if turns := h.runner.turns(); len(turns) != 1 || len(record.Attempts) != 1 || !record.Attempts[0].Run.Passed {
		t.Fatalf("turns %d, attempts %+v", len(turns), record.Attempts)
	}
	if compact(record.Result.Output) != `{"done":true}` || *record.Result.Cost.USD != 1 {
		t.Fatalf("result = %+v", record.Result)
	}
}

// A failing run is given back to the agent in the same session and the
// same worktree, with the instruction, the command, its exit status and
// its output; the repair turn is validated and the command runs again. The
// output is the latest turn's; usage and cost sum every turn.
func TestVerifyFailingRunIsRepairedInTheSameSessionAndWorktree(t *testing.T) {
	t.Parallel()
	h := newLoop(t, verifySettings{}, state("one"), state("pass", func(turn *domain.Turn) {
		turn.Output = json.RawMessage(`{"done":true,"turn":2}`)
	}))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Completed, "", "")
	turns := h.runner.turns()
	if len(turns) != 2 {
		t.Fatalf("turns = %d", len(turns))
	}
	first, repair := turns[0], turns[1]
	if first.ResumeSessionID != "" || repair.ResumeSessionID != "sess-1" || repair.Cwd != first.Cwd ||
		repair.Instruction != first.Instruction || string(repair.OutputSchema) != string(first.OutputSchema) {
		t.Fatalf("first %+v\nrepair %+v", first, repair)
	}
	for _, want := range []string{"The check failed. Fix the cause, not the check.", passWhenStateSaysPass, "exit code 1", "one\n", "4 bytes"} {
		if !strings.Contains(repair.Prompt, want) {
			t.Fatalf("repair prompt misses %q:\n%s", want, repair.Prompt)
		}
	}
	result := record.Result
	if compact(result.Output) != `{"done":true,"turn":2}` || *result.Cost.USD != 2 || *result.Usage.InputTokens != 20 ||
		result.Session.ProviderSessionID != "sess-1" || *result.Timing.TurnMS > result.Timing.WallMS {
		t.Fatalf("result = %+v", result)
	}
	if ran := runsOf(record); len(ran) != 2 || ran[0].Passed || !ran[1].Passed {
		t.Fatalf("attempts = %+v", record.Attempts)
	}
}

// The last attempt failing ends the node as budget exhausted, with the
// latest turn's valid output on record (LAB-39).
func TestVerifyAttemptsRunOut(t *testing.T) {
	t.Parallel()
	h := newLoop(t, verifySettings{}, state("one"), state("two"), state("three"), state("pass"))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Failed, domain.ClassBudgetExhausted, "attempt 3 of 3 failed (exit code 1)")
	if len(h.runner.turns()) != 3 || len(runsOf(record)) != 3 || compact(record.Result.Output) != `{"done":true}` {
		t.Fatalf("turns %d, output %s, attempts %+v", len(h.runner.turns()), record.Result.Output, record.Attempts)
	}
}

// A run never repeats on content already checked: a repair that changes
// nothing, or returns to an earlier state, ends the loop without running,
// and the evidence says why.
func TestVerifyStopsWithoutProgress(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		steps   []step
		turns   int
		message string
	}{
		{"nothing changed", []step{state("one"), state("one")}, 2, "no progress: attempt 2's content is what attempt 1 checked"},
		{"A, B, then A again", []step{state("A"), state("B"), state("A"), state("pass")}, 3, "no progress: attempt 3's content is what attempt 1 checked"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := newLoop(t, verifySettings{}, c.steps...)
			record := h.call(contract.CallRequest{})
			expect(t, record, domain.Failed, domain.ClassBudgetExhausted, c.message)
			last := record.Attempts[len(record.Attempts)-1]
			if len(h.runner.turns()) != c.turns || len(runsOf(record)) != c.turns-1 || last.Run != nil || !strings.Contains(last.Stopped, c.message) {
				t.Fatalf("turns %d, attempts %+v", len(h.runner.turns()), record.Attempts)
			}
		})
	}
}

// The same exit status and output as the run before ends the loop, though
// the content changed.
func TestVerifyStopsOnTheSameFailureTwice(t *testing.T) {
	t.Parallel()
	h := newLoop(t, verifySettings{command: `grep -qx pass state || { echo "not yet"; exit 1; }`}, state("one"), state("two"), state("pass"))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Failed, domain.ClassBudgetExhausted, "no progress: attempt 2 failed as attempt 1 did")
	if len(h.runner.turns()) != 2 || len(runsOf(record)) != 2 || record.Attempts[1].Identity == record.Attempts[0].Identity {
		t.Fatalf("turns %d, attempts %+v", len(h.runner.turns()), record.Attempts)
	}
}

// A run that changes the content of the worktree it runs in fails
// whatever its exit status, and the evidence keeps what it changed.
func TestVerifyRunThatChangesTheContentItChecksFails(t *testing.T) {
	t.Parallel()
	h := newLoop(t, verifySettings{command: "grep -qx pass state && echo ran > ran.txt", maxAttempts: 1}, state("pass"))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Failed, domain.ClassBudgetExhausted, "attempt 1 of 1 failed (exit code 0; the run changed the content it checked")
	ran := runsOf(record)
	if len(ran) != 1 || ran[0].Passed || ran[0].After == "" || ran[0].After == record.Attempts[0].Identity || ran[0].AfterChanges == nil {
		t.Fatalf("attempts = %+v", record.Attempts)
	}
	patch := read(t, filepath.Join(h.home, "runs", record.ID, ran[0].AfterChanges.Path))
	if !strings.Contains(patch, "+++ b/ran.txt") {
		t.Fatalf("run changes:\n%s", patch)
	}
}

// Files a run writes in the worktree that the repository ignores are not
// content: such a run passes, its content unchanged.
//
// Contract test: the composition's worktrees and patches in a real git
// repository; turns and commands are fakes run in process.
func TestVerifyRunThatWritesOnlyIgnoredFilesPasses(t *testing.T) {
	t.Parallel()
	h := newGitLoop(t, verifySettings{command: "grep -qx pass state && echo ran > ran.log", maxAttempts: 1}, state("pass"))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Completed, "", "")
	if ran := runsOf(record); len(ran) != 1 || !ran[0].Passed || ran[0].After != "" || ran[0].AfterChanges != nil {
		t.Fatalf("attempts = %+v", record.Attempts)
	}
}

// blocks never ends on its own: only a kill ends it, so a timeout or a
// cancel is its one way out and no load can let it finish first. Run in
// process, it waits for its group to be signalled.
const blocks = "tail -f /dev/null"

// A run that exceeds verify.timeout is killed and interrupts the node,
// well before the call's own timeout: the message names verify.timeout,
// not the call's.
func TestVerifyRunTimeout(t *testing.T) {
	t.Parallel()
	// The run's timeout passes on the command runner's clock once the run
	// waits on it.
	clock := clocktest.NewClock(time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC))
	groups := supervisortest.NewGroups()
	commands := runtimecomposition.Commands{Supervisor: inProcessCommands(groups, clock.Timer)}
	h := newLoopWith(t, seams{commands: commands, groups: groups}, verifySettings{command: blocks, timeout: "1s"}, state("one"))
	id := h.submit(contract.CallRequest{Timeout: "30s"})
	// Should the test fail first, the cleanup ends the call, and the
	// command with it.
	cleanupRun(t, h.runs, h.hosted, id)
	clock.Started(time.Second)
	clock.Advance(time.Second)
	record := h.wait(id)
	expect(t, record, domain.Interrupted, domain.ClassTimeout, "attempt 1's run exceeded verify.timeout 1s")
	if ran := runsOf(record); len(ran) != 1 || !ran[0].TimedOut {
		t.Fatalf("attempts %+v", record.Attempts)
	}
}

// The call's timeout bounds the whole loop: a run gets only the time the
// turns before it left.
func TestVerifyCallTimeoutBoundsTheLoop(t *testing.T) {
	t.Parallel()
	// The turn uses 59 of the call's 60 seconds on the call's clock, which
	// leaves the run one second of its 20. The turn's own timeout is on a
	// clock that never moves, and the run's second passes on the call's.
	clock := clocktest.NewClock(time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC))
	groups := supervisortest.NewGroups()
	commands := runtimecomposition.Commands{Supervisor: inProcessCommands(groups, clock.Timer)}
	slow := state("one", func(*domain.Turn) { clock.Advance(59 * time.Second) })
	h := newLoopWith(t, seams{clock: clock, commands: commands, groups: groups}, verifySettings{command: blocks, timeout: "20s"}, slow)
	id := h.submit(contract.CallRequest{})
	cleanupRun(t, h.runs, h.hosted, id)
	clock.Started(time.Second)
	clock.Advance(time.Second)
	record := h.wait(id)
	expect(t, record, domain.Interrupted, domain.ClassTimeout, "the call's timeout passed during attempt 1's run")
	events, _, err := h.store.Events(context.Background(), record.ID, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range events {
		if event.Kind == "VERIFY_STARTED" && event.Data["timeout"] != "1s" {
			t.Fatalf("the run was given %v", event.Data["timeout"])
		}
	}
	// The command runner itself was given that second, not the run's 20.
	if requests := h.commands.requests(); len(requests) != 1 || requests[0].Timeout != time.Second {
		t.Fatalf("command requests %+v", requests)
	}
}

// blockedCommand is a verification command that never ends on its own:
// it puts its group on record, closes started, and blocks until its
// context ends, when it closes cancelled and returns as cancelled. It runs
// once.
type blockedCommand struct {
	started, cancelled chan struct{}
}

// blockedRef is the group a blockedCommand records: no supervisor's, so
// no cleanup signals it.
const blockedRef = "in-process:blocked"

func newBlockedCommand() *blockedCommand {
	return &blockedCommand{started: make(chan struct{}), cancelled: make(chan struct{})}
}

func (c *blockedCommand) Run(ctx context.Context, _ app.CommandRequest, started func(string) error) app.CommandResult {
	if err := started(blockedRef); err != nil {
		return app.CommandResult{Error: err.Error()}
	}
	close(c.started)
	<-ctx.Done()
	close(c.cancelled)
	return app.CommandResult{Cancelled: true}
}

// Cancelling the call during a run ends the command, whose group the
// record names while it runs. That the whole group is killed is the
// supervisor's contract (command_test.go); here the command sees its
// context end.
func TestVerifyCancellationEndsTheCommand(t *testing.T) {
	t.Parallel()
	command := newBlockedCommand()
	h := newLoopWith(t, seams{commands: command}, verifySettings{}, state("one"))
	id := h.submit(contract.CallRequest{})
	// Should the test fail first, the cleanup ends the call, and the
	// command with it.
	cleanupRun(t, h.runs, h.hosted, id)
	<-command.started
	running, _, err := h.store.Get(context.Background(), id)
	if err != nil || running.Effects == nil || running.Effects.Command == nil || running.Effects.Command.Ref != blockedRef {
		t.Fatalf("record effects %+v, %v", running.Effects, err)
	}
	if err := h.runs.Cancel(context.Background(), id); err != nil {
		t.Fatal(err)
	}
	record := h.wait(id)
	expect(t, record, domain.Interrupted, domain.ClassCancelled, "cancelled during attempt 1's run")
	select {
	case <-command.cancelled:
	default:
		t.Fatal("the call finished before its command saw its context end")
	}
}

// A repair turn that fails, returns invalid output or reports another
// session ends the node with that turn's status and class.
func TestVerifyRepairTurnThatFailsEndsTheNode(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		repair  step
		status  domain.Status
		class   domain.Class
		message string
	}{
		{"failed", state("two", func(turn *domain.Turn) {
			turn.Status, turn.Error = domain.Failed, domain.Fault(domain.ClassRateLimited, "429")
		}), domain.Failed, domain.ClassRateLimited, "429"},
		{"invalid output", state("pass", func(turn *domain.Turn) { turn.Output = json.RawMessage(`{}`) }),
			domain.Failed, domain.ClassInvalidOutput, "done"},
		{"another session", state("pass", func(turn *domain.Turn) { turn.ProviderSessionID = "sess-2" }),
			domain.Failed, domain.ClassRuntimeError, `resumed session sess-1, but the runtime reported session "sess-2"`},
		// A repair that reports no session is not known to be in the call's,
		// though its content passes.
		{"no session", state("pass", func(turn *domain.Turn) { turn.ProviderSessionID = "" }),
			domain.Failed, domain.ClassRuntimeError, `resumed session sess-1, but the runtime reported session ""`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := newLoop(t, verifySettings{}, state("one"), c.repair)
			record := h.call(contract.CallRequest{})
			expect(t, record, c.status, c.class, c.message)
			if len(record.Attempts) != 2 || record.Attempts[1].Run != nil || record.Attempts[1].Number != 2 || record.Attempts[1].Stopped == "" || len(runsOf(record)) != 1 {
				t.Fatalf("attempts = %+v", record.Attempts)
			}
			if record.Result.Output != nil || *record.Result.Cost.USD != 2 {
				t.Fatalf("result = %+v", record.Result)
			}
		})
	}
}

// A resumed turn costs and uses what it added to its session's running
// totals, from the totals Agister recorded on the session's latest turn on
// any run: in A, then B continues A, then C continues A, C's baseline is
// B's turn, not A's. A session with no recorded totals leaves them unknown.
func TestContinuationsCountFromTheSessionsLatestRecordedTurn(t *testing.T) {
	t.Parallel()
	// Each turn reports the session's running totals, as Claude Code does
	// for cost and Codex for usage, a second after it started.
	clock := clocktest.NewClock(time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC))
	totals := func(usd float64, in int64) step {
		return state("pass", func(turn *domain.Turn) {
			clock.Advance(time.Second)
			turn.Session = &domain.SessionTotals{CostUSD: &usd, Usage: &domain.Usage{InputTokens: &in}}
		})
	}
	own := func(t *testing.T, record domain.Record, usd float64, in int64) {
		t.Helper()
		expect(t, record, domain.Completed, "", "")
		if turn := record.Turn; *turn.CostUSD != usd || *turn.Usage.InputTokens != in || *record.Result.Cost.USD != usd || *record.Result.Usage.InputTokens != in {
			t.Fatalf("run %s: turn cost %v, usage %+v; call %+v, %+v", record.ID, *turn.CostUSD, turn.Usage, record.Result.Cost, record.Result.Usage)
		}
	}
	h := newLoopWith(t, seams{clock: clock}, verifySettings{}, totals(1, 10), totals(3, 30), totals(3.5, 45))
	a := h.call(contract.CallRequest{})
	own(t, a, 1, 10)
	b := h.call(contract.CallRequest{Continue: a.ID})
	own(t, b, 2, 20)
	c := h.call(contract.CallRequest{Continue: a.ID})
	own(t, c, 0.5, 15)
	if c.Turn.SessionBefore == nil || *c.Turn.SessionBefore.CostUSD != 3 || *c.Turn.SessionBefore.Usage.InputTokens != 30 {
		t.Fatalf("C's baseline = %+v", c.Turn.SessionBefore)
	}

	// A's turn reported no running totals: nothing to count from.
	h = newLoopWith(t, seams{clock: clock}, verifySettings{}, state("pass"), totals(3, 30))
	a = h.call(contract.CallRequest{})
	b = h.call(contract.CallRequest{Continue: a.ID})
	expect(t, b, domain.Completed, "", "")
	if b.Turn.SessionBefore != nil || b.Turn.CostUSD != nil || b.Turn.Usage.InputTokens != nil || b.Result.Cost.Source != domain.CostUnknown {
		t.Fatalf("turn %+v, cost %+v", b.Turn, b.Result.Cost)
	}
}

// Every turn shares the call's cost limit: a repair gets what is left, and
// an earlier turn with an unknown cost blocks repair.
func TestVerifyUnknownCostBlocksRepair(t *testing.T) {
	t.Parallel()
	h := newLoop(t, verifySettings{policy: "max_cost_usd: 5\n"}, state("one", func(turn *domain.Turn) { turn.CostUSD = nil }), state("pass"))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Failed, domain.ClassBudgetExhausted, "a turn's cost is unknown, so the cost limit 5 cannot be enforced")
	if len(h.runner.turns()) != 1 || record.Result.Cost.Source != domain.CostUnknown {
		t.Fatalf("turns %d, cost %+v", len(h.runner.turns()), record.Result.Cost)
	}

	spend := func(usd float64) func(*domain.Turn) { return func(turn *domain.Turn) { turn.CostUSD = &usd } }
	h = newLoop(t, verifySettings{policy: "max_cost_usd: 5\n"}, state("one", spend(1.5)), state("pass", spend(2)))
	expect(t, h.call(contract.CallRequest{}), domain.Completed, "", "")
	if turns := h.runner.turns(); len(turns) != 2 || *turns[0].MaxCostUSD != 5 || *turns[1].MaxCostUSD != 3.5 {
		t.Fatalf("cost limits sent: %v, %v", *turns[0].MaxCostUSD, turns[1].MaxCostUSD)
	}
}

// A cost limit already spent, exactly or beyond, leaves nothing for a repair
// turn, though attempts are left.
func TestVerifySpentBudgetBlocksRepair(t *testing.T) {
	t.Parallel()
	for _, usd := range []float64{5, 6} {
		t.Run(fmt.Sprintf("$%g of $5", usd), func(t *testing.T) {
			t.Parallel()
			h := newLoop(t, verifySettings{policy: "max_cost_usd: 5\n"}, state("one", func(turn *domain.Turn) { turn.CostUSD = &usd }), state("pass"))
			record := h.call(contract.CallRequest{})
			expect(t, record, domain.Failed, domain.ClassBudgetExhausted, "the cost limit 5 is spent")
			if len(h.runner.turns()) != 1 || len(runsOf(record)) != 1 {
				t.Fatalf("turns %d, attempts %+v", len(h.runner.turns()), record.Attempts)
			}
		})
	}
}

// Verification runs only after a valid turn: never after one that failed
// or returned invalid output, which ends the node as it would without
// verify.
func TestVerifyNeverRunsAfterAFailedOrInvalidTurn(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		turn  step
		class domain.Class
	}{
		{"failed", state("pass", func(turn *domain.Turn) {
			turn.Status, turn.Error = domain.Failed, domain.Fault(domain.ClassRuntimeError, "boom")
		}), domain.ClassRuntimeError},
		{"invalid", state("pass", func(turn *domain.Turn) { turn.Output = json.RawMessage(`{}`) }), domain.ClassInvalidOutput},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			marker := filepath.Join(tempDir(t), "ran")
			h := newLoop(t, verifySettings{command: "touch " + marker}, c.turn)
			record := h.call(contract.CallRequest{})
			expect(t, record, domain.Failed, c.class, "")
			if _, err := os.Stat(marker); !errors.Is(err, os.ErrNotExist) || len(record.Attempts) != 0 || len(h.runner.turns()) != 1 {
				t.Fatalf("the command ran (%v), attempts %+v", err, record.Attempts)
			}
		})
	}
}

// A turn that reports no session cannot be repaired.
func TestVerifyTurnWithoutSessionCannotBeRepaired(t *testing.T) {
	t.Parallel()
	h := newLoop(t, verifySettings{}, state("one", func(turn *domain.Turn) { turn.ProviderSessionID = "" }), state("pass"))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Failed, domain.ClassBudgetExhausted, "attempt 1 failed and its turn reported no session to repair in")
	if len(h.runner.turns()) != 1 || len(runsOf(record)) != 1 {
		t.Fatalf("turns %d, attempts %+v", len(h.runner.turns()), record.Attempts)
	}
}

// lossy is a capture that leaves out extra.txt.
type lossy struct{ git.Workspaces }

func (l lossy) Changes(ctx context.Context, dir, from, to string) ([]byte, error) {
	patch, err := l.Workspaces.Changes(ctx, dir, from, to)
	sections := strings.Split(string(patch), "diff --git ")
	kept := sections[:1]
	for _, section := range sections[1:] {
		if !strings.HasPrefix(section, "a/extra.txt ") {
			kept = append(kept, section)
		}
	}
	return []byte(strings.Join(kept, "diff --git ")), err
}

// The captured changes, applied to the pinned base, rebuild exactly the
// content that passed: edited, new and binary files alike. A capture that
// leaves content out prevents completion (ADR-025 rule 5).
//
// Contract test: the composition's worktrees and patches in a real git
// repository; turns and commands are fakes run in process.
func TestVerifyCaptureReproducesThePassingContent(t *testing.T) {
	t.Parallel()
	agent := func(t *testing.T, request app.TurnRequest) domain.Turn {
		write(t, filepath.Join(request.Cwd, "extra.txt"), "new\n")
		if err := os.WriteFile(filepath.Join(request.Cwd, "data.bin"), []byte{0, 1, 2, 0xff}, 0o600); err != nil {
			t.Error(err)
		}
		return state("pass")(t, request)
	}
	h := newGitLoop(t, verifySettings{}, agent)
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Completed, "", "")
	artifacts := record.Result.Artifacts
	if len(artifacts) != 1 || artifacts[0].Name != "changes.patch" {
		t.Fatalf("artifacts = %+v", artifacts)
	}
	rebuild := filepath.Join(tempDir(t), "rebuild")
	gitCmd(t, h.repo, "worktree", "add", "--quiet", "--detach", rebuild, "main")
	defer gitCmd(t, h.repo, "worktree", "remove", "--force", rebuild)
	gitCmd(t, rebuild, "apply", "--binary", filepath.Join(h.home, "runs", record.ID, artifacts[0].Path))
	gitCmd(t, rebuild, "add", "--all")
	if tree := gitCmd(t, rebuild, "write-tree"); tree != record.Attempts[0].Identity {
		t.Fatalf("the patch rebuilds %s, the passing content is %s", tree, record.Attempts[0].Identity)
	}

	h = newGitLoopWith(t, seams{changes: lossy{}}, verifySettings{}, agent)
	record = h.call(contract.CallRequest{})
	expect(t, record, domain.Failed, domain.ClassInternal, "the captured changes do not rebuild the content that passed")
	if len(record.Result.Artifacts) != 0 {
		t.Fatalf("artifacts = %+v", record.Result.Artifacts)
	}
}

// A pass proves the worktree, ignored state included (ADR-025 rule 5),
// where LAB-15's clean copy proved only the patch: the base ignores *.log
// and has no new.log; the agent creates new.log, and the check that needs
// it passes in the worktree, though the patch cannot carry it. A file the
// patch carries passes the same check, and the patch holds it.
//
// Contract test: the composition's worktrees and patches in a real git
// repository; turns and commands are fakes run in process.
func TestVerifyChecksTheWorktreeIgnoredStateIncluded(t *testing.T) {
	t.Parallel()
	h := newGitLoop(t, verifySettings{command: "test -f new.log", maxAttempts: 1}, writes(map[string]string{"new.log": "made\n"}))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Completed, "", "")
	if ran := runsOf(record); len(ran) != 1 || ran[0].Dir != h.repo || len(record.Result.Artifacts) != 0 {
		t.Fatalf("attempts %+v, artifacts %+v", record.Attempts, record.Result.Artifacts)
	}

	h = newGitLoop(t, verifySettings{command: "test -f new.txt", maxAttempts: 1}, writes(map[string]string{"new.txt": "made\n"}))
	record = h.call(contract.CallRequest{})
	expect(t, record, domain.Completed, "", "")
	if artifacts := record.Result.Artifacts; len(artifacts) != 1 || !strings.Contains(read(t, filepath.Join(h.home, "runs", record.ID, artifacts[0].Path)), "+++ b/new.txt") {
		t.Fatalf("artifacts = %+v", artifacts)
	}
}

// Every attempt is evidence: the command, where and how it ran, its
// bounded output with the size and digest of the whole, the session, the
// number, the content checked, and the turn's changes, each kept before the
// next turn starts. runs show displays them.
func TestVerifyEvidenceForEveryAttempt(t *testing.T) {
	t.Parallel()
	var h *loopHarness
	// A repair turn sees the attempts before it recorded, with their changes.
	recorded := func(want int, next step) step {
		return func(t *testing.T, request app.TurnRequest) domain.Turn {
			entries, _ := os.ReadDir(filepath.Join(h.home, "runs"))
			id := entries[0].Name()
			running, _, err := h.store.Get(context.Background(), id)
			if err != nil || len(running.Attempts) != want || running.Attempts[want-1].Changes == nil {
				t.Errorf("before turn %d: attempts %+v, %v", want+1, running.Attempts, err)
			} else if _, err := os.Stat(filepath.Join(h.home, "runs", id, running.Attempts[want-1].Changes.Path)); err != nil {
				t.Errorf("before turn %d: %v", want+1, err)
			}
			return next(t, request)
		}
	}
	h = newLoop(t, verifySettings{}, state("one"), recorded(1, state("two")), recorded(2, state("pass")))
	if r := agisterInput(t, "yes\n", h.home, h.repo, "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Completed, "", "")
	if len(record.Attempts) != 3 {
		t.Fatalf("attempts = %+v", record.Attempts)
	}
	identities := map[string]bool{}
	for i, attempt := range record.Attempts {
		ran := attempt.Run
		want := []string{"one", "two", "pass"}[i]
		sum := sha256.Sum256([]byte(want + "\n"))
		if attempt.Number != i+1 || attempt.Session != "sess-1" || attempt.Turn.ProviderSessionID != "sess-1" || attempt.Identity == "" || ran == nil ||
			ran.Command != passWhenStateSaysPass || ran.Dir != h.repo || ran.Exit.Code == nil || (*ran.Exit.Code == 0) != (want == "pass") ||
			ran.Output.Head != want+"\n" || ran.Output.Bytes != int64(len(want)+1) || ran.Output.SHA256 != hex.EncodeToString(sum[:]) ||
			ran.StartedAt.IsZero() || ran.FinishedAt.Before(ran.StartedAt) || ran.Passed != (want == "pass") {
			t.Fatalf("attempt %d = %+v, run %+v", i+1, attempt, ran)
		}
		identities[attempt.Identity] = true
		patch := read(t, filepath.Join(h.home, "runs", record.ID, attempt.Changes.Path))
		if !strings.Contains(patch, "+"+want) || attempt.Changes.Name != fmt.Sprintf("attempt-%d.patch", i+1) {
			t.Fatalf("attempt %d changes:\n%s", i+1, patch)
		}
	}
	if len(identities) != 3 {
		t.Fatalf("identities = %v", identities)
	}

	r := agister(t, h.home, h.repo, "runs", "show", record.ID)
	if r.code != 0 || !strings.Contains(r.stdout, `"attempts":[{"number":1,"session":"sess-1"`) || strings.Count(r.stdout, `"passed":`) != 3 {
		t.Fatalf("runs show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// A run that produces no output for the policy's stale.no_output is killed,
// group and all, before verify.timeout: with no repair to follow it, the
// node is interrupted as a timeout, and the attempt's run says what went
// stale.
func TestVerifyRunWithoutOutputIsKilledAsStale(t *testing.T) {
	t.Parallel()
	// The wait for output passes on the command runner's clock once the
	// run waits on it, well short of the run's timeout: the command never
	// ends on its own.
	const noOutput = 7 * time.Second
	clock := clocktest.NewClock(time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC))
	groups := supervisortest.NewGroups()
	stale := inProcessCommands(groups, clock.Timer)
	// One attempt: since ADR-024 rule 8 such a run is a failed attempt,
	// which a repair turn follows while attempts are left; with none left
	// the node ends as it did before.
	h := newLoopWith(t, seams{commands: runtimecomposition.Commands{Supervisor: stale}, groups: groups}, verifySettings{command: blocks + " & wait", maxAttempts: 1, policy: "stale: {no_output: 7s}\n"}, state("one"))
	id := h.submit(contract.CallRequest{})
	cleanupRun(t, h.runs, h.hosted, id)
	clock.Started(noOutput)
	clock.Advance(noOutput)
	record := h.wait(id)

	expect(t, record, domain.Interrupted, domain.ClassTimeout, "stale: attempt 1's run produced no output for 7s (stale.no_output)")
	if record.Effective == nil || record.Effective.Stale == nil || record.Effective.Stale.NoOutput != noOutput {
		t.Fatalf("effective %+v", record.Effective)
	}
	if len(record.Attempts) != 1 || record.Attempts[0].Run == nil || record.Attempts[0].Run.Stale == nil {
		t.Fatalf("attempts %+v", record.Attempts)
	}
	if ran := record.Attempts[0].Run; ran.Passed || ran.Stale.Limit != domain.StaleNoOutput || ran.Stale.After != noOutput || ran.Stale.At.IsZero() {
		t.Fatalf("run %+v, stale %+v", ran, ran.Stale)
	}
	// The group the record names is killed by the supervisor before the
	// run returns, which is its contract (command_test.go).
	if record.Effects == nil || record.Effects.Command == nil {
		t.Fatalf("effects %+v", record.Effects)
	}
	if _, _, err := supervisor.ParseRef(record.Effects.Command.Ref); err != nil {
		t.Fatal(err)
	}
}

// A run killed for its silence is a failed attempt (ADR-024 rule 8): with
// attempts left a repair turn follows it in the call's session, told that
// the run went without output for the limit and was ended by Agister, with
// the output the run produced before it hung; the next run passes and the
// node completes.
func TestVerifyRunWithoutOutputIsRepaired(t *testing.T) {
	t.Parallel()
	const noOutput = 7 * time.Second
	clock := clocktest.NewClock(time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC))
	groups := supervisortest.NewGroups()
	stale := inProcessCommands(groups, clock.Timer)
	// The command prints the state, then hangs unless the state says pass.
	h := newLoopWith(t, seams{commands: runtimecomposition.Commands{Supervisor: stale}, groups: groups},
		verifySettings{command: passWhenStateSaysPass + " || " + blocks, policy: "stale: {no_output: 7s}\n"}, state("one"), state("pass"))
	id := h.submit(contract.CallRequest{})
	cleanupRun(t, h.runs, h.hosted, id)
	// The first run's wait for output starts twice, at its start and again
	// at the state it prints; then it is silent for the whole limit.
	clock.Started(noOutput)
	clock.Started(noOutput)
	clock.Advance(noOutput)
	record := h.wait(id)

	expect(t, record, domain.Completed, "", "")
	turns := h.runner.turns()
	if len(turns) != 2 || turns[1].ResumeSessionID != "sess-1" {
		t.Fatalf("turns = %+v", turns)
	}
	for _, want := range []string{"The check failed. Fix the cause, not the check.", "## exit status\n\nno output for 7s, then ended by Agister\n", "4 bytes", "```\none\n```"} {
		if !strings.Contains(turns[1].Prompt, want) {
			t.Fatalf("repair prompt misses %q:\n%s", want, turns[1].Prompt)
		}
	}
	ran := runsOf(record)
	if len(ran) != 2 || ran[0].Passed || ran[0].Stale == nil || ran[0].Stale.Limit != domain.StaleNoOutput || ran[0].Stale.After != noOutput ||
		!ran[1].Passed || ran[1].Stale != nil {
		t.Fatalf("attempts = %+v", record.Attempts)
	}
	// A verification attempt was spent, not a resume.
	if len(record.Recoveries) != 0 {
		t.Fatalf("recoveries = %+v", record.Recoveries)
	}
}

// A turn Agister ended at a staleness limit is recovered in its session
// (ADR-024): the recovery turn receives the policy's instruction with the
// evidence, verification runs on what it left, and runs show prints the
// recovery with the record.
func TestAStaleTurnIsRecoveredAndRunsShowPrintsTheRecovery(t *testing.T) {
	t.Parallel()
	// The first turn makes the same call three times and never ends by
	// itself: it ends, as a runtime's turn does, once Agister ends it.
	ended := func(*testing.T, app.TurnRequest) domain.Turn {
		return turn(func(turn *domain.Turn) {
			turn.Status, turn.Output, turn.Error = domain.Interrupted, nil, domain.Fault(domain.ClassCancelled, "")
		})
	}
	// The recovery turn costs what no other turn of the call does.
	const cost = 0.25
	h := newLoop(t, verifySettings{policy: "stale: {repeated_tool_calls: 3, recover: {max_resumes: 1, instruction: Change the approach.}}\n"}, ended,
		state("pass", func(turn *domain.Turn) { usd := cost; turn.CostUSD = &usd }))
	h.runner.toolCalls = true
	h.runner.reports = func(ctx context.Context, sink app.EventSink, n int) {
		if n != 0 {
			return
		}
		for _, id := range []string{"t1", "t2", "t3"} {
			sink.ToolStarted(app.ToolCall{ID: id, Name: "Bash", Input: `{"command":"make"}`})
			sink.ToolFinished(app.ToolResult{ID: id, Output: "make: *** No rule", Reported: true})
		}
		<-ctx.Done()
	}
	if r := agisterInput(t, "yes\n", h.home, h.repo, "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	record := h.call(contract.CallRequest{})

	expect(t, record, domain.Completed, "", "")
	turns := h.runner.turns()
	want := "Change the approach.\n\n## stale limit\n\nstale.repeated_tool_calls: the same tool call was made 3 times in a row, and Agister ended the turn.\n\n" +
		"## tool call\n\nBash\n\n```\n{\"command\":\"make\"}\n```\n\n## last result\n\n```\nmake: *** No rule\n```"
	if len(turns) != 2 || turns[1].ResumeSessionID != "sess-1" || turns[1].Prompt != want {
		t.Fatalf("turns = %+v", turns)
	}
	// One verification run, on what the recovery turn left.
	if ran := runsOf(record); len(ran) != 1 || !ran[0].Passed {
		t.Fatalf("attempts = %+v", record.Attempts)
	}
	digest := sha256.Sum256([]byte(want))
	if got := record.Recoveries; len(got) != 1 || got[0].Outcome != domain.RecoveryCompleted || got[0].MessageSHA256 != hex.EncodeToString(digest[:]) {
		t.Fatalf("recoveries = %+v", got)
	}
	// The stored record names what the recovery turn itself cost (rule 9).
	if got := record.Recoveries[0].CostUSD; got == nil || *got != cost {
		t.Fatalf("stored recovery cost = %v, want %v", got, cost)
	}

	r := agister(t, h.home, h.repo, "runs", "show", record.ID)
	if r.code != 0 || !strings.Contains(r.stdout, `"recoveries":[{"number":1,"follows":1,"stale":{"limit":"repeated_tool_calls"`) ||
		!strings.Contains(r.stdout, `"resumed":"sess-1","session":"sess-1"`) || !strings.Contains(r.stdout, `"outcome":"completed"`) {
		t.Fatalf("runs show: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// So does the record runs show prints.
	var shown domain.Record
	if err := json.Unmarshal([]byte(r.stdout), &shown); err != nil || len(shown.Recoveries) != 1 || shown.Recoveries[0].CostUSD == nil || *shown.Recoveries[0].CostUSD != cost {
		t.Fatalf("runs show: %v, recoveries %+v\n%s", err, shown.Recoveries, r.stdout)
	}
}
