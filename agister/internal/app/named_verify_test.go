package app_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// A process names its verification (ADR-010).

const verification = `schema: agister.verify/v1alpha1
name: repo
command: go test ./...
timeout: 10m
max_attempts: 3
instruction: The verification command failed. Fix the cause, not the check.
`

// naming gives the harness's process p the reference verify:repo, a
// service ceiling of 3 attempts and a resumable agent a, and no
// verification: named adds it.
func naming(h *harness) {
	h.defs.docs[definition.KindProcess]["p"] += "verify: verify:repo\n"
	h.defs.docs[definition.KindService]["service"] += "max_verify_attempts = 3\n"
	h.defs.docs[definition.KindAgent]["a"] += "session = \"resumable\"\n"
	h.defs.docs[definition.KindVerify] = map[string]string{}
}

func named(h *harness, text string) {
	naming(h)
	h.defs.docs[definition.KindVerify]["repo"] = text
}

func checkOf(t *testing.T, h *harness, probe bool) contract.CheckReport {
	t.Helper()
	report, err := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"}).Check(context.Background(), probe)
	if err != nil {
		t.Fatal(err)
	}
	return report
}

// Rule 3: the named document is the call's verify, and is recorded among
// the call's definitions with its digest.
func TestACallVerifiesWithTheVerificationItsProcessNames(t *testing.T) {
	h := newHarness()
	named(h, verification)
	h.changes.changes = []byte("diff --git a/x b/x\n")
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
	if runs := h.commands.runs(); len(runs) != 1 || runs[0].Command != "go test ./..." || runs[0].Timeout != 10*time.Minute {
		t.Fatalf("command runs = %+v", runs)
	}
	want := run.Verify{Command: "go test ./...", Timeout: 10 * time.Minute, MaxAttempts: 3, Instruction: "The verification command failed. Fix the cause, not the check."}
	if record.Verify == nil || *record.Verify != want {
		t.Fatalf("verify = %+v", record.Verify)
	}
	var digest string
	for _, source := range record.Definitions {
		if source.Kind == string(definition.KindVerify) && source.Name == "repo" {
			digest = source.SHA256
		}
	}
	if digest != sha(verification) {
		t.Fatalf("verification digest %q among %+v, want %s", digest, record.Definitions, sha(verification))
	}
}

// Rule 4: a call of a process whose named verification does not exist is
// refused before the first turn, never run unverified; the settings pass
// check with a warning, and every other process runs.
func TestAMissingVerificationRefusesTheCallNotTheSettings(t *testing.T) {
	h := newHarness()
	naming(h)
	h.defs.docs[definition.KindProcess]["q"] = strings.Replace(settingsDocs()[definition.KindProcess]["p"], "name: p", "name: q", 1)

	report := checkOf(t, h, true)
	warning := "process p: names verify:repo, which does not exist; calls of it are refused until verifies/repo.yaml exists"
	if len(report.Problems) != 0 || !reflect.DeepEqual(report.Warnings, []string{warning}) {
		t.Fatalf("problems %q, warnings %q", report.Problems, report.Warnings)
	}

	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassRefused || message(record) != `process p names verify:repo: verification "repo": not found` {
		t.Fatalf("result %+v: %q", record.Result, message(record))
	}
	if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 || len(h.commands.runs()) != 0 {
		t.Fatalf("turns %d, checkouts %v, commands %v after the refusal", len(h.runner.calls()), h.workspaces.checkouts, h.commands.runs())
	}

	other := newHarness()
	other.defs.docs = h.defs.docs
	if record := other.call(t, contract.CallRequest{Process: "q"}); record.Result.Status != run.Completed {
		t.Fatalf("another process: %+v: %s", record.Result, message(record))
	}
}

