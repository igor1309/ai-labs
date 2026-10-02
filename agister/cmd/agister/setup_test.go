package main

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	runtimecomposition "github.com/igor1309/ai-labs/agister/internal/composition/runtime"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Setup-enabled calls through the shipped composition, including the
// preparer's content, commands and clock and the persisted evidence.
func TestSetupThroughProductionComposition(t *testing.T) {
	for _, c := range []struct {
		name, command, output string
		code                  int
		status                domain.Status
		class                 domain.Class
	}{
		{"success", "echo prepared", "prepared\n", cli.ExitCompleted, domain.Completed, ""},
		{"failure", "echo broken; exit 3", "broken\n", cli.ExitFailed, domain.Failed, domain.ClassSetupFailed},
	} {
		t.Run(c.name, func(t *testing.T) {
			home, repo := setup(t, "approve")
			write(t, filepath.Join(home, "workspace.yaml"), "schema: agister.workspace/v1alpha1\nsetup:\n  command: "+c.command+"\n  timeout: 20s\n")
			result := agister(t, home, repo, "run", "adversarial_review", "--param", "base=main", "--timeout", "1m")
			if result.code != c.code {
				t.Fatalf("exit %d, want %d\n%s", result.code, c.code, result.stderr)
			}
			var record domain.Record
			readJSON(t, filepath.Join(lastRun(t, home).dir, "record.json"), &record)
			expect(t, record, c.status, c.class, "")
			ran := record.SetupRun
			sum := sha256.Sum256([]byte(c.output))
			if ran == nil || ran.Command != c.command || ran.Dir != record.Workspace || ran.Passed != (c.status == domain.Completed) || ran.Output.Head != c.output || ran.Output.Bytes != int64(len(c.output)) || ran.Output.SHA256 != hex.EncodeToString(sum[:]) {
				t.Fatalf("persisted setup run = %+v", ran)
			}
			if record.Setup == nil || record.Setup.From != domain.SetupFromWorkspace || record.Setup.Path != filepath.Join(home, "workspace.yaml") {
				t.Fatalf("setup = %+v", record.Setup)
			}
			if c.status == domain.Failed && record.Turn != nil {
				t.Fatalf("turn ran after failed setup: %+v", record.Turn)
			}
		})
	}
}

// A checkout's setup (ADR-011) on real checkouts of temporary
// repositories, with the real command runner and git. The base ignores
// *.log, so what a setup makes there is ignored.

// reads is a step that checks what the checkout holds when the turn starts,
// then writes the state file as state does.
func reads(want map[string]string, content string) step {
	return func(t *testing.T, request app.TurnRequest) domain.Turn {
		for name, text := range want {
			data, err := os.ReadFile(filepath.Join(request.Cwd, name))
			if err != nil || string(data) != text {
				t.Errorf("turn sees %s = %q, %v; want %q", name, data, err, text)
			}
		}
		return state(content)(t, request)
	}
}

// setupRunsOf are the runs of the command in the call's checkout.
func setupRunsOf(h *loopHarness, record domain.Record) []app.SetupCommandRequest {
	var runs []app.SetupCommandRequest
	for _, request := range h.setup.requests() {
		if request.Dir == record.Workspace {
			runs = append(runs, request)
		}
	}
	return runs
}

