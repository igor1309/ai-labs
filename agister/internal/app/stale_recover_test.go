package app_test

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// recovering gives the harness's policy the recovery budget given and makes
// its agent resumable.
func recovering(h *harness, recover string) {
	h.defs.docs[definition.KindPolicy]["pol"] += "stale: {recover: {" + recover + "}}\n"
	h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
}

// ADR-024 rule 6: a recovery turn resumes the call's session, so a budget
// above 0 with an agent or a runtime that cannot continue sessions refuses
// the call before its first turn, and check reports it: the runtime's part
// when it probes.
func TestAStaleRecoveryBudgetWithoutResumableSessionsRefusesTheCall(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		arrange func(*harness)
		probe   bool
		reason  string
	}{
		{"fresh-only agent", func(h *harness) {
			h.defs.docs[definition.KindAgent]["a"] = settingsDocs()[definition.KindAgent]["a"]
		}, false, "process p: stale.recover.max_resumes 1 recovers in the call's session, but agent a is fresh-only"},
		{"runtime without resume", func(h *harness) { h.runner.identity.Resume = false },
			true, "process p: stale.recover.max_resumes 1 recovers in the call's session, but runtime rt cannot resume sessions"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			recovering(h, "max_resumes: 1, instruction: Go on.")
			c.arrange(h)
			if report := checkOf(t, h, c.probe); !reflect.DeepEqual(messages(report.Problems), []string{c.reason}) {
				t.Fatalf("check: problems = %q, want %q", messages(report.Problems), c.reason)
			}
			record := h.call(t, contract.CallRequest{})
			if record.Result.Status != run.Failed || class(record) != run.ClassRefused || message(record) != c.reason {
				t.Fatalf("result %+v, want refused (%s)", record.Result.Error, c.reason)
			}
			if len(h.runner.calls()) != 0 {
				t.Fatalf("turns %d after the refusal", len(h.runner.calls()))
			}
			if kinds := h.recorder.kinds(); !contains(kinds, "REFUSED") || contains(kinds, "PLANNED") || kinds[len(kinds)-1] != "CALL_FINISHED" {
				t.Fatalf("events = %v", kinds)
			}
		})
	}
}

// Without a budget nothing resumes: a fresh-only agent and a runtime that
// cannot resume run the call, whether no policy sets max_resumes, the
// policy sets 0 or the process lowers its policy's to 0.
func TestWithoutAStaleRecoveryBudgetNoSessionIsNeeded(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		arrange func(*harness)
	}{
		{"unset", func(h *harness) {
			h.defs.docs[definition.KindPolicy]["pol"] += "stale: {no_event: 5m}\n"
		}},
		{"the policy sets 0", func(h *harness) {
			h.defs.docs[definition.KindPolicy]["pol"] += "stale: {recover: {max_resumes: 0, instruction: Go on.}}\n"
		}},
		{"the process lowers it to 0", func(h *harness) {
			h.defs.docs[definition.KindPolicy]["pol"] += "stale: {recover: {max_resumes: 1, instruction: Go on.}}\n"
			h.defs.docs[definition.KindProcess]["p"] += "stale: {recover: {max_resumes: 0}}\n"
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := newHarness() // its agent is fresh-only
			h.runner.identity.Resume = false
			c.arrange(h)
			if report := checkOf(t, h, true); len(report.Problems) != 0 {
				t.Fatalf("check: problems = %q", messages(report.Problems))
			}
			record := h.call(t, contract.CallRequest{})
			if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 {
				t.Fatalf("result %+v: %s, turns %d", record.Result, message(record), len(h.runner.calls()))
			}
			if stale := record.Effective.Stale; stale != nil && stale.Recover != nil {
				t.Fatalf("recorded recovery = %+v", stale.Recover)
			}
		})
	}
}

// check reports a budget the settings cannot give: one a process widens,
// and one without an instruction.
func TestCheckRejectsAStaleRecoveryBudgetThatDoesNotCompose(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		policy  string
		process string
		problem string
	}{
		{"a process widens its policy's", "max_resumes: 1, instruction: Go on.", "stale: {recover: {max_resumes: 2}}\n",
			"process p: stale.recover.max_resumes: 2 widens the policy's 1"},
		{"no instruction", "max_resumes: 1", "",
			"process p: stale.recover.max_resumes 1 needs stale.recover.instruction: neither the process nor its policy gives one"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			recovering(h, c.policy)
			h.defs.docs[definition.KindProcess]["p"] += c.process
			if report := checkOf(t, h, false); !reflect.DeepEqual(messages(report.Problems), []string{c.problem}) {
				t.Fatalf("problems = %q, want %q", messages(report.Problems), c.problem)
			}
		})
	}
}

