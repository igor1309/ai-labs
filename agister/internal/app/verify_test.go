package app_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

const verifyBlock = `verify:
  command: go test ./...
  timeout: 10m
  max_attempts: 3
  instruction: The verification command failed. Fix the cause, not the check.
`

// verifying gives the harness's process p the verify block, a service
// ceiling of 3 attempts, a resumable agent a and a fresh-only agent f.
func verifying(h *harness) {
	h.defs.docs[definition.KindProcess]["p"] += verifyBlock
	h.defs.docs[definition.KindService]["service"] += "max_verify_attempts = 3\n"
	h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
	h.defs.docs[definition.KindAgent]["f"] = strings.Replace(settingsDocs()[definition.KindAgent]["a"], `name = "a"`, `name = "f"`, 1)
}

// A verifying call runs its command after a valid turn, bounded by
// verify.timeout, with its process group on record, in a clean copy of the
// base with the turn's patch applied, not in the checkout; it completes on
// a pass, delivering exactly the patch the pass checked.
func TestAVerifyingCallRunsItsCommandAfterTheTurn(t *testing.T) {
	h := newHarness()
	verifying(h)
	h.changes.changes = []byte("diff --git a/x b/x\n")
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 || h.runner.calls()[0].ResumeSessionID != "" {
		t.Fatalf("result %+v, turns %+v", record.Result, h.runner.calls())
	}
	want := []app.CommandRequest{{Command: "go test ./...", Dir: "/work/copy-1", Timeout: 10 * time.Minute, Bound: 8 << 10}}
	if got := h.commands.runs(); !reflect.DeepEqual(got, want) {
		t.Fatalf("command runs = %+v", got)
	}
	if copies := h.copies.copies(); !reflect.DeepEqual(copies, []madeCopy{{"/repo", "sha-HEAD", "diff --git a/x b/x\n", "/work/copy-1"}}) {
		t.Fatalf("copies = %+v", copies)
	}
	if delivered := string(h.recorder.artifacts["changes.patch"]); delivered != h.copies.copies()[0].patch {
		t.Fatalf("delivered %q, checked %q", delivered, h.copies.copies()[0].patch)
	}
	if record.Effects == nil || record.Effects.Command == nil || record.Effects.Command.Ref != "ref-cmd" || record.Effects.Copy != nil || len(h.copies.left()) != 0 {
		t.Fatalf("effects = %+v, copies left %v", record.Effects, h.copies.left())
	}
	if len(record.Attempts) != 1 || !record.Attempts[0].Run.Passed || record.Attempts[0].Identity != "tree" || record.Attempts[0].Run.Dir != "/work/copy-1" {
		t.Fatalf("attempts %+v", record.Attempts)
	}
	if kinds := strings.Join(h.recorder.kinds(), " "); !strings.Contains(kinds, "VERIFY_STARTED VERIFY_FINISHED") {
		t.Fatalf("events = %s", kinds)
	}
}

// The copy is on record while the command runs in it, beside the command's
// process group, so a reap after a killed CLI removes it.
func TestTheCleanCopyIsOnRecordWhileTheCommandRuns(t *testing.T) {
	h := newHarness()
	verifying(h)
	var running *run.Effects
	h.commands.running = func(app.CommandRequest) {
		h.recorder.mu.Lock()
		defer h.recorder.mu.Unlock()
		running = h.recorder.updates[len(h.recorder.updates)-1].Effects
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v", record.Result)
	}
	if running == nil || running.Command == nil || !reflect.DeepEqual(running.Copy, &run.Checkout{Repository: "/repo", Dir: "/work/copy-1"}) {
		t.Fatalf("effects while the command ran = %+v", running)
	}
}

