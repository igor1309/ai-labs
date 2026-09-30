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
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/adapters/schema"
	"github.com/igor1309/ai-labs/agister/internal/adapters/system"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// The verification loop (ADR-002) on real checkouts of temporary
// repositories, with the real command runner, git and evidence store. The
// runtime is a scripted fake whose turns write files in the checkout, and
// the verification command is a fixture driven by those files: by default
// it prints the file state and passes when it says "pass".

const passWhenStateSaysPass = "cat state; grep -qx pass state"

// step is one scripted turn: it may change the checkout and says how the
// turn ended.
type step func(t *testing.T, request app.TurnRequest) domain.Turn

// scripted is a runtime that plays its steps in order, one per turn.
type scripted struct {
	t        *testing.T
	mu       sync.Mutex
	steps    []step
	requests []app.TurnRequest
}

func (s *scripted) Identity(context.Context) (app.RuntimeIdentity, error) {
	return app.RuntimeIdentity{Contract: "fake/1", Version: "1.0.0", Resume: true, CostLimit: true}, nil
}

func (s *scripted) RunTurn(_ context.Context, request app.TurnRequest, _ app.EventSink) domain.Turn {
	s.mu.Lock()
	n := len(s.requests)
	s.requests = append(s.requests, request)
	s.mu.Unlock()
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

// writes is a step that writes files in the checkout and ends as turn does.
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
}

type loopHarness struct {
	t      *testing.T
	repo   string
	home   string
	runner *scripted
	calls  *app.Calls
	runs   *app.Runs
	store  fsruns.Store
}

// newLoop is a repository with a base commit, settings for process impl
// with the verify given, and a Calls over them and the scripted steps.
func newLoop(t *testing.T, settings verifySettings, steps ...step) *loopHarness {
	return newLoopWith(t, git.Workspaces{}, settings, steps...)
}