// The effective budget and instruction are the call's and are recorded
// with its other limits (ADR-024 rule 5): the policy's budget as the
// process lowers it, with the process's instruction. The call acts on
// them: its stale turn is recovered with the process's instruction, and
// the second stale turn ends it, the process's one resume spent.
func TestACallCarriesAndRecordsItsStaleRecovery(t *testing.T) {
	t.Parallel()
	h, timers := staleHarness(t, "no_event: 5m, tool_command: 4m, recover: {max_resumes: 2, instruction: Policy.}")
	h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
	h.defs.docs[definition.KindProcess]["p"] += "stale: {recover: {max_resumes: 1, instruction: Process.}}\n"
	play(h, commanding(timers, "prov-1", tailLog), silent(timers, "prov-1"), completes(h))
	record := h.call(t, contract.CallRequest{})

	want := &run.StaleLimits{NoEvent: 5 * time.Minute, ToolCommand: 4 * time.Minute, Recover: &run.StaleRecover{MaxResumes: 1, Instruction: "Process."}}
	if !reflect.DeepEqual(record.Effective.Stale, want) {
		t.Fatalf("effective stale = %+v, recover %+v", record.Effective.Stale, record.Effective.Stale.Recover)
	}
	recorded, err := json.Marshal(record.Effective.Stale)
	if wantJSON := `{"no_event":300000000000,"tool_command":240000000000,"recover":{"max_resumes":1,"instruction":"Process."}}`; err != nil || string(recorded) != wantJSON {
		t.Fatalf("recorded = %s, %v, want %s", recorded, err, wantJSON)
	}
	// Until ADR-024's recovery turn was built nothing acted on the budget,
	// and this asserted the stale turn ended the call after one turn. Now
	// the budget is spent: the process's 1, not the policy's 2, so the
	// second stale turn ends the call, after two turns.
	turns := h.runner.calls()
	if record.Result.Status != run.Interrupted || class(record) != run.ClassTimeout ||
		message(record) != "stale: the runtime reported no event for 5m0s (stale.no_event)" || len(turns) != 2 {
		t.Fatalf("result = %+v, turns %d", record.Result, len(turns))
	}
	if !strings.HasPrefix(turns[1].Prompt, "Process.\n\n## stale limit\n\nstale.tool_command") || len(record.Recoveries) != 1 {
		t.Fatalf("recovery turn = %q, recoveries %+v", turns[1].Prompt, record.Recoveries)
	}
}

// A budget is recorded even where no staleness limit is set beside it.
func TestAStaleRecoveryBudgetAloneIsRecorded(t *testing.T) {
	t.Parallel()
	h := newHarness()
	recovering(h, "max_resumes: 1, instruction: Go on.")
	record := h.call(t, contract.CallRequest{})
	want := &run.StaleLimits{Recover: &run.StaleRecover{MaxResumes: 1, Instruction: "Go on."}}
	if record.Result.Status != run.Completed || !reflect.DeepEqual(record.Effective.Stale, want) {
		t.Fatalf("result %+v: %s, effective stale = %+v", record.Result, message(record), record.Effective.Stale)
	}
}

// process show shows the effective budget with the other staleness limits:
// the policy's, lowered by the process.
func TestShowProcessShowsTheEffectiveStaleRecoveryBudget(t *testing.T) {
	t.Parallel()
	show := func(h *harness) contract.ProcessView {
		t.Helper()
		inspection := app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator, resolverCheckStub{}))
		view, err := inspection.ShowProcess(context.Background(), "p", "")
		if err != nil || view.Refusal != "" {
			t.Fatalf("refusal %q, %v", view.Refusal, err)
		}
		return view
	}
	h := newHarness()
	recovering(h, "max_resumes: 2, instruction: Go on.")
	if view := show(h); view.Stale != (contract.Stale{MaxResumes: 2}) {
		t.Fatalf("the policy's: stale = %+v", view.Stale)
	}
	h.defs.docs[definition.KindProcess]["p"] += "stale: {recover: {max_resumes: 1}}\n"
	if view := show(h); view.Stale != (contract.Stale{MaxResumes: 1}) {
		t.Fatalf("lowered: stale = %+v", view.Stale)
	}
	h.defs.docs[definition.KindProcess]["p"] = settingsDocs()[definition.KindProcess]["p"] + "stale: {recover: {max_resumes: 0}}\n"
	if view := show(h); view.Stale != (contract.Stale{}) {
		t.Fatalf("lowered to 0: stale = %+v", view.Stale)
	}
}