// The case of LAB-15: the base ignores *.log and has no new.log, and the
// agent creates new.log, which the check needs. Ignored, it is not the
// checkout's content and no patch carries it, so the check, which would
// pass in the checkout, fails on the clean copy: the attempt fails, the
// failure goes back to the agent in its checkout, and nothing is
// delivered as verified.
func TestAnIgnoredFileTheCheckNeedsFailsTheAttempt(t *testing.T) {
	h := newHarness()
	verifying(h)
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "command: go test ./...", "command: test -f new.log", 1)
	// Where new.log is: the agent's checkout alone. Its content, and the
	// patch to it, are the base's.
	files := map[string][]string{"/work/checkout": {"new.log"}}
	h.commands.exitIn = func(dir string) int {
		if slices.Contains(files[dir], "new.log") {
			return 0
		}
		return 1
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status == run.Completed || len(record.Attempts) == 0 {
		t.Fatalf("result %+v, attempts %+v", record.Result, record.Attempts)
	}
	first := record.Attempts[0]
	if first.Run == nil || first.Run.Passed || first.Run.Dir != "/work/copy-1" || *first.Run.Exit.Code != 1 {
		t.Fatalf("attempt 1 = %+v, run %+v", first, first.Run)
	}
	if copies := h.copies.copies(); len(copies) != 1 || copies[0].patch != "" {
		t.Fatalf("copies = %+v", copies)
	}
	turns := h.runner.calls()
	if len(turns) != 2 || turns[1].Cwd != "/work/checkout" || turns[1].ResumeSessionID != "prov-1" || !strings.Contains(turns[1].Prompt, "test -f new.log") {
		t.Fatalf("turns = %+v", turns)
	}
	if _, delivered := h.recorder.artifacts["changes.patch"]; delivered || len(h.copies.left()) != 0 {
		t.Fatalf("artifacts %v, copies left %v", h.recorder.artifacts, h.copies.left())
	}
}

// A clean copy that cannot be made, recorded or shown to have the content
// the attempt checks fails the call as internal, as a capture that does
// not reproduce verified content does: no command runs, no repair starts,
// and the copy made is removed.
func TestACleanCopyThatCannotBeCheckedFailsTheCall(t *testing.T) {
	cases := []struct {
		name    string
		arrange func(*harness)
		message string
	}{
		{"not made", func(h *harness) { h.copies.err = errors.New("no space") }, "making the clean copy to check: no space"},
		{"not recorded", func(h *harness) {
			h.recorder.updateErr = func(record run.Record) error {
				if record.Effects != nil && record.Effects.Copy != nil {
					return errors.New("disk full")
				}
				return nil
			}
		}, "recording the clean copy failed: disk full"},
		{"other content", func(h *harness) { h.changes.copied = func(string, int) string { return "other" } },
			"the captured changes do not reproduce attempt 1's content: applied to sha-HEAD they make other, not tree"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness()
			verifying(h)
			c.arrange(h)
			record := h.call(t, contract.CallRequest{})
			if record.Result.Status != run.Failed || class(record) != run.ClassInternal || message(record) != c.message {
				t.Fatalf("result %+v", record.Result.Error)
			}
			if len(h.commands.runs()) != 0 || len(h.runner.calls()) != 1 || len(record.Attempts) != 1 || record.Attempts[0].Run != nil || record.Attempts[0].Stopped == "" {
				t.Fatalf("runs %d, turns %d, attempts %+v", len(h.commands.runs()), len(h.runner.calls()), record.Attempts)
			}
			if len(h.copies.left()) != 0 || (record.Effects != nil && record.Effects.Copy != nil) {
				t.Fatalf("copies left %v, effects %+v", h.copies.left(), record.Effects)
			}
		})
	}
}

