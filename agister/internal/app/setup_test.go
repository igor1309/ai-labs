package app_test

import (
	"context"
	"reflect"
	"strings"
	"sync"
	"testing"

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

// Without a checkout the agent works in the repository itself: no setup
// runs, whatever the workspace declares.
func TestAProcessWithoutACheckoutRunsNoSetup(t *testing.T) {
	t.Parallel()
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

// ADR-025 rule 1: a call reads no workspace settings: whatever they say,
// valid or not, mode, precheck and setup alike, and whatever setup its
// process declares, it works in the caller's worktree, runs no setup or
// precheck, makes no checkout, and records none of it.
func TestACallIgnoresTheWorkspaceSettingsAndItsSetup(t *testing.T) {
	t.Parallel()
	for name, text := range map[string]string{
		"temporary, with a setup and a precheck": workspaceSetup + "mode: temporary\nprecheck: {command: make lint, timeout: 30s}\n",
		"invalid":                                "schema: agister.workspace/v1alpha1\nsetup: {command: ./link-config.sh}\nmode: elsewhere\n",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			withWorkspace(h, text)
			ownSetup(h)
			record := h.call(t, contract.CallRequest{})

			if record.Result.Status != run.Completed || record.InPlace == nil || record.Workspace != "/repo" {
				t.Fatalf("result %+v, in place %+v, workspace %q", record.Result, record.InPlace, record.Workspace)
			}
			if len(h.workspaces.checkouts) != 0 || len(h.setup.runs()) != 0 || record.Setup != nil || record.SetupRun != nil || record.Precheck != nil || record.PrecheckRun != nil {
				t.Fatalf("checkouts %v, runs %+v, setup %+v, precheck %+v", h.workspaces.checkouts, h.setup.runs(), record.Setup, record.Precheck)
			}
			if turns := h.runner.calls(); len(turns) != 1 || turns[0].Cwd != "/repo" {
				t.Fatalf("turns %+v", turns)
			}
			if kinds := definitionKinds(record); contains(kinds, "workspace") {
				t.Fatalf("definitions = %v", kinds)
			}
			for _, kind := range h.recorder.kinds() {
				if strings.HasPrefix(kind, "SETUP_") || strings.HasPrefix(kind, "PRECHECK_") {
					t.Fatalf("events %v", h.recorder.kinds())
				}
			}
		})
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

// Calls verify through the verifier they are given, after the turn, in the
// caller's worktree, and never ask the preparer for a setup: a call has
// none (ADR-025 rule 1).
func TestCallsVerifyThroughTheirOwnVerifier(t *testing.T) {
	t.Parallel()
	h := newHarness()
	verifying(h)
	withWorkspace(h, workspaceSetup)
	preparer, verifier := &preparerSpy{runner: h.runner}, &verifierSpy{runner: h.runner}
	h.calls = app.NewCalls(
		app.NewResolver(h.defs, h.runtimes, h.validator, resolverCheckStub{}), h.runtimes,
		map[string]app.InputProvider{"git.revision": h.inputs, "git.diff": h.inputs},
		h.workspaces, h.changes, preparer, h.borrower(), verifier, app.NewRecoverer(h.clock), h.validator, h.recorder, h.runs,
		h.clock, h.timer, fixedIDs{}, "/state", h.hosted,
	)
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v", record.Result)
	}
	if len(preparer.calls) != 0 {
		t.Fatalf("setups %+v", preparer.calls)
	}
	if len(verifier.calls) != 1 || !reflect.DeepEqual(verifier.turns, []int{1}) {
		t.Fatalf("verifications %+v, turns before %v", verifier.calls, verifier.turns)
	}
	if call := verifier.calls[0]; call.Verify.Command != "go test ./..." || call.Dir != "/repo" || call.Base != "sha-HEAD" {
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

// ADR-025: check reads the workspace settings, a process's workspace.setup
// and a verification's where as obsolete: valid or not, each is a warning
// that names ADR-025 and says it is ignored, none is a problem, and no
// process uses the workspace settings.
func TestCheckWarnsOfObsoleteWorkspaceSettingsSetupAndWhere(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.defs.docs[definition.KindProcess]["q"] = strings.Replace(strings.Replace(h.defs.docs[definition.KindProcess]["p"], "name: p", "name: q", 1),
		"  checkout: candidate_revision\n", "  checkout: candidate_revision\n  setup: {command: ./s.sh, timeout: 1m}\n", 1)
	h.defs.docs[definition.KindProcess]["own"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "name: p", "name: own", 1)
	h.defs.docs[definition.KindProcess]["own"] = strings.Replace(h.defs.docs[definition.KindProcess]["own"],
		"  checkout: candidate_revision\n", "  checkout: candidate_revision\n  setup: {command: '', timeout: soon}\n", 1)
	h.defs.docs[definition.KindVerify] = map[string]string{"repo": verification + "where: copy\n"}
	withWorkspace(h, "schema: agister.workspace/v1alpha1\nmode: elsewhere\nsetup: {timeout: 1m}\n")
	report := checkOf(t, h, false)

	if len(report.Problems) != 0 {
		t.Fatalf("problems = %v", messages(report.Problems))
	}
	for _, want := range []string{
		"process own: workspace.setup: is obsolete and ignored (ADR-025)",
		"process q: workspace.setup: is obsolete and ignored (ADR-025)",
		"verification repo: where: is obsolete and ignored (ADR-025)",
		"workspace settings mem/workspace/workspace: is obsolete and ignored (ADR-025)",
	} {
		found := false
		for _, warning := range report.Warnings {
			found = found || strings.HasPrefix(warning, want)
		}
		if !found {
			t.Fatalf("no warning %q in %q", want, report.Warnings)
		}
	}
	for _, d := range report.Definitions {
		if d.Kind == "workspace" && len(d.UsedBy) != 0 {
			t.Fatalf("workspace used by %v", d.UsedBy)
		}
	}
}

func refNames(refs []contract.DefinitionRef) []string {
	var names []string
	for _, ref := range refs {
		names = append(names, ref.Name)
	}
	return names
}