// The setup runs in the checkout before the first turn, and the agent's
// working directory has what it made; repair turns continue in it without
// running it again; the verification command's clean copy has none of it,
// and the delivered patch carries none of it.
func TestSetupPreparesTheCheckoutOnceBeforeTheFirstTurn(t *testing.T) {
	made := map[string]string{"config.log": "prepared\n"}
	h := newLoop(t, verifySettings{
		setup:   `{command: "echo prepared >> config.log", timeout: 20s}`,
		command: "test ! -e config.log || exit 9; " + passWhenStateSaysPass,
	}, reads(made, "one"), reads(made, "pass"))
	record := h.call(contract.CallRequest{})
	expect(t, record, domain.Completed, "", "")

	if turns := h.runner.turns(); len(turns) != 2 || turns[0].Cwd != record.Workspace || turns[1].Cwd != record.Workspace {
		t.Fatalf("turns = %+v", turns)
	}
	if runs := setupRunsOf(h, record); len(runs) != 1 || runs[0].Command != "echo prepared >> config.log" || runs[0].Timeout != 20*time.Second {
		t.Fatalf("setup runs = %+v", runs)
	}
	if ran := runsOf(record); len(ran) != 2 || ran[0].Dir == record.Workspace || !ran[1].Passed {
		t.Fatalf("verification runs = %+v", record.Attempts)
	}
	if setup := record.Setup; setup == nil || setup.From != domain.SetupFromProcess || setup.Command != "echo prepared >> config.log" {
		t.Fatalf("setup = %+v", record.Setup)
	}
	if ran := record.SetupRun; ran == nil || !ran.Passed || ran.Dir != record.Workspace || ran.After != "" {
		t.Fatalf("setup run = %+v", record.SetupRun)
	}
	if artifacts := record.Result.Artifacts; len(artifacts) != 1 || strings.Contains(read(t, filepath.Join(h.home, "runs", record.ID, artifacts[0].Path)), "config.log") {
		t.Fatalf("artifacts = %+v", artifacts)
	}
}

// ADR-011 rules 4 and 5: a setup that exits non-zero, runs out of time,
// changes a tracked file or adds a file that is not ignored fails the call
// before any turn; its run is on record, and the checkout is released
// (wait checks that).
func TestAFailedSetupFailsTheCallWithNoTurn(t *testing.T) {
	// The timeout is the command runner's timer, which fires for the
	// setup's timeout only; the command never ends on its own, so only the
	// timer can end it, and wait's own bound fails the test if nothing does.
	const timeout = 13 * time.Second
	timesOut := supervisor.Commands{Timer: func(wait time.Duration) (<-chan time.Time, func()) {
		if wait != timeout {
			return nil, func() {}
		}
		fired := make(chan time.Time, 1)
		fired <- time.Time{}
		return fired, func() {}
	}}
	cases := map[string]struct {
		setup string
		with  seams
		want  string
		check func(t *testing.T, ran *domain.CommandRun)
	}{
		"non-zero exit": {setup: `{command: "echo broken; exit 3", timeout: 20s}`, want: "the setup command exited with code 3", check: func(t *testing.T, ran *domain.CommandRun) {
			if ran.Exit.Code == nil || *ran.Exit.Code != 3 || ran.Output.Head != "broken\n" {
				t.Fatalf("setup run = %+v", ran)
			}
		}},
		"timeout": {setup: `{command: "` + blocks + `", timeout: 13s}`, with: seams{setupCommands: runtimecomposition.SetupCommands{Supervisor: timesOut}}, want: "the setup command exceeded its timeout 13s", check: func(t *testing.T, ran *domain.CommandRun) {
			if !ran.TimedOut || ran.Exit.Code != nil {
				t.Fatalf("setup run = %+v", ran)
			}
		}},
		"tracked file changed": {setup: `{command: "echo changed > state", timeout: 20s}`, want: "the setup command changed the checkout's content", check: func(t *testing.T, ran *domain.CommandRun) {
			if ran.After == "" || ran.AfterChanges == nil {
				t.Fatalf("setup run = %+v", ran)
			}
		}},
		"unignored file added": {setup: `{command: "echo made > new.txt", timeout: 20s}`, want: "the setup command changed the checkout's content", check: func(t *testing.T, ran *domain.CommandRun) {
			if ran.After == "" || ran.AfterChanges == nil {
				t.Fatalf("setup run = %+v", ran)
			}
		}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			h := newLoopWith(t, c.with, verifySettings{setup: c.setup}, state("pass"))
			// Whatever the assertions find, no setup command outlives the
			// test: its group is on record while it runs.
			cleanupRecorded(t, h.home, h.repo)
			record := h.call(contract.CallRequest{})
			expect(t, record, domain.Failed, domain.ClassSetupFailed, c.want)
			if len(h.runner.turns()) != 0 || record.Turn != nil || len(record.Attempts) != 0 || len(record.Result.Artifacts) != 0 {
				t.Fatalf("turns %d, attempts %+v, artifacts %+v", len(h.runner.turns()), record.Attempts, record.Result.Artifacts)
			}
			if record.SetupRun == nil || record.SetupRun.Passed {
				t.Fatalf("setup run = %+v", record.SetupRun)
			}
			c.check(t, record.SetupRun)
		})
	}
}