// Rule 7 on the clean copy: a run that changes the copy's content fails
// whatever its exit, and the evidence keeps what it changed. The run never
// touched the checkout, so a repair that changes nothing there has made no
// progress.
func TestARunThatChangesItsCleanCopyFails(t *testing.T) {
	h := newHarness()
	verifying(h)
	h.changes.changes = []byte("diff --git a/ran.txt b/ran.txt\n")
	h.changes.copied = func(_ string, named int) string {
		if named == 0 {
			return "tree"
		}
		return "tree-after-run"
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Failed || class(record) != run.ClassBudgetExhausted || message(record) != "no progress: attempt 2's content is what attempt 1 checked" {
		t.Fatalf("result %+v", record.Result.Error)
	}
	ran := record.Attempts[0].Run
	if ran == nil || ran.Passed || *ran.Exit.Code != 0 || ran.After != "tree-after-run" || ran.AfterChanges == nil || ran.AfterChanges.Name != "attempt-1-run.patch" {
		t.Fatalf("attempt 1's run = %+v", ran)
	}
	if turns := h.runner.calls(); len(turns) != 2 || !strings.Contains(turns[1].Prompt, "exit code 0; the run changed the content it checked") {
		t.Fatalf("turns = %+v", turns)
	}
	if !contains(h.recorder.kinds(), "VERIFY_CHANGED_CONTENT") || len(h.copies.left()) != 0 {
		t.Fatalf("events %v, copies left %v", h.recorder.kinds(), h.copies.left())
	}
}

// Every attempt's clean copy is removed when the attempt ends, before any
// repair turn starts, however the attempt ends, and the record then no
// longer names it.
func TestEveryCleanCopyIsRemovedAfterItsAttempt(t *testing.T) {
	cases := []struct {
		name    string
		arrange func(*harness)
		status  run.Status
		copies  int
	}{
		{"passed", nil, run.Completed, 1},
		{"failed, repaired, passed", func(h *harness) {
			h.commands.exits = []int{1}
			identities := 0
			h.changes.identify = func() string { identities++; return fmt.Sprintf("tree-%d", identities) }
		}, run.Completed, 2},
		{"failed with no attempts left", func(h *harness) {
			h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "max_attempts: 3", "max_attempts: 1", 1)
			h.commands.exits = []int{1}
		}, run.Failed, 1},
		{"could not run", func(h *harness) {
			h.recorder.updateErr = func(record run.Record) error {
				if record.Effects != nil && record.Effects.Command != nil {
					return errors.New("disk full")
				}
				return nil
			}
		}, run.Failed, 1},
		{"its command panicked", func(h *harness) { h.commands.running = func(app.CommandRequest) { panic("the runner exploded") } }, run.Failed, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness()
			verifying(h)
			if c.arrange != nil {
				c.arrange(h)
			}
			// How many turns had run when each copy was removed.
			var removedAfter []int
			h.copies.removing = func(string) { removedAfter = append(removedAfter, len(h.runner.calls())) }
			record := h.call(t, contract.CallRequest{})
			if record.Result.Status != c.status {
				t.Fatalf("result %+v", record.Result)
			}
			if len(h.copies.copies()) != c.copies || len(h.copies.left()) != 0 || (record.Effects != nil && record.Effects.Copy != nil) {
				t.Fatalf("copies %+v, left %v, effects %+v", h.copies.copies(), h.copies.left(), record.Effects)
			}
			for i, turns := range removedAfter {
				if turns != i+1 {
					t.Fatalf("copy %d removed after %d turns", i+1, turns)
				}
			}
		})
	}
}

// A copy that cannot be removed is an event, and the record keeps naming
// it.
func TestACleanCopyThatCannotBeRemovedStaysOnRecord(t *testing.T) {
	h := newHarness()
	verifying(h)
	h.copies.removeErr = errors.New("busy")
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed || !contains(h.recorder.kinds(), "VERIFY_COPY_REMOVE_FAILED") {
		t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
	}
	if record.Effects == nil || !reflect.DeepEqual(record.Effects.Copy, &run.Checkout{Repository: "/repo", Dir: "/work/copy-1"}) {
		t.Fatalf("effects = %+v", record.Effects)
	}
}

// A failed run is repaired in the call's session with the failure, and the
// repair turn gets what is left of the call's time and cost.
func TestAFailedRunIsRepairedInTheCallsSession(t *testing.T) {
	h := newHarness()
	h.clock = &steppingClock{now: time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)}
	h.calls = h.callsOn(h.defs)
	verifying(h)
	h.defs.docs[definition.KindPolicy]["pol"] += "max_cost_usd: 2\n"
	cost := 0.5
	h.runner.turn.CostUSD = &cost
	h.commands.exits = []int{1}
	// Each repair turn names content not checked before.
	identities := 0
	h.changes.identify = func() string { identities++; return fmt.Sprintf("tree-%d", identities) }
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed || len(h.commands.runs()) != 2 || len(record.Attempts) != 2 {
		t.Fatalf("result %+v, attempts %+v", record.Result, record.Attempts)
	}
	turns := h.runner.calls()
	if len(turns) != 2 || turns[1].ResumeSessionID != "prov-1" || turns[1].Cwd != "/work/checkout" || *turns[1].MaxCostUSD != 1.5 || turns[1].Timeout >= 20*time.Minute || turns[1].Timeout < 19*time.Minute ||
		!strings.HasPrefix(turns[1].Prompt, "The verification command failed. Fix the cause, not the check.\n\n## command\n\n```\ngo test ./...\n```\n\n## exit status\n\nexit code 1") {
		t.Fatalf("repair turn = %+v", turns[1])
	}
	if *record.Result.Cost.USD != 1 || record.Attempts[1].Session != "prov-1" {
		t.Fatalf("result %+v", record.Result)
	}
}