func newLoopWith(t *testing.T, changes app.CallChanges, settings verifySettings, steps ...step) *loopHarness {
	t.Helper()
	repo, err := filepath.EvalSymlinks(t.TempDir())
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

	if settings.command == "" {
		settings.command = passWhenStateSaysPass
	}
	if settings.timeout == "" {
		settings.timeout = "20s"
	}
	if settings.maxAttempts == 0 {
		settings.maxAttempts = 3
	}
	defs := t.TempDir()
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
output:
  format: json
  schema: done
  require_valid: true
verify:
  command: %s
  timeout: %s
  max_attempts: %d
  instruction: The check failed. Fix the cause, not the check.
`, strconv.Quote(settings.command), settings.timeout, settings.maxAttempts),
	} {
		if err := os.MkdirAll(filepath.Dir(filepath.Join(defs, name)), 0o700); err != nil {
			t.Fatal(err)
		}
		write(t, filepath.Join(defs, name), text)
	}

	h := &loopHarness{t: t, repo: repo, home: t.TempDir(), runner: &scripted{t: t, steps: steps}}
	h.store = fsruns.Store{Dir: filepath.Join(h.home, "runs")}
	runtimes := fakeRuntimes{runner: h.runner}
	hosted := app.NewHosted()
	h.calls = app.NewCalls(
		app.NewResolver(fsdefs.Store{Dir: defs}, runtimes, schema.Validator{}), runtimes,
		map[string]app.InputProvider{"git.revision": git.Revision{}},
		git.Workspaces{}, changes, supervisor.Commands{}, schema.Validator{},
		h.store, h.store, system.Clock{}, system.IDs{}, h.home, hosted,
	)
	h.runs = app.NewRuns(h.store, hosted, 10*time.Millisecond)
	return h
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

// wait returns the run's record once it is finished; the checkout is gone
// by then.
func (h *loopHarness) wait(id string) domain.Record {
	h.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	if err := h.runs.Observe(ctx, id, 0, func(contract.Event) error { return nil }); err != nil {
		h.t.Fatalf("observing %s: %v", id, err)
	}
	record, state, err := h.store.Get(context.Background(), id)
	if err != nil || state != domain.StateFinished || record.Result == nil {
		h.t.Fatalf("run %s: %s, %v", id, state, err)
	}
	if lines := strings.Split(gitCmd(h.t, h.repo, "worktree", "list"), "\n"); len(lines) != 1 {
		h.t.Fatalf("checkout left: %v", lines)
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
// same checkout, with the instruction, the command, its exit status and
// its output; the repair turn is validated and the command runs again. The
// output is the latest turn's; usage and cost sum every turn.
func TestVerifyFailingRunIsRepairedInTheSameSessionAndCheckout(t *testing.T) {
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

// The last attempt failing ends the node as budget exhausted.
func TestVerifyAttemptsRunOut(t *testing.T) {
	h := newLoop(t, verifySettings{}, state("one"), state("two"), state("three"), state("pass"))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Failed, domain.ClassBudgetExhausted, "attempt 3 of 3 failed (exit code 1)")
	if len(h.runner.turns()) != 3 || len(runsOf(record)) != 3 || record.Result.Output != nil {
		t.Fatalf("turns %d, attempts %+v", len(h.runner.turns()), record.Attempts)
	}
}

// A run never repeats on content already checked: a repair that changes
// nothing, or returns to an earlier state, ends the loop without running,
// and the evidence says why.
func TestVerifyStopsWithoutProgress(t *testing.T) {
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
	h := newLoop(t, verifySettings{command: `grep -qx pass state || { echo "not yet"; exit 1; }`}, state("one"), state("two"), state("pass"))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Failed, domain.ClassBudgetExhausted, "no progress: attempt 2 failed as attempt 1 did")
	if len(h.runner.turns()) != 2 || len(runsOf(record)) != 2 || record.Attempts[1].Identity == record.Attempts[0].Identity {
		t.Fatalf("turns %d, attempts %+v", len(h.runner.turns()), record.Attempts)
	}
}

// A run that changes the checkout's content fails whatever its exit
// status, and the evidence keeps what it changed; files it writes that
// are ignored are not content.
func TestVerifyRunThatChangesTheCheckoutFails(t *testing.T) {
	h := newLoop(t, verifySettings{command: "grep -qx pass state && echo ran > ran.txt", maxAttempts: 1}, state("pass"))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Failed, domain.ClassBudgetExhausted, "attempt 1 of 1 failed (exit code 0; the run changed the checkout's content")
	ran := runsOf(record)
	if len(ran) != 1 || ran[0].Passed || ran[0].After == "" || ran[0].After == record.Attempts[0].Identity || ran[0].AfterChanges == nil {
		t.Fatalf("attempts = %+v", record.Attempts)
	}
	patch := read(t, filepath.Join(h.home, "runs", record.ID, ran[0].AfterChanges.Path))
	if !strings.Contains(patch, "+++ b/ran.txt") {
		t.Fatalf("run changes:\n%s", patch)
	}

	h = newLoop(t, verifySettings{command: "grep -qx pass state && echo ran > ran.log", maxAttempts: 1}, state("pass"))
	expect(t, h.call(contract.CallRequest{}), domain.Completed, "", "")
}

// A run that exceeds verify.timeout is killed and interrupts the node,
// well before the call's own timeout.
func TestVerifyRunTimeout(t *testing.T) {
	h := newLoop(t, verifySettings{command: "sleep 30", timeout: "1s"}, state("one"))
	started := time.Now()
	record := h.call(contract.CallRequest{Timeout: "10s"})
	expect(t, record, domain.Interrupted, domain.ClassTimeout, "attempt 1's run exceeded verify.timeout 1s")
	if elapsed := time.Since(started); elapsed > 6*time.Second || !runsOf(record)[0].TimedOut {
		t.Fatalf("after %s, attempts %+v", elapsed, record.Attempts)
	}
}

// The call's timeout bounds the whole loop: a run gets only the time the
// turns before it left.
func TestVerifyCallTimeoutBoundsTheLoop(t *testing.T) {
	slow := func(t *testing.T, request app.TurnRequest) domain.Turn {
		time.Sleep(time.Second)
		return state("one")(t, request)
	}
	h := newLoop(t, verifySettings{command: "sleep 30", timeout: "2s"}, slow)
	started := time.Now()
	record := h.call(contract.CallRequest{Timeout: "2s"})
	expect(t, record, domain.Interrupted, domain.ClassTimeout, "the call's timeout passed during attempt 1's run")
	if elapsed := time.Since(started); elapsed > 15*time.Second {
		t.Fatalf("after %s", elapsed)
	}
}

// Cancelling the call during a run kills the command's whole process
// group, which the record names while it runs.
func TestVerifyCancellationKillsTheCommandGroup(t *testing.T) {
	groupFile := filepath.Join(t.TempDir(), "group")
	h := newLoop(t, verifySettings{command: "sleep 30 & echo $$ > " + groupFile + "; wait"}, state("one"))
	id := h.submit(contract.CallRequest{})
	var group int
	eventually(t, "the command to start", func() bool {
		data, err := os.ReadFile(groupFile)
		group, _ = strconv.Atoi(strings.TrimSpace(string(data)))
		return err == nil && strings.HasSuffix(string(data), "\n")
	})
	running, _, err := h.store.Get(context.Background(), id)
	if err != nil || running.Effects == nil || running.Effects.Command == nil {
		t.Fatalf("record effects %+v, %v", running.Effects, err)
	}
	if recorded, _, err := supervisor.ParseRef(running.Effects.Command.Ref); err != nil || recorded != group {
		t.Fatalf("recorded group %d (%v), the command's %d", recorded, err, group)
	}
	cancelled := time.Now()
	if err := h.runs.Cancel(context.Background(), id); err != nil {
		t.Fatal(err)
	}
	record := h.wait(id)
	if elapsed := time.Since(cancelled); elapsed > 10*time.Second {
		t.Fatalf("the call ended %s after the cancel", elapsed)
	}
	expect(t, record, domain.Interrupted, domain.ClassCancelled, "cancelled during attempt 1's run")
	eventually(t, "the command's group to be gone", func() bool { return errors.Is(syscall.Kill(-group, 0), syscall.ESRCH) })
}

// A repair turn that fails, returns invalid output or reports another
// session ends the node with that turn's status and class.
func TestVerifyRepairTurnThatFailsEndsTheNode(t *testing.T) {
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
			domain.Failed, domain.ClassRuntimeError, "resumed session sess-1, but the runtime reported session sess-2"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
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

// Every turn shares the call's cost limit: a repair gets what is left, and
// an earlier turn with an unknown cost blocks repair.
func TestVerifyUnknownCostBlocksRepair(t *testing.T) {
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

// Verification runs only after a valid turn: never after one that failed
// or returned invalid output, which ends the node as it would without
// verify.
func TestVerifyNeverRunsAfterAFailedOrInvalidTurn(t *testing.T) {
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
			marker := filepath.Join(t.TempDir(), "ran")
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
// content that passed: committed, edited, new and binary files alike. A
// capture that leaves content out prevents completion.
func TestVerifyCaptureReproducesThePassingContent(t *testing.T) {
	agent := func(t *testing.T, request app.TurnRequest) domain.Turn {
		write(t, filepath.Join(request.Cwd, "committed.txt"), "committed\n")
		gitCmd(t, request.Cwd, "add", "committed.txt")
		gitCmd(t, request.Cwd, "commit", "--quiet", "-m", "agent")
		write(t, filepath.Join(request.Cwd, "extra.txt"), "new\n")
		if err := os.WriteFile(filepath.Join(request.Cwd, "data.bin"), []byte{0, 1, 2, 0xff}, 0o600); err != nil {
			t.Error(err)
		}
		return state("pass")(t, request)
	}
	h := newLoop(t, verifySettings{}, agent)
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Completed, "", "")
	artifacts := record.Result.Artifacts
	if len(artifacts) != 1 || artifacts[0].Name != "changes.patch" {
		t.Fatalf("artifacts = %+v", artifacts)
	}
	rebuild := filepath.Join(t.TempDir(), "rebuild")
	gitCmd(t, h.repo, "worktree", "add", "--quiet", "--detach", rebuild, "main")
	defer gitCmd(t, h.repo, "worktree", "remove", "--force", rebuild)
	gitCmd(t, rebuild, "apply", "--binary", filepath.Join(h.home, "runs", record.ID, artifacts[0].Path))
	gitCmd(t, rebuild, "add", "--all")
	if tree := gitCmd(t, rebuild, "write-tree"); tree != record.Attempts[0].Identity {
		t.Fatalf("the patch rebuilds %s, the passing content is %s", tree, record.Attempts[0].Identity)
	}

	h = newLoopWith(t, lossy{}, verifySettings{}, agent)
	record = h.call(contract.CallRequest{})
	expect(t, record, domain.Failed, domain.ClassInternal, "the captured changes do not reproduce the content that passed verification")
}

// Every attempt is evidence: the command, where and how it ran, its
// bounded output with the size and digest of the whole, the session, the
// number, the content checked, and the turn's changes, each kept before the
// next turn starts. runs show displays them.
func TestVerifyEvidenceForEveryAttempt(t *testing.T) {
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
			ran.Command != passWhenStateSaysPass || ran.Dir != record.Workspace || ran.Exit.Code == nil || (*ran.Exit.Code == 0) != (want == "pass") ||
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
