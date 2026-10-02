package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

const workspaceSetup = `schema: agister.workspace/v1alpha1
setup:
  command: ./link-config.sh
  timeout: 2m
`

// withWorkspace gives the harness's settings the workspace document text.
func withWorkspace(h *harness, text string) {
	h.defs.docs[definition.KindWorkspace] = map[string]string{"workspace": text}
}

// ownSetup gives the harness's process p a setup of its own.
func ownSetup(h *harness) {
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"],
		"  checkout: candidate_revision\n", "  checkout: candidate_revision\n  setup: {command: ./own.sh, timeout: 30s}\n", 1)
}

func definitionKinds(record run.Record) []string {
	var kinds []string
	for _, source := range record.Definitions {
		kinds = append(kinds, source.Kind)
	}
	return kinds
}

// ADR-010 rules 2 and 3: the workspace's setup runs for a process with a
// checkout and none of its own, once, in the checkout, before the runtime's
// first turn, its process group on record; the record names the setup,
// the document it came from and that document's digest.
func TestTheWorkspaceSetupRunsInTheCheckoutBeforeTheFirstTurn(t *testing.T) {
	h := newHarness()
	withWorkspace(h, workspaceSetup)
	turnsDuringSetup := -1
	h.setup.running = func(app.CommandRequest) { turnsDuringSetup = len(h.runner.calls()) }
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 || turnsDuringSetup != 0 {
		t.Fatalf("result %+v, turns %d, turns during setup %d", record.Result, len(h.runner.calls()), turnsDuringSetup)
	}
	want := []app.CommandRequest{{Command: "./link-config.sh", Dir: "/work/checkout", Timeout: 2 * time.Minute, Bound: 8 << 10}}
	if got := h.setup.runs(); !reflect.DeepEqual(got, want) || len(h.commands.runs()) != 0 {
		t.Fatalf("command runs = %+v", got)
	}
	if want := (run.Setup{Command: "./link-config.sh", Timeout: 2 * time.Minute, From: run.SetupFromWorkspace, Path: "mem/workspace/workspace"}); record.Setup == nil || *record.Setup != want {
		t.Fatalf("setup = %+v", record.Setup)
	}
	var recorded run.DefinitionSource
	for _, source := range record.Definitions {
		if source.Kind == "workspace" {
			recorded = source
		}
	}
	if recorded.Name != "workspace" || recorded.Path != "mem/workspace/workspace" || recorded.SHA256 != sha(workspaceSetup) {
		t.Fatalf("definitions = %+v", record.Definitions)
	}
	if ran := record.SetupRun; ran == nil || !ran.Passed || ran.Dir != "/work/checkout" || ran.Exit.Code == nil || *ran.Exit.Code != 0 || ran.After != "" {
		t.Fatalf("setup run = %+v", record.SetupRun)
	}
	if record.Effects == nil || record.Effects.Command == nil || record.Effects.Command.Ref != "ref-cmd" {
		t.Fatalf("effects = %+v", record.Effects)
	}
	kinds := strings.Join(h.recorder.kinds(), " ")
	if !strings.Contains(kinds, "SETUP_STARTED SETUP_FINISHED") {
		t.Fatalf("events = %s", kinds)
	}
}

// A process's own setup replaces the workspace's whole, and the workspace
// document, unused, is not read.
func TestAProcessesOwnSetupReplacesTheWorkspaces(t *testing.T) {
	h := newHarness()
	withWorkspace(h, workspaceSetup)
	ownSetup(h)
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v", record.Result)
	}
	want := []app.CommandRequest{{Command: "./own.sh", Dir: "/work/checkout", Timeout: 30 * time.Second, Bound: 8 << 10}}
	if got := h.setup.runs(); !reflect.DeepEqual(got, want) {
		t.Fatalf("command runs = %+v", got)
	}
	if want := (run.Setup{Command: "./own.sh", Timeout: 30 * time.Second, From: run.SetupFromProcess, Path: "mem/processes/p"}); record.Setup == nil || *record.Setup != want {
		t.Fatalf("setup = %+v", record.Setup)
	}
	if kinds := definitionKinds(record); contains(kinds, "workspace") {
		t.Fatalf("definitions = %v", kinds)
	}
}

