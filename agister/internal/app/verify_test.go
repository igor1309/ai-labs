package app_test

import (
	"context"
	"reflect"
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

// Declaring verify changes nothing yet about how the call runs: one turn,
// completed, as without it.
func TestAVerifyingCallRunsAsBefore(t *testing.T) {
	h := newHarness()
	verifying(h)
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 || h.runner.calls()[0].ResumeSessionID != "" {
		t.Fatalf("result %+v, turns %+v", record.Result, h.runner.calls())
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
