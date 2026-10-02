package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// A checkout's setup (ADR-010) on real checkouts of temporary
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
func setupRunsOf(h *loopHarness, record domain.Record) []app.CommandRequest {
	var runs []app.CommandRequest
	for _, request := range h.commands.requests() {
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

// ADR-010 rules 4 and 5: a setup that exits non-zero, runs out of time,
// changes a tracked file or adds a file that is not ignored fails the call
// before any turn; its run is on record, and the checkout is released
// (wait checks that).
func TestAFailedSetupFailsTheCallWithNoTurn(t *testing.T) {
	cases := map[string]struct {
		setup string
		want  string
		check func(t *testing.T, ran *domain.CommandRun)
	}{
		"non-zero exit": {`{command: "echo broken; exit 3", timeout: 20s}`, "the setup command exited with code 3", func(t *testing.T, ran *domain.CommandRun) {
			if ran.Exit.Code == nil || *ran.Exit.Code != 3 || ran.Output.Head != "broken\n" {
				t.Fatalf("setup run = %+v", ran)
			}
		}},
		"timeout": {`{command: "sleep 30", timeout: 200ms}`, "the setup command exceeded its timeout 200ms", func(t *testing.T, ran *domain.CommandRun) {
			if !ran.TimedOut {
				t.Fatalf("setup run = %+v", ran)
			}
		}},
		"tracked file changed": {`{command: "echo changed > state", timeout: 20s}`, "the setup command changed the checkout's content", func(t *testing.T, ran *domain.CommandRun) {
			if ran.After == "" || ran.AfterChanges == nil {
				t.Fatalf("setup run = %+v", ran)
			}
		}},
		"unignored file added": {`{command: "echo made > new.txt", timeout: 20s}`, "the setup command changed the checkout's content", func(t *testing.T, ran *domain.CommandRun) {
			if ran.After == "" || ran.AfterChanges == nil {
				t.Fatalf("setup run = %+v", ran)
			}
		}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			h := newLoop(t, verifySettings{setup: c.setup}, state("pass"))
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

// ADR-010 rule 2: workspace.yaml's setup applies to a process with a
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