// Without a checkout the agent works in the repository itself: no setup
// runs, whatever the workspace declares.
func TestAProcessWithoutACheckoutRunsNoSetup(t *testing.T) {
	h := newHarness()
	withWorkspace(h, workspaceSetup)
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "workspace:\n  checkout: candidate_revision\n", "", 1)
	h.defs.docs[definition.KindPolicy]["pol"] = strings.Replace(h.defs.docs[definition.KindPolicy]["pol"], "scope: candidate", "scope: repository", 1)
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed || len(h.setup.runs()) != 0 || record.Setup != nil || record.SetupRun != nil {
		t.Fatalf("result %+v, runs %+v, setup %+v", record.Result, h.setup.runs(), record.Setup)
	}
	if kinds := definitionKinds(record); contains(kinds, "workspace") {
		t.Fatalf("definitions = %v", kinds)
	}
}

// Workspace settings that do not parse refuse the call before any effect.
func TestInvalidWorkspaceSettingsRefuseTheCall(t *testing.T) {
	h := newHarness()
	withWorkspace(h, "schema: agister.workspace/v1alpha1\nsetup: {command: ./link-config.sh}\n")
	record := h.call(t, contract.CallRequest{})

	if class(record) != run.ClassRefused || !strings.Contains(message(record), "setup.timeout: is required") {
		t.Fatalf("result %+v", record.Result)
	}
	if len(h.workspaces.checkouts) != 0 || len(h.runner.calls()) != 0 || len(h.setup.runs()) != 0 {
		t.Fatalf("checkouts %v, turns %d, runs %d", h.workspaces.checkouts, len(h.runner.calls()), len(h.setup.runs()))
	}
}

// ADR-010 rules 4 and 5: a setup that exits non-zero, runs out of time or
// changes the checkout's content fails the call before any turn; the run
// is on record and the checkout is released.
func TestAFailedSetupFailsTheCallBeforeAnyTurn(t *testing.T) {
	cases := map[string]struct {
		arrange func(h *harness)
		want    string
		check   func(t *testing.T, h *harness, ran *run.CommandRun)
	}{
		"non-zero exit": {
			arrange: func(h *harness) { h.setup.exits = []int{3} },
			want:    "the setup command exited with code 3",
			check: func(t *testing.T, _ *harness, ran *run.CommandRun) {
				if ran.Exit.Code == nil || *ran.Exit.Code != 3 || ran.Output.Head != "exit 3" {
					t.Fatalf("setup run = %+v", ran)
				}
			},
		},
		"timeout": {
			arrange: func(h *harness) { h.setup.timedOut = true },
			want:    "the setup command exceeded its timeout 2m0s",
			check: func(t *testing.T, _ *harness, ran *run.CommandRun) {
				if !ran.TimedOut || ran.Exit.Signal != "killed" {
					t.Fatalf("setup run = %+v", ran)
				}
			},
		},
		"content changed": {
			arrange: func(h *harness) {
				var mu sync.Mutex
				content := "tree"
				h.changes.identify = func() string {
					mu.Lock()
					defer mu.Unlock()
					return content
				}
				h.setup.running = func(app.CommandRequest) {
					mu.Lock()
					defer mu.Unlock()
					content = "tree-with-config"
				}
				// The checkout starts on the revision's content.
				h.changes.patch = func(from, _ string) []byte {
					if from == "tree" {
						return []byte("diff --git a/AGENTS.md b/AGENTS.md\n")
					}
					return nil
				}
			},
			want: "the setup command changed the checkout's content",
			check: func(t *testing.T, h *harness, ran *run.CommandRun) {
				if ran.After != "tree-with-config" || ran.AfterChanges == nil || ran.AfterChanges.Name != "setup.patch" ||
					string(h.recorder.artifacts["setup.patch"]) != "diff --git a/AGENTS.md b/AGENTS.md\n" {
					t.Fatalf("setup run = %+v", ran)
				}
				if !reflect.DeepEqual(h.changes.changed, [][2]string{{"/work/checkout", "sha-HEAD"}, {"/work/checkout", "tree"}}) {
					t.Fatalf("changes asked = %v", h.changes.changed)
				}
			},
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			h := newHarness()
			withWorkspace(h, workspaceSetup)
			c.arrange(h)
			record := h.call(t, contract.CallRequest{})

			if record.Result.Status != run.Failed || class(record) != run.ClassSetupFailed || !strings.Contains(message(record), c.want) {
				t.Fatalf("result %+v", record.Result)
			}
			if len(h.runner.calls()) != 0 || record.Turn != nil || h.workspaces.releases() != 1 {
				t.Fatalf("turns %d, turn %+v, releases %d", len(h.runner.calls()), record.Turn, h.workspaces.releases())
			}
			if record.SetupRun == nil || record.SetupRun.Passed || record.SetupRun.Command != "./link-config.sh" {
				t.Fatalf("setup run = %+v", record.SetupRun)
			}
			// No turn ran, so the call has no changes of its own to keep.
			if _, ok := h.recorder.artifacts["changes.patch"]; ok {
				t.Fatal("changes.patch kept")
			}
			c.check(t, h, record.SetupRun)
		})
	}
}

