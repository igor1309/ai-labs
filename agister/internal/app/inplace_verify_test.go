package app_test

import (
	"os"
	"path/filepath"
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

// ADR-025 rule 5: a call verifies in the caller's worktree, with the
// rebuild check; nothing is copied.

// rebuilding has the harness's changes rebuild, from any patch applied to
// revision, the content the worktree has now, and from one applied to any
// other revision, content no worktree has: a pass rests on the revision
// the call's changes are from.
func rebuilding(h *harness, revision string) {
	h.changes.rebuilt = func(from string, _ []byte) string {
		if from != revision {
			return "rebuilt from " + from
		}
		if h.changes.identify != nil {
			return h.changes.identify()
		}
		return "tree"
	}
}

// noCopy fails if the copy seam was ever called, or a copy was ever on
// the call's record.
func noCopy(t *testing.T, h *harness) {
	t.Helper()
	h.copies.mu.Lock()
	placed, made, removed := len(h.copies.placed), len(h.copies.made), len(h.copies.removed)
	h.copies.mu.Unlock()
	if placed+made+removed != 0 {
		t.Fatalf("copies placed %d, made %d, removed %d", placed, made, removed)
	}
	h.recorder.mu.Lock()
	defer h.recorder.mu.Unlock()
	for _, update := range h.recorder.updates {
		if update.Effects != nil && update.Effects.Copy != nil {
			t.Fatalf("a copy on record: %+v", update.Effects.Copy)
		}
	}
}

// ADR-025 rule 5: a verifying call runs the command in the worktree, under
// the worktree's hold, which it has alone, and never calls the copy seam;
// the pass completes the call with the patch that rebuilds what passed from
// the call's revision, and the record says the call and each attempt
// verified in the workspace.
func TestAnInPlaceCallVerifiesInTheWorktreeWhenItsVerificationSaysSo(t *testing.T) {
	t.Parallel()
	h := newHarness()
	verifying(h)
	changedByTheTurn(h)
	rebuilding(h, "sha-HEAD")
	var locked []bool
	h.commands.running = func(request app.CommandRequest) { locked = append(locked, h.locks.holds(request.Dir)) }
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
	runs := h.commands.runs()
	if len(runs) != 1 || runs[0].Dir != "/repo" || runs[0].Command != "go test ./..." || !reflect.DeepEqual(locked, []bool{true}) || !reflect.DeepEqual(h.locks.writers, []bool{true}) {
		t.Fatalf("command runs %+v, locked while running %v, held alone %v", runs, locked, h.locks.writers)
	}
	noCopy(t, h)
	noWorktreeEffect(t, record)
	if record.InPlace == nil || record.InPlace.Verify != run.VerifyInWorkspace || record.InPlace.Content != "after" {
		t.Fatalf("in place %+v", record.InPlace)
	}
	if record.Verify == nil || record.Verify.Where != run.VerifyInWorkspace {
		t.Fatalf("verify %+v", record.Verify)
	}
	if len(record.Attempts) != 1 || record.Attempts[0].Where != run.VerifyInWorkspace || !record.Attempts[0].Run.Passed || record.Attempts[0].Run.Dir != "/repo" {
		t.Fatalf("attempts %+v", record.Attempts)
	}
	if string(h.recorder.artifacts["changes.patch"]) != "the turn's patch" || !reflect.DeepEqual(h.changes.rebuilds, []rebuiltPatch{{dir: "/repo", revision: "sha-HEAD", patch: "the turn's patch"}}) {
		t.Fatalf("artifacts %v, rebuilds %+v", h.recorder.artifacts, h.changes.rebuilds)
	}
	if h.locks.holds("/repo") {
		t.Fatal("the worktree's lock was kept")
	}
}

// ADR-002 rule 5: a command run in the worktree gets what is left of the
// call's time when that is less than its own timeout, so it does not
// outlast the call: of a 60-second call whose turn took 50, a command with
// a 30-second timeout gets 10.
func TestACommandInTheWorktreeGetsOnlyTheCallsRemainingTime(t *testing.T) {
	t.Parallel()
	h := newHarness()
	clock := &settableClock{now: time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)}
	h.clock = clock
	h.calls = h.callsOn(h.defs)
	verifying(h)
	changedByTheTurn(h)
	rebuilding(h, "sha-HEAD")
	h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "timeout: 10m", "timeout: 30s", 1)
	h.runner.during = func(app.TurnRequest) { clock.advance(50 * time.Second) }
	record := h.call(t, contract.CallRequest{Timeout: "60s"})

	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
	runs := h.commands.runs()
	if len(runs) != 1 || runs[0].Dir != "/repo" || runs[0].Timeout != 10*time.Second {
		t.Fatalf("command runs %+v, want one in /repo with 10s", runs)
	}
	noCopy(t, h)
}