// A repair resumes the call's session, so it costs what it added to the
// session's total, which the turn before it reported; the first turn of a
// continuation starts from the continued run's recorded total. The call's
// cost and each repair's budget sum those own costs, and a repair after a
// turn with no reported total costs an unknown amount.
func TestARepairCostsWhatItAddedToTheCallsSession(t *testing.T) {
	usd := func(v float64) *float64 { return &v }
	cases := []struct {
		name      string
		continues bool       // the call continues run-0, whose session had cost 7.75
		totals    []*float64 // each turn's reported session total
		limit     string
		own       []*float64 // each turn's own cost
		budgets   []*float64 // each turn's cost limit
		cost      *float64   // the call's
	}{
		{"fresh session", false, []*float64{usd(0.5), usd(0.75), usd(1.25)}, "max_cost_usd: 2\n",
			[]*float64{usd(0.5), usd(0.25), usd(0.5)}, []*float64{usd(2), usd(1.5), usd(1.25)}, usd(1.25)},
		{"continuation", true, []*float64{usd(12.5), usd(13.625), usd(14)}, "max_cost_usd: 10\n",
			[]*float64{usd(4.75), usd(1.125), usd(0.375)}, []*float64{usd(10), usd(5.25), usd(4.125)}, usd(6.25)},
		{"earlier total unknown", false, []*float64{nil, usd(0.75), usd(1.25)}, "",
			[]*float64{nil, nil, usd(0.5)}, []*float64{nil, nil, nil}, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness()
			verifying(h)
			h.defs.docs[definition.KindPolicy]["pol"] += c.limit
			session, request := "prov-1", contract.CallRequest{}
			if c.continues {
				session, request.Continue = "prov-0", "run-0"
				finished := time.Date(2026, 9, 28, 11, 0, 0, 0, time.UTC)
				h.runs.records["run-0"] = run.Record{ID: "run-0", Agent: "a", Runtime: &run.Runtime{Adapter: "spy"}, FinishedAt: &finished,
					Turn:   &run.Turn{ProviderSessionID: "prov-0", Session: &run.SessionTotals{CostUSD: usd(7.75)}},
					Result: &run.Result{Status: run.Completed, Session: &run.Session{ProviderSessionID: "prov-0"}}}
				h.runs.states["run-0"] = run.StateFinished
			}
			for _, total := range c.totals {
				turn := run.Turn{Status: run.Completed, Output: json.RawMessage(`{"outcome":"no"}`), ProviderSessionID: session}
				if total != nil {
					turn.Session = &run.SessionTotals{CostUSD: total}
				}
				h.runner.turns = append(h.runner.turns, turn)
			}
			h.commands.exits = []int{1, 1}
			identities := 0
			h.changes.identify = func() string { identities++; return fmt.Sprintf("tree-%d", identities) }
			record := h.call(t, request)
			if record.Result.Status != run.Completed || len(record.Attempts) != 3 {
				t.Fatalf("result %+v, attempts %+v", record.Result, record.Attempts)
			}
			for i, attempt := range record.Attempts {
				if got := attempt.Turn.CostUSD; !reflect.DeepEqual(got, c.own[i]) || !reflect.DeepEqual(attempt.Turn.Session, h.runner.turns[i].Session) {
					t.Fatalf("attempt %d: cost %v, want %v; session %+v", i+1, deref(got), deref(c.own[i]), attempt.Turn.Session)
				}
				if got := h.runner.calls()[i].MaxCostUSD; !reflect.DeepEqual(got, c.budgets[i]) {
					t.Fatalf("turn %d: cost limit %v, want %v", i+1, deref(got), deref(c.budgets[i]))
				}
			}
			if !reflect.DeepEqual(record.Result.Cost.USD, c.cost) || (c.cost == nil) != (record.Result.Cost.Source == run.CostUnknown) {
				t.Fatalf("call cost %+v, want %v", record.Result.Cost, deref(c.cost))
			}
		})
	}
}

// deref shows an optional figure.
func deref(v *float64) any {
	if v == nil {
		return nil
	}
	return *v
}