// ADR-010 rules 3 and 6: repair turns continue in the prepared checkout
// and run no setup again, and the verification command's clean copies
// run none.
func TestSetupRunsOnceAndNotInTheVerificationCopy(t *testing.T) {
	h := newHarness()
	verifying(h)
	withWorkspace(h, workspaceSetup)
	// The setup passes; the first verification run fails, the second
	// passes.
	h.commands.exits = []int{1, 0}
	h.changes.identify = steps("tree", "tree", "tree", "turn-1", "turn-2")
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed || len(h.runner.calls()) != 2 {
		t.Fatalf("result %+v, turns %d", record.Result, len(h.runner.calls()))
	}
	runs := func(spy *commandsSpy) []string {
		var dirs []string
		for _, request := range spy.runs() {
			dirs = append(dirs, request.Command+" in "+request.Dir)
		}
		return dirs
	}
	if got, want := runs(h.setup), []string{"./link-config.sh in /work/checkout"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("setup runs = %v", got)
	}
	if got, want := runs(h.commands), []string{"go test ./... in /work/copy-1", "go test ./... in /work/copy-1"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("verification runs = %v", got)
	}
}

// A checkout whose content is not the revision's when it is made, as when
// a checkout hook changed it, fails the call before its setup runs: the
// setup is held to the revision's content, not to what it found.
func TestACheckoutChangedBeforeItsSetupFailsTheCall(t *testing.T) {
	h := newHarness()
	withWorkspace(h, workspaceSetup)
	h.changes.patch = func(from, to string) []byte {
		if from == "sha-HEAD" && to == "tree" {
			return []byte("diff --git a/state b/state\n")
		}
		return nil
	}
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Failed || class(record) != run.ClassSetupFailed || !strings.Contains(message(record), "the checkout's content is not the revision's before its setup") {
		t.Fatalf("result %+v", record.Result)
	}
	if len(h.setup.runs()) != 0 || len(h.runner.calls()) != 0 || h.workspaces.releases() != 1 || record.SetupRun != nil {
		t.Fatalf("setup runs %+v, turns %d, releases %d, setup run %+v", h.setup.runs(), len(h.runner.calls()), h.workspaces.releases(), record.SetupRun)
	}
	if got := string(h.recorder.artifacts["checkout.patch"]); got != "diff --git a/state b/state\n" {
		t.Fatalf("checkout.patch = %q", got)
	}
	if _, ok := h.recorder.artifacts["changes.patch"]; ok {
		t.Fatal("changes.patch kept")
	}
}