// ADR-011 rule 4: the checkout's content after its setup is the
// revision's, not what the checkout was made with: a post-checkout hook
// that changes a tracked file fails the call though the setup changes
// nothing, and no turn runs on it.
func TestACheckoutHookThatChangesATrackedFileFailsTheSetup(t *testing.T) {
	h := newLoop(t, verifySettings{setup: `{command: "true", timeout: 20s}`}, state("pass"))
	hook := filepath.Join(h.repo, ".git", "hooks", "post-checkout")
	write(t, hook, "#!/bin/sh\necho hooked > state\n")
	if err := os.Chmod(hook, 0o755); err != nil {
		t.Fatal(err)
	}
	record := h.call(contract.CallRequest{})

	expect(t, record, domain.Failed, domain.ClassSetupFailed, "the checkout's content is not the revision's before its setup")
	if len(h.runner.turns()) != 0 || record.Turn != nil || len(setupRunsOf(h, record)) != 0 || record.SetupRun != nil || len(record.Result.Artifacts) != 0 {
		t.Fatalf("turns %d, setup runs %+v, setup run %+v, artifacts %+v", len(h.runner.turns()), setupRunsOf(h, record), record.SetupRun, record.Result.Artifacts)
	}
	if patch := read(t, filepath.Join(h.home, "runs", record.ID, "artifacts", "checkout.patch")); !strings.Contains(patch, "+hooked") {
		t.Fatalf("checkout.patch = %q", patch)
	}
}

// ADR-011 rule 2: workspace.yaml's setup applies to a process with a
// checkout and none of its own; the repository's takes priority over the
// global one, and the record names the document it came from.
func TestTheWorkspaceSetupIsTheDefaultAndTheRepositorysWins(t *testing.T) {
	workspace := func(from string) string {
		return "schema: agister.workspace/v1alpha1\nsetup:\n  command: echo " + from + " > from.log\n  timeout: 20s\n"
	}
	cases := map[string]struct {
		settings verifySettings
		want     string
	}{
		"global":            {verifySettings{globalWorkspace: workspace("global")}, "global\n"},
		"repository":        {verifySettings{workspace: workspace("repository")}, "repository\n"},
		"repository wins":   {verifySettings{workspace: workspace("repository"), globalWorkspace: workspace("global")}, "repository\n"},
		"the process's own": {verifySettings{workspace: workspace("repository"), setup: `{command: "echo own > from.log", timeout: 20s}`}, "own\n"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			h := newLoop(t, c.settings, reads(map[string]string{"from.log": c.want}, "pass"))
			record := h.call(contract.CallRequest{})
			expect(t, record, domain.Completed, "", "")
			setup := record.Setup
			if setup == nil {
				t.Fatal("no setup on record")
			}
			var source *domain.DefinitionSource
			for i, definition := range record.Definitions {
				if definition.Path == setup.Path {
					source = &record.Definitions[i]
				}
			}
			if source == nil || source.SHA256 == "" {
				t.Fatalf("setup %+v from no recorded definition: %+v", setup, record.Definitions)
			}
			wantKind := map[bool]string{true: "processes", false: "workspace"}[c.settings.setup != ""]
			if source.Kind != wantKind || (setup.From == domain.SetupFromProcess) != (wantKind == "processes") {
				t.Fatalf("setup %+v from %+v", setup, source)
			}
		})
	}
}