// A node completes only once its attempts are recorded, and a repair starts
// only once the failed attempt is: an attempt that cannot be recorded ends
// the call as internal, with no completion and no repair turn.
func TestAnAttemptThatCannotBeRecordedStopsTheCall(t *testing.T) {
	cases := []struct {
		name  string
		exits []int
		fails func(run.Attempt) bool // which attempt's update fails
	}{
		{"passing attempt", nil, func(a run.Attempt) bool { return a.Run != nil && a.Run.Passed }},
		{"failed attempt before repair", []int{1}, func(a run.Attempt) bool { return a.Run != nil && !a.Run.Passed && a.Stopped == "" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness()
			verifying(h)
			h.commands.exits = c.exits
			h.recorder.updateErr = func(record run.Record) error {
				if n := len(record.Attempts); n > 0 && c.fails(record.Attempts[n-1]) {
					return errors.New("disk full")
				}
				return nil
			}
			record := h.call(t, contract.CallRequest{})
			if record.Result.Status != run.Failed || class(record) != run.ClassInternal || message(record) != "recording attempt 1 failed: disk full" {
				t.Fatalf("result %+v", record.Result)
			}
			if len(h.runner.calls()) != 1 || len(h.commands.runs()) != 1 || len(h.copies.left()) != 0 || record.Result.Output != nil {
				t.Fatalf("turns %d, runs %d, copies left %v", len(h.runner.calls()), len(h.commands.runs()), h.copies.left())
			}
		})
	}
}

// Rule 4 at call time: a caller's --timeout that makes the call shorter
// than one verification run refuses the call before its first turn, with
// the message check gives when it can know it.
func TestVerifyTimeoutAboveTheCallersTimeoutRefusesTheCall(t *testing.T) {
	h := newHarness()
	verifying(h)
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	if report, err := checker.Check(context.Background(), false); err != nil || len(report.Problems) != 0 {
		t.Fatalf("check: %v, %v", report.Problems, err)
	}
	record := h.call(t, contract.CallRequest{Timeout: "5m"})
	want := "verify.timeout 10m0s exceeds the effective timeout 5m0s"
	if record.Result.Status != run.Failed || class(record) != run.ClassRefused || !strings.Contains(message(record), want) {
		t.Fatalf("result %+v, want refused (%s)", record.Result.Error, want)
	}
	if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 {
		t.Fatalf("turns %d, checkouts %v after the refusal", len(h.runner.calls()), h.workspaces.checkouts)
	}
}

// Rule 6: a repair turn resumes the call's session, so more than one
// attempt with an agent or a runtime that cannot continue sessions refuses
// the call before its first turn, and the refusal is recorded.
func TestVerifyRepairsWithoutResumableSessionsRefuseTheCall(t *testing.T) {
	cases := []struct {
		name    string
		arrange func(*harness)
		request contract.CallRequest
		reason  string
	}{
		{"fresh-only agent", nil, contract.CallRequest{Agent: "f"},
			"verify.max_attempts 3 repairs in the call's session, but agent f is fresh-only"},
		{"runtime without resume", func(h *harness) { h.runner.identity.Resume = false }, contract.CallRequest{},
			"verify.max_attempts 3 repairs in the call's session, but runtime rt cannot resume sessions"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness()
			verifying(h)
			if c.arrange != nil {
				c.arrange(h)
			}
			record := h.call(t, c.request)
			if record.Result.Status != run.Failed || class(record) != run.ClassRefused || message(record) != c.reason {
				t.Fatalf("result %+v, want refused (%s)", record.Result.Error, c.reason)
			}
			if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 {
				t.Fatalf("turns %d, checkouts %v after the refusal", len(h.runner.calls()), h.workspaces.checkouts)
			}
			if kinds := h.recorder.kinds(); !contains(kinds, "REFUSED") || contains(kinds, "PLANNED") || kinds[len(kinds)-1] != "CALL_FINISHED" {
				t.Fatalf("events = %v", kinds)
			}
		})
	}
}