// A setup whose run cannot be put on record fails the call, though the
// command passed: no turn runs on a setup the record does not show.
func TestASetupRunThatCannotBeRecordedFailsTheCall(t *testing.T) {
	h := newHarness()
	withWorkspace(h, workspaceSetup)
	h.recorder.updateErr = func(record run.Record) error {
		if record.SetupRun != nil {
			return errors.New("disk full")
		}
		return nil
	}
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Failed || class(record) != run.ClassInternal || !strings.Contains(message(record), "recording the setup's run failed: disk full") {
		t.Fatalf("result %+v", record.Result)
	}
	if len(h.setup.runs()) != 1 || len(h.runner.calls()) != 0 || record.Turn != nil || h.workspaces.releases() != 1 {
		t.Fatalf("setup runs %d, turns %d, releases %d", len(h.setup.runs()), len(h.runner.calls()), h.workspaces.releases())
	}
}

// Cancelling the call while its setup runs ends the command and the call,
// cancelled, before any turn; the run is on record as cancelled and the
// checkout is released.
func TestCancellingDuringTheSetupCancelsTheCall(t *testing.T) {
	h := newHarness()
	withWorkspace(h, workspaceSetup)
	started := make(chan struct{})
	h.setup.block, h.setup.started = true, started
	runs := app.NewRuns(nil, h.hosted, 0)
	if _, err := h.calls.Submit(context.Background(), contract.CallRequest{Process: "p", Cwd: "/repo"}); err != nil {
		t.Fatal(err)
	}
	// However the test ends, the blocked setup does not outlive it.
	t.Cleanup(func() { _ = runs.Cancel(context.Background(), "run-1") })
	select {
	case <-started:
	case record := <-h.recorder.finished:
		t.Fatalf("the call ended before its setup started: %+v", record.Result)
	case <-time.After(hangGuard):
		t.Fatal("the setup never started")
	}
	if err := runs.Cancel(context.Background(), "run-1"); err != nil {
		t.Fatal(err)
	}
	record := h.recorder.wait(t)

	if record.Result.Status != run.Interrupted || class(record) != run.ClassCancelled || !strings.Contains(message(record), "cancelled during the checkout's setup") {
		t.Fatalf("result %+v", record.Result)
	}
	if ran := record.SetupRun; ran == nil || !ran.Cancelled || ran.Passed {
		t.Fatalf("setup run = %+v", record.SetupRun)
	}
	if len(h.runner.calls()) != 0 || record.Turn != nil || h.workspaces.releases() != 1 {
		t.Fatalf("turns %d, releases %d", len(h.runner.calls()), h.workspaces.releases())
	}
}

// preparerSpy is a CallPreparer: it notes each setup it is asked for and
// how many turns ran before it, and passes.
type preparerSpy struct {
	runner *runnerSpy
	mu     sync.Mutex
	calls  []app.SetupCall
	turns  []int
}

func (s *preparerSpy) Setup(_ context.Context, call app.SetupCall) *run.Error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, call)
	s.turns = append(s.turns, len(s.runner.calls()))
	return nil
}

// verifierSpy is a CallVerifier: it notes each loop it is asked for and how
// many turns ran before it, and passes on the checkout's content.
type verifierSpy struct {
	runner *runnerSpy
	mu     sync.Mutex
	calls  []app.VerifyCall
	turns  []int
}

func (s *verifierSpy) Verify(_ context.Context, call app.VerifyCall) (string, *run.Error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, call)
	s.turns = append(s.turns, len(s.runner.calls()))
	return "tree", nil
}