// What the worktree holds besides its content, such as the build output
// the agent left, ignored, is what the command runs with, and nothing of
// it is removed.
func TestAnIgnoredFileTheAgentMadeIsThereForTheCommandAndStays(t *testing.T) {
	t.Parallel()
	h := newHarness()
	verifying(h)
	rebuilding(h, "sha-HEAD")
	worktree := t.TempDir()
	h.workspaces.root = worktree
	output := filepath.Join("build", "out.log")
	h.runner.during = func(request app.TurnRequest) {
		if err := os.MkdirAll(filepath.Join(request.Cwd, "build"), 0o700); err != nil {
			t.Error(err)
		}
		if err := os.WriteFile(filepath.Join(request.Cwd, output), []byte("built\n"), 0o600); err != nil {
			t.Error(err)
		}
	}
	var seen string
	h.commands.running = func(request app.CommandRequest) {
		data, _ := os.ReadFile(filepath.Join(request.Dir, output))
		seen = string(data)
	}
	record := h.call(t, contract.CallRequest{Cwd: worktree})

	if record.Result.Status != run.Completed || seen != "built\n" {
		t.Fatalf("result %+v, the command saw %q", record.Result, seen)
	}
	if data, err := os.ReadFile(filepath.Join(worktree, output)); err != nil || string(data) != "built\n" {
		t.Fatalf("after the call: %q, %v", data, err)
	}
	noCopy(t, h)
}

// ADR-025 rules 3 and 5: a verification that still says where runs in the
// worktree all the same, the key ignored; nothing is copied.
func TestAVerificationThatSaysWhereVerifiesInTheWorktree(t *testing.T) {
	t.Parallel()
	for _, where := range []string{"workspace", "copy"} {
		t.Run(where, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			verifying(h)
			h.defs.docs[definition.KindProcess]["p"] += "  where: " + where + "\n"
			changedByTheTurn(h)
			rebuilding(h, "sha-HEAD")
			record := h.call(t, contract.CallRequest{})

			if record.Result.Status != run.Completed {
				t.Fatalf("result %+v: %s", record.Result, message(record))
			}
			if runs := h.commands.runs(); len(runs) != 1 || runs[0].Dir != "/repo" {
				t.Fatalf("command runs %+v", runs)
			}
			if len(record.Attempts) != 1 || record.Attempts[0].Where != run.VerifyInWorkspace || record.InPlace == nil || record.InPlace.Verify != run.VerifyInWorkspace {
				t.Fatalf("attempts %+v, in place %+v", record.Attempts, record.InPlace)
			}
			noCopy(t, h)
		})
	}
}

// worktreeContent is the content of the harness's worktree, which its
// turns and its command's runs change, as changesSpy names it.
type worktreeContent struct {
	mu      sync.Mutex
	content string
}

func (w *worktreeContent) set(content string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.content = content
}

func (w *worktreeContent) get() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.content
}

// turnsMake has the harness's worktree hold "tree" until its first turn,
// and after the nth turn the nth of contents.
func turnsMake(h *harness, contents ...string) *worktreeContent {
	worktree := &worktreeContent{content: "tree"}
	turns := 0
	h.runner.during = func(app.TurnRequest) {
		worktree.set(contents[turns])
		turns++
	}
	h.changes.identify = worktree.get
	h.changes.patch = func(from, to string) []byte { return []byte(from + " to " + to) }
	return worktree
}

// ADR-002 rule 7 in the worktree: a run that changes the content it checks
// fails, whatever its exit, and what it changed is on record; it stays in
// the worktree, which the repair starts on.
func TestACommandThatChangesTheWorktreeFailsItsAttempt(t *testing.T) {
	t.Parallel()
	h := newHarness()
	verifying(h)
	worktree := turnsMake(h, "after", "repaired")
	rebuilding(h, "sha-HEAD")
	runs := 0
	h.commands.running = func(app.CommandRequest) {
		if runs++; runs == 1 {
			worktree.set("formatted")
		}
	}
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed || len(record.Attempts) != 2 {
		t.Fatalf("result %+v, attempts %+v", record.Result, record.Attempts)
	}
	first := record.Attempts[0]
	if first.Run.Passed || first.Run.After != "formatted" || first.Run.AfterChanges == nil || first.Where != run.VerifyInWorkspace ||
		string(h.recorder.artifacts["attempt-1-run.patch"]) != "after to formatted" {
		t.Fatalf("first attempt %+v, run %+v", first, first.Run)
	}
	if !recorded(h, "VERIFY_CHANGED_CONTENT") {
		t.Fatalf("events %v", h.recorder.kinds())
	}
	// The repair's changes are from what the run left.
	if string(h.recorder.artifacts["attempt-2.patch"]) != "formatted to repaired" || record.InPlace.Content != "repaired" {
		t.Fatalf("artifacts %v, in place %+v", h.recorder.artifacts, record.InPlace)
	}
	noCopy(t, h)
}