// The verify a call runs with is the one it resolved: recorded with the
// run, part of the process definition whose digest the record keeps, and
// unchanged by an edit after resolution.
func TestRecordedVerifyIsTheResolvedOneUnderTheProcessDigest(t *testing.T) {
	h := newHarness()
	verifying(h)
	resolved := h.defs.docs[definition.KindProcess]["p"]
	h.recorder.hold = make(chan struct{})
	if _, err := h.calls.Submit(context.Background(), contract.CallRequest{Process: "p", Cwd: "/repo"}); err != nil {
		t.Fatal(err)
	}
	h.defs.set(definition.KindProcess, "p", strings.Replace(resolved, "go test ./...", "true", 1))
	close(h.recorder.hold)
	record := h.recorder.wait(t)
	if class(record) != "" {
		t.Fatalf("call failed: %s", message(record))
	}
	want := run.Verify{Command: "go test ./...", Timeout: 10 * time.Minute, MaxAttempts: 3, Instruction: "The verification command failed. Fix the cause, not the check."}
	if record.Verify == nil || *record.Verify != want {
		t.Fatalf("verify = %+v", record.Verify)
	}
	var digest string
	for _, source := range record.Definitions {
		if source.Kind == string(definition.KindProcess) {
			digest = source.SHA256
		}
	}
	// The digest is of the document with the verify block as resolved; a
	// document differing only in its verify has another.
	if digest != sha(resolved) || digest == sha(strings.Replace(resolved, "go test ./...", "true", 1)) {
		t.Fatalf("process digest %s, want %s", digest, sha(resolved))
	}
}

// process show prints the verify block, and the warning of ADR-002 rule 10
// while verification is in effect: not for a call that would be refused.
func TestShowProcessShowsVerifyAndItsWarning(t *testing.T) {
	h := newHarness()
	inspection := app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator))
	view, err := inspection.ShowProcess(context.Background(), "p", "")
	if err != nil || view.Verify != nil || len(view.Warnings) != 0 {
		t.Fatalf("without verify: %+v, %v, %v", view.Verify, view.Warnings, err)
	}

	verifying(h)
	view, err = inspection.ShowProcess(context.Background(), "p", "")
	want := contract.Verify{Command: "go test ./...", Timeout: 10 * time.Minute, MaxAttempts: 3, Instruction: "The verification command failed. Fix the cause, not the check."}
	if err != nil || view.Verify == nil || *view.Verify != want || view.Refusal != "" {
		t.Fatalf("verify = %+v, refusal %q, %v", view.Verify, view.Refusal, err)
	}
	if !reflect.DeepEqual(view.Warnings, []string{app.VerifyWarning}) ||
		!strings.Contains(app.VerifyWarning, "operator's authority") || !strings.Contains(app.VerifyWarning, "code the agent wrote") || !strings.Contains(app.VerifyWarning, "Agister's state") {
		t.Fatalf("warnings = %q", view.Warnings)
	}

	view, err = inspection.ShowProcess(context.Background(), "p", "f")
	if err != nil || view.Verify == nil || view.Refusal == "" || len(view.Warnings) != 0 {
		t.Fatalf("refused: verify %+v, refusal %q, warnings %q, %v", view.Verify, view.Refusal, view.Warnings, err)
	}
}

// check prints the same warning once per process with verify, and reports
// a runtime that cannot resume the sessions repairs need when it probes.
func TestCheckWarnsOncePerProcessWithVerify(t *testing.T) {
	h := newHarness()
	verifying(h)
	h.defs.docs[definition.KindProcess]["q"] = strings.Replace(settingsDocs()[definition.KindProcess]["p"], "name: p", "name: q", 1)
	h.defs.docs[definition.KindProcess]["r"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "name: p", "name: r", 1)
	checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
	report, err := checker.Check(context.Background(), false)
	if err != nil || len(report.Problems) != 0 {
		t.Fatalf("check: %v, %v", report.Problems, err)
	}
	if want := []string{"process p: " + app.VerifyWarning, "process r: " + app.VerifyWarning}; !reflect.DeepEqual(report.Warnings, want) {
		t.Fatalf("warnings = %q", report.Warnings)
	}

	h.runner.identity.Resume = false
	report, _ = checker.Check(context.Background(), true)
	want := []string{
		"process p: verify.max_attempts 3 repairs in the call's session, but runtime rt cannot resume sessions",
		"process r: verify.max_attempts 3 repairs in the call's session, but runtime rt cannot resume sessions",
	}
	if !reflect.DeepEqual(report.Problems, want) {
		t.Fatalf("problems = %q", report.Problems)
	}
}
