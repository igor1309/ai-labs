package main

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/contract"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// inPlaceSettings has impl work in the caller's worktree with a precheck,
// and a setup of its own that an in-place call never runs.
func inPlaceSettings() verifySettings {
	return verifySettings{
		setup:     `{command: "echo prepared >> config.log", timeout: 20s}`,
		workspace: "schema: agister.workspace/v1alpha1\nmode: in-place\nprecheck: {command: \"true\", timeout: 20s}\n",
	}
}

// ADR-022: an in-place call works in the caller's worktree, on real git.
// The turns run there, the setup is skipped, the precheck runs there first,
// the verification checks a clean copy, and the changes stay in the
// worktree, captured from the revision as changes.patch. No worktree is
// made for the call, and none is left (wait checks that).
//
// Contract test: real git, in a repository of the test's own.
func TestAnInPlaceCallWorksInTheCallersWorktree(t *testing.T) {
	t.Parallel()
	h := newGitLoop(t, inPlaceSettings(), state("one"), state("pass"))
	revision := gitCmd(t, h.repo, "rev-parse", "HEAD")
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Completed, "", "")

	for _, turn := range h.runner.turns() {
		if turn.Cwd != h.repo {
			t.Fatalf("a turn ran in %s", turn.Cwd)
		}
	}
	if in := record.InPlace; in == nil || in.Dir != h.repo || in.Worktree != h.repo || in.Revision != revision || in.Verify != domain.VerifyOnCopy || in.Content == "" {
		t.Fatalf("in place %+v", record.InPlace)
	}
	if record.SetupRun != nil || record.PrecheckRun == nil || !record.PrecheckRun.Passed || record.PrecheckRun.Dir != h.repo {
		t.Fatalf("setup run %+v, precheck run %+v", record.SetupRun, record.PrecheckRun)
	}
	if ran := runsOf(record); len(ran) != 2 || ran[0].Dir == h.repo || ran[1].Dir == h.repo || !ran[1].Passed {
		t.Fatalf("verification runs %+v", ran)
	}
	if got := read(t, filepath.Join(h.repo, "state")); got != "pass\n" {
		t.Fatalf("the worktree's state is %q", got)
	}
	if head := gitCmd(t, h.repo, "rev-parse", "HEAD"); head != revision {
		t.Fatalf("HEAD moved to %s", head)
	}
	artifacts := record.Result.Artifacts
	if len(artifacts) != 1 || !strings.Contains(read(t, filepath.Join(h.home, "runs", record.ID, artifacts[0].Path)), "+pass") {
		t.Fatalf("artifacts %+v", artifacts)
	}
	if effects := record.Effects; effects != nil && (effects.Checkout != nil || effects.Copy != nil || effects.Unreleased != nil) {
		t.Fatalf("effects %+v", effects)
	}
}

// ADR-022 rule 4, on real git: a worktree that is not exactly the
// revision's is refused before any turn, and is left as it was.
//
// Contract test: real git, in a repository of the test's own.
func TestAnInPlaceCallRefusesAWorktreeItCannotAdmit(t *testing.T) {
	t.Parallel()
	h := newGitLoop(t, inPlaceSettings(), state("pass"))
	write(t, filepath.Join(h.repo, "state"), "edited\n")
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Failed, domain.ClassRefused, "has content")
	if len(h.runner.turns()) != 0 || read(t, filepath.Join(h.repo, "state")) != "edited\n" {
		t.Fatalf("turns %d", len(h.runner.turns()))
	}

	// The worktree as the revision left it is admitted again, and an
	// ignored file in it counts for nothing.
	gitCmd(t, h.repo, "checkout", "--quiet", "--", "state")
	write(t, filepath.Join(h.repo, "build.log"), "x\n")
	record = h.call(contract.CallRequest{})
	expect(t, record, domain.Completed, "", "")
}