// ADR-024 rule 8 in the worktree: a run ended at stale.no_output is named
// after it as any run is, so what the silent command changed before it was
// ended is on the run's record, the repair turn is told of it, and the
// repair's changes are from what the run left, not taken for the repair's.
func TestWhatASilentCommandChangedInTheWorktreeIsItsRunsNotTheRepairs(t *testing.T) {
	t.Parallel()
	h, _ := staleHarness(t, "no_output: 2m")
	verifying(h)
	worktree := turnsMake(h, "after", "repaired")
	rebuilding(h, "sha-HEAD")
	h.commands.staleRuns = 1
	runs := 0
	h.commands.running = func(app.CommandRequest) {
		if runs++; runs == 1 {
			worktree.set("formatted")
		}
	}
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed || len(record.Attempts) != 2 {
		t.Fatalf("result %+v: %s, attempts %+v", record.Result, message(record), record.Attempts)
	}
	first := record.Attempts[0]
	if first.Run.Passed || first.Run.Stale == nil || first.Run.Stale.Limit != run.StaleNoOutput || first.Run.After != "formatted" ||
		first.Run.AfterChanges == nil || string(h.recorder.artifacts["attempt-1-run.patch"]) != "after to formatted" {
		t.Fatalf("first attempt %+v, run %+v", first, first.Run)
	}
	if !recorded(h, "VERIFY_CHANGED_CONTENT") {
		t.Fatalf("events %v", h.recorder.kinds())
	}
	turns := h.runner.calls()
	want := "## exit status\n\nno output for 2m0s, then ended by Agister; the run changed the content it checked\n\n" +
		"## output\n\n18 bytes, sha256 sha-stale\n\n```\n=== RUN TestHangs\n```"
	if len(turns) != 2 || !strings.HasSuffix(turns[1].Prompt, want) {
		t.Fatalf("turns %d, repair message\n%s\nwant it to end\n%s", len(turns), turns[len(turns)-1].Prompt, want)
	}
	// The repair's changes are from what the run left.
	if string(h.recorder.artifacts["attempt-2.patch"]) != "formatted to repaired" || record.InPlace.Content != "repaired" {
		t.Fatalf("artifacts %v, in place %+v", h.recorder.artifacts, record.InPlace)
	}
	noCopy(t, h)
}

// ADR-002 rule 4 in the worktree: a failing command goes back to the
// call's own session, whose repair turn works in the same worktree, and
// the command checks the repair there.
func TestAFailingCommandIsRepairedInTheSameSessionAndWorktree(t *testing.T) {
	t.Parallel()
	h := newHarness()
	verifying(h)
	turnsMake(h, "after", "repaired")
	rebuilding(h, "sha-HEAD")
	h.commands.exits = []int{1, 0}
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed {
		t.Fatalf("result %+v: %s", record.Result, message(record))
	}
	turns := h.runner.calls()
	if len(turns) != 2 || turns[1].ResumeSessionID != "prov-1" || turns[1].Cwd != "/repo" {
		t.Fatalf("turns %+v", turns)
	}
	runs := h.commands.runs()
	if len(runs) != 2 || runs[0].Dir != "/repo" || runs[1].Dir != "/repo" {
		t.Fatalf("command runs %+v", runs)
	}
	if len(record.Attempts) != 2 || record.Attempts[1].Identity != "repaired" || !record.Attempts[1].Run.Passed || record.Attempts[1].Where != run.VerifyInWorkspace {
		t.Fatalf("attempts %+v", record.Attempts)
	}
	if string(h.recorder.artifacts["changes.patch"]) != "sha-HEAD to repaired" || record.InPlace.Content != "repaired" {
		t.Fatalf("artifacts %v, in place %+v", h.recorder.artifacts, record.InPlace)
	}
	noCopy(t, h)
}

// ADR-002 rule 7: a pass in the worktree was never rebuilt from the patch,
// so a patch that does not rebuild what passed fails the call: it is not
// kept, and the run claims no content.
func TestAPatchThatDoesNotRebuildWhatPassedInTheWorktreeFailsTheCall(t *testing.T) {
	t.Parallel()
	h := newHarness()
	verifying(h)
	changedByTheTurn(h)
	h.changes.rebuilt = func(string, []byte) string { return "other" }
	record := h.call(t, contract.CallRequest{})

	if class(record) != run.ClassInternal || !strings.Contains(message(record), "the captured changes do not rebuild the content that passed: applied to sha-HEAD they make other, not after") {
		t.Fatalf("result %s %q", class(record), message(record))
	}
	if _, ok := h.recorder.artifacts["changes.patch"]; ok || record.InPlace.Content != "" || !recorded(h, "ARTIFACT_FAILED") {
		t.Fatalf("artifacts %v, in place %+v, events %v", h.recorder.artifacts, record.InPlace, h.recorder.kinds())
	}
	if h.locks.holds("/repo") {
		t.Fatal("the worktree's lock was kept")
	}
}