// Calls prepare the checkout through the preparer they are given, before
// the first turn, and verify through the verifier they are given, after
// it: each collaborator is asked for its own part only.
func TestCallsPrepareAndVerifyThroughTheirOwnCollaborators(t *testing.T) {
	h := newHarness()
	verifying(h)
	withWorkspace(h, workspaceSetup)
	preparer, verifier := &preparerSpy{runner: h.runner}, &verifierSpy{runner: h.runner}
	h.calls = app.NewCalls(
		app.NewResolver(h.defs, h.runtimes, h.validator), h.runtimes,
		map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs},
		h.workspaces, h.changes, preparer, verifier, h.validator, h.recorder, h.runs,
		h.clock, h.timer, fixedIDs{}, "/state", h.hosted,
	)
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v", record.Result)
	}
	if len(preparer.calls) != 1 || !reflect.DeepEqual(preparer.turns, []int{0}) {
		t.Fatalf("setups %+v, turns before %v", preparer.calls, preparer.turns)
	}
	if call := preparer.calls[0]; call.Setup != (app.SetupCommand{Command: "./link-config.sh", Timeout: 2 * time.Minute}) || call.Dir != "/work/checkout" || call.Base != "sha-HEAD" {
		t.Fatalf("setup call %+v", call)
	}
	if len(verifier.calls) != 1 || !reflect.DeepEqual(verifier.turns, []int{1}) {
		t.Fatalf("verifications %+v, turns before %v", verifier.calls, verifier.turns)
	}
	if call := verifier.calls[0]; call.Verify.Command != "go test ./..." || call.Dir != "/work/checkout" || call.Base != "sha-HEAD" {
		t.Fatalf("verify call %+v", call)
	}
	// Neither the harness's preparer nor its verifier ran anything.
	if len(h.setup.runs()) != 0 || len(h.commands.runs()) != 0 {
		t.Fatalf("setup runs %+v, verification runs %+v", h.setup.runs(), h.commands.runs())
	}
}

// steps names the checkout's content in turn, then keeps the last.
func steps(contents ...string) func() string {
	var mu sync.Mutex
	return func() string {
		mu.Lock()
		defer mu.Unlock()
		content := contents[0]
		if len(contents) > 1 {
			contents = contents[1:]
		}
		return content
	}
}

// check validates the workspace settings, reports a setup without a
// checkout, and shows which processes the workspace's setup applies to.
func TestCheckValidatesWorkspaceSettingsAndSetups(t *testing.T) {
	h := newHarness()
	h.defs.docs[definition.KindProcess]["q"] = strings.Replace(strings.Replace(h.defs.docs[definition.KindProcess]["p"], "name: p", "name: q", 1),
		"workspace:\n  checkout: candidate_revision\n", "workspace:\n  setup: {command: ./s.sh, timeout: 1m}\n", 1)
	h.defs.docs[definition.KindProcess]["own"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "name: p", "name: own", 1)
	h.defs.docs[definition.KindProcess]["own"] = strings.Replace(h.defs.docs[definition.KindProcess]["own"],
		"  checkout: candidate_revision\n", "  checkout: candidate_revision\n  setup: {command: ./own.sh, timeout: 30s}\n", 1)
	withWorkspace(h, workspaceSetup)
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	report, err := checker.Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"process q: workspace.setup: requires workspace.checkout: setup prepares a checkout the call owns"}; !reflect.DeepEqual(report.Problems, want) {
		t.Fatalf("problems = %v", report.Problems)
	}
	if report.Checked["workspace"] != 1 {
		t.Fatalf("checked = %v", report.Checked)
	}
	for _, d := range report.Definitions {
		if d.Kind == "workspace" && !reflect.DeepEqual(d.UsedBy, []contract.DefinitionRef{{Kind: "processes", Name: "p"}}) {
			t.Fatalf("workspace used by %v", d.UsedBy)
		}
		if d.Kind == "processes" && contains(refNames(d.Uses), "workspace") != (d.Name == "p") {
			t.Fatalf("%s uses %v", d.Name, d.Uses)
		}
	}

	withWorkspace(h, "schema: agister.workspace/v1alpha1\nsetup: {timeout: 1m}\n")
	report, err = checker.Check(context.Background(), false)
	if err != nil {
		t.Fatal(err)
	}
	if !contains(report.Problems, "workspace workspace: setup.command: is required") {
		t.Fatalf("problems = %v", report.Problems)
	}
}

func refNames(refs []contract.DefinitionRef) []string {
	var names []string
	for _, ref := range refs {
		names = append(names, ref.Name)
	}
	return names
}