// The checks on a verification's values are made with the process that
// names it, in check and when the call is resolved.
func TestANamedVerificationIsHeldToTheLimits(t *testing.T) {
	cases := []struct {
		name    string
		change  func(*harness)
		probe   bool
		problem string
	}{
		{"timeout above the call's", func(h *harness) {
			h.defs.docs[definition.KindVerify]["repo"] = strings.Replace(verification, "10m", "30m", 1)
		}, false, "process p: verify.timeout 30m0s exceeds the effective timeout 20m0s"},
		{"attempts above the service ceiling", func(h *harness) {
			h.defs.docs[definition.KindVerify]["repo"] = strings.Replace(verification, "max_attempts: 3", "max_attempts: 4", 1)
		}, false, "process p: verify.max_attempts 4 exceeds the service limit max_verify_attempts 3"},
		{"repairs on a fresh-only agent", func(h *harness) {
			h.defs.docs[definition.KindAgent]["a"] = settingsDocs()[definition.KindAgent]["a"]
		}, false, "process p: verify.max_attempts 3 repairs in the call's session, but agent a is fresh-only"},
		{"repairs on a runtime that cannot resume", func(h *harness) {
			h.runner.identity.Resume = false
		}, true, "process p: verify.max_attempts 3 repairs in the call's session, but runtime rt cannot resume sessions"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness()
			named(h, verification)
			c.change(h)
			if report := checkOf(t, h, c.probe); !reflect.DeepEqual(report.Problems, []string{c.problem}) {
				t.Fatalf("problems = %q, want %q", report.Problems, c.problem)
			}
			record := h.call(t, contract.CallRequest{})
			if class(record) != run.ClassRefused || !strings.Contains(message(record), strings.TrimPrefix(c.problem, "process p: ")) || len(h.runner.calls()) != 0 {
				t.Fatalf("result %+v: %q, turns %d", record.Result, message(record), len(h.runner.calls()))
			}
		})
	}
}

// A named verification in effect lends the operator's authority as an
// inline one does, and check says so.
func TestCheckWarnsOfAResolvedNamedVerification(t *testing.T) {
	h := newHarness()
	named(h, verification)
	report := checkOf(t, h, true)
	if len(report.Problems) != 0 || !reflect.DeepEqual(report.Warnings, []string{"process p: " + app.VerifyWarning}) {
		t.Fatalf("problems %q, warnings %q", report.Problems, report.Warnings)
	}
	if report.Checked["verifies"] != 1 {
		t.Fatalf("checked = %v", report.Checked)
	}
}

// A verification that exists but is invalid is a problem of that document
// alone: the process naming it gets neither a problem nor the warning of a
// missing one.
func TestAnInvalidVerificationIsAProblemOfItsOwn(t *testing.T) {
	h := newHarness()
	named(h, strings.Replace(verification, "command: go test ./...\n", "", 1)+"on_failure: stop\n")
	report := checkOf(t, h, false)
	want := []string{"verification repo: command: is required", "verification repo: on_failure: unknown field"}
	if !reflect.DeepEqual(report.Problems, want) || len(report.Warnings) != 0 {
		t.Fatalf("problems %q, warnings %q", report.Problems, report.Warnings)
	}
	for _, d := range report.Definitions {
		if d.Kind == "verifies" && !d.Invalid {
			t.Fatalf("verification = %+v", d)
		}
	}
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassRefused || !strings.Contains(message(record), "command: is required") || len(h.runner.calls()) != 0 {
		t.Fatalf("result %+v: %q", record.Result, message(record))
	}
}

// check --tree's links: the process uses the verification it names, found
// or not, and the verification is used by the process.
func TestCheckLinksAProcessToItsVerification(t *testing.T) {
	ref := func(kind, name string) contract.DefinitionRef { return contract.DefinitionRef{Kind: kind, Name: name} }
	definitions := func(h *harness) map[contract.DefinitionRef]contract.Definition {
		got := map[contract.DefinitionRef]contract.Definition{}
		for _, d := range checkOf(t, h, false).Definitions {
			got[ref(d.Kind, d.Name)] = d
		}
		return got
	}
	h := newHarness()
	named(h, verification)
	got := definitions(h)
	uses := []contract.DefinitionRef{ref("agents", "a"), ref("policies", "pol"), ref("verifies", "repo"), ref("schemas", "s")}
	if p := got[ref("processes", "p")]; !reflect.DeepEqual(p.Uses, uses) {
		t.Fatalf("p = %+v", p)
	}
	if repo := got[ref("verifies", "repo")]; !reflect.DeepEqual(repo.UsedBy, []contract.DefinitionRef{ref("processes", "p")}) || repo.Path != "mem/verifies/repo" {
		t.Fatalf("repo = %+v", repo)
	}

	missing := newHarness()
	naming(missing)
	got = definitions(missing)
	if p := got[ref("processes", "p")]; !reflect.DeepEqual(p.Uses, uses) {
		t.Fatalf("p without the verification = %+v", p)
	}
	if _, ok := got[ref("verifies", "repo")]; ok {
		t.Fatal("a verification that does not exist is listed")
	}
}

