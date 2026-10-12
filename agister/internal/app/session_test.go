package app_test

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Whether a call's session may be resumed is its process's to say
// (ADR-030 rule 3): a process that sets session decides repair, stale
// resumes and --continue, and one that sets none is fresh-only. An agent
// holds no session (rule 1), so the tests here no longer set one on the
// harness's agent a.

// sessioned has the harness's process p set session.
func sessioned(h *harness, mode string) {
	h.defs.docs[document.KindProcess]["p"] += "session: " + mode + "\n"
}

// A resumable process repairs: check reports nothing, a failed run is
// repaired in the call's session, and the record says the call's session
// was resumable.
func TestAResumableProcessRepairs(t *testing.T) {
	t.Parallel()
	h := newHarness()
	verifying(h)
	sessioned(h, definition.SessionResumable)
	if report := checkOf(t, h, false); len(report.Problems) != 0 {
		t.Fatalf("check: problems = %q", messages(report.Problems))
	}
	h.commands.exits = []int{1}
	changingEachTurn(h)
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed || len(h.commands.runs()) != 2 || len(record.Attempts) != 2 {
		t.Fatalf("result %+v: %s, attempts %+v", record.Result, message(record), record.Attempts)
	}
	if turns := h.runner.calls(); len(turns) != 2 || turns[1].ResumeSessionID != "prov-1" || record.Attempts[1].Session != "prov-1" {
		t.Fatalf("turns = %+v", turns)
	}
	if record.Agent != "a" || record.Profile == nil || record.Profile.Session != definition.SessionResumable {
		t.Fatalf("agent %s, profile = %+v", record.Agent, record.Profile)
	}
}

// A resumable process recovers a stale turn: check reports nothing, and
// the recovery turn resumes the call's session.
func TestAResumableProcessRecoversAStaleTurn(t *testing.T) {
	t.Parallel()
	h, _ := staleHarness(t, "repeated_tool_calls: 3, recover: {max_resumes: 1, instruction: Recover.}")
	sessioned(h, definition.SessionResumable)
	if report := checkOf(t, h, false); len(report.Problems) != 0 {
		t.Fatalf("check: problems = %q", messages(report.Problems))
	}
	play(h, repeating("prov-1", goTest, ""), completes(h))
	record := h.call(t, contract.CallRequest{})
	turns := h.runner.calls()
	if record.Result.Status != run.Completed || len(turns) != 2 || turns[1].ResumeSessionID != "prov-1" || len(record.Recoveries) != 1 {
		t.Fatalf("result %+v: %s, turns %+v, recoveries %+v", record.Result, message(record), turns, record.Recoveries)
	}
}

// A resumable process continues a finished run: the earlier session is
// resumed in place.
func TestAResumableProcessContinues(t *testing.T) {
	t.Parallel()
	finished := time.Date(2026, 9, 28, 11, 0, 0, 0, time.UTC)
	h := newHarness()
	sessioned(h, definition.SessionResumable)
	h.runs.records["run-0"] = leftInTheWorktree(run.Record{ID: "run-0", Agent: "a", Call: onA(), Runtime: &run.Runtime{Adapter: "spy"}, FinishedAt: &finished,
		Result: &run.Result{Status: run.Interrupted, Session: &run.Session{ProviderSessionID: "prov-0"}}})
	h.runs.states["run-0"] = run.StateFinished
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	turns := h.runner.calls()
	if len(turns) != 1 || turns[0].ResumeSessionID != "prov-0" || record.Result.Session == nil || record.Result.Session.Continues != "run-0" {
		t.Fatalf("result %+v: %s, turns %+v", record.Result, message(record), turns)
	}
}

// A fresh-only process whose work resumes its session has a problem of its
// own: check reports it of the process, for every agent a node binds it
// to, and its call is refused before any turn.
func TestAFreshOnlyProcessThatResumesHasAProblemOfItsOwn(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		arrange func(*harness)
		reason  string
	}{
		{"repairs", verifying,
			"process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"},
		{"stale resumes", func(h *harness) { recovering(h, "max_resumes: 1, instruction: Go on.") },
			"process p: stale.recover.max_resumes 1 recovers in the call's session, but process p is fresh-only"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			c.arrange(h)
			sessioned(h, definition.SessionFresh)
			report := checkOf(t, h, false)
			if !reflect.DeepEqual(messages(report.Problems), []string{c.reason}) {
				t.Fatalf("check: problems = %q, want %q", messages(report.Problems), c.reason)
			}
			// It is not its agent's: no other agent runs the process.
			if reach := reachOf(t, report, c.reason); reach.Agent != "" || !reflect.DeepEqual(reach.Processes, []string{"p"}) {
				t.Fatalf("reach = %+v", reach)
			}
			record := h.call(t, contract.CallRequest{})
			// The refusal names the workflow that binds the process.
			if record.Result.Status != run.Failed || class(record) != run.ClassRefused || message(record) != "workflow p_a uses "+c.reason {
				t.Fatalf("result %+v, want refused (workflow p_a uses %s)", record.Result.Error, c.reason)
			}
			if len(h.runner.calls()) != 0 {
				t.Fatalf("turns %d after the refusal", len(h.runner.calls()))
			}
		})
	}
}

// The problem is the process's whatever its agent: it is reported where
// the agent it names does not exist, beside that.
func TestAFreshOnlyProcessThatRepairsIsReportedWithoutItsAgent(t *testing.T) {
	t.Parallel()
	h := newHarness()
	verifying(h)
	sessioned(h, definition.SessionFresh)
	delete(h.defs.docs[document.KindAgent], "a")
	const own = "process p: verify.max_attempts 3 repairs in the call's session, but process p is fresh-only"
	if got := messages(checkOf(t, h, false).Problems); !contains(got, own) {
		t.Fatalf("check: problems = %q, want %q among them", got, own)
	}
}

// A fresh-only process is not continued: the refusal names the process.
func TestAFreshOnlyProcessIsNotContinued(t *testing.T) {
	t.Parallel()
	finished := time.Date(2026, 9, 28, 11, 0, 0, 0, time.UTC)
	h := newHarness()
	sessioned(h, definition.SessionFresh)
	h.runs.records["run-0"] = leftInTheWorktree(run.Record{ID: "run-0", Agent: "a", Call: onA(), Runtime: &run.Runtime{Adapter: "spy"}, FinishedAt: &finished,
		Result: &run.Result{Status: run.Interrupted, Session: &run.Session{ProviderSessionID: "prov-0"}}})
	h.runs.states["run-0"] = run.StateFinished
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	const reason = "process p is fresh-only; it cannot continue run run-0"
	if class(record) != run.ClassRefused || !strings.Contains(message(record), reason) {
		t.Fatalf("result %+v, want refusal %q", record.Result.Error, reason)
	}
	if len(h.runner.calls()) != 0 {
		t.Fatal("effects before the refusal")
	}
	if record.Profile == nil || record.Profile.Session != definition.SessionFresh {
		t.Fatalf("profile = %+v", record.Profile)
	}
}