// process show prints the resolved fields and which verification they
// come from; a missing one is shown as the refusal it is.
func TestShowProcessShowsTheNamedVerification(t *testing.T) {
	h := newHarness()
	named(h, verification)
	inspection := app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator))
	view, err := inspection.ShowProcess(context.Background(), "p", "")
	want := contract.Verify{Command: "go test ./...", Timeout: 10 * time.Minute, MaxAttempts: 3, Instruction: "The verification command failed. Fix the cause, not the check."}
	if err != nil || view.Verify == nil || *view.Verify != want || view.VerifyName != "repo" || view.Refusal != "" {
		t.Fatalf("verify %+v from %q, refusal %q, %v", view.Verify, view.VerifyName, view.Refusal, err)
	}
	if !reflect.DeepEqual(view.Warnings, []string{app.VerifyWarning}) {
		t.Fatalf("warnings = %q", view.Warnings)
	}
	origin := contract.DefinitionOrigin{Kind: "verifies", Name: "repo", Layer: "global", Path: "mem/verifies/repo"}
	if !containsOrigin(view.Sources, origin) {
		t.Fatalf("sources = %+v", view.Sources)
	}

	delete(h.defs.docs[definition.KindVerify], "repo")
	view, err = inspection.ShowProcess(context.Background(), "p", "")
	if err != nil || view.Verify != nil || view.VerifyName != "repo" || len(view.Warnings) != 0 ||
		view.Refusal != `process p names verify:repo: verification "repo": not found` {
		t.Fatalf("missing: verify %+v from %q, refusal %q, warnings %q, %v", view.Verify, view.VerifyName, view.Refusal, view.Warnings, err)
	}
	// What was resolved before the refusal is still shown.
	if view.Agent != "a" || view.Runtime != "rt" {
		t.Fatalf("missing: agent %q, runtime %q", view.Agent, view.Runtime)
	}
}

func containsOrigin(origins []contract.DefinitionOrigin, want contract.DefinitionOrigin) bool {
	for _, origin := range origins {
		if origin == want {
			return true
		}
	}
	return false
}

// A snapshot keeps what the source answered for a verification a process
// names and the settings do not list, so the refusal of a call resolved
// from it says where the document was expected; and it reads the source no
// more for it.
func TestSnapshotKeepsTheReadOfAMissingNamedVerification(t *testing.T) {
	ctx := context.Background()
	h := newHarness()
	naming(h)
	missing := errors.New("not found (expected /repo/.agister/verifies/repo.yaml or /home/verifies/repo.yaml)")
	live := failingSource{definitionsSpy: h.defs, readErr: map[string]error{"verifies/repo": missing}}
	snap := app.Snapshot(ctx, live)
	reads := h.defs.readCount()
	if _, err := snap.Read(ctx, definition.KindVerify, "repo"); err != missing {
		t.Fatalf("read error = %v", err)
	}
	if names, err := snap.List(ctx, definition.KindVerify); err != nil || len(names) != 0 {
		t.Fatalf("verifies = %v, %v", names, err)
	}
	view, err := app.NewInspection(app.NewResolver(snap, struct{ app.ResolverIdentities }{h.runtimes}, h.validator)).ShowProcess(ctx, "p", "")
	want := `process p names verify:repo: verification "repo": ` + missing.Error()
	if err != nil || view.Refusal != want {
		t.Fatalf("refusal = %q, %v, want %q", view.Refusal, err, want)
	}
	if got := h.defs.readCount(); got != reads {
		t.Fatalf("reading the snapshot read the source %d more times", got-reads)
	}
}
