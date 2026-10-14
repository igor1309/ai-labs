package codex_test

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
)

var probeActions = []string{"read file", "git show", "write in repository", "write under /tmp", "write in home", "touch in .git", "git tag", "git commit", "network"}

// outcomes is the probe script's output where the actions allowed succeed
// and every other is refused.
func outcomes(allowed ...string) string {
	var lines []string
	for _, action := range probeActions {
		result := "refused"
		if slices.Contains(allowed, action) {
			result = "ok"
		}
		lines = append(lines, action+"="+result)
	}
	return strings.Join(lines, "\n") + "\n"
}

// probedCodex answers the probe as a Codex whose sandbox lets through what
// outputs gives each mode ("read-only", "workspace-write", "resumed
// read-only"): sh runs and exits 0, printing control for the probe script;
// a turn reports its thread, a command that ran the script with that
// output, and its completion.
func probedCodex(control string, outputs map[string]string) *spyTransport {
	zero := 0
	exited := codex.Evidence{Exit: &codex.Exit{Code: &zero}}
	return &spyTransport{Output: "codex-cli 0.163.0", Runs: spyRuns{Answer: func(spec codex.Spec) ([]string, codex.Evidence) {
		if spec.Command == "sh" {
			if slices.Equal(spec.Args, []string{"probe.sh"}) {
				return strings.Split(strings.TrimSuffix(control, "\n"), "\n"), exited
			}
			return nil, exited
		}
		mode, thread := "resumed read-only", spec.Args[2]
		if !slices.Contains(spec.Args, "resume") {
			mode = spec.Args[slices.Index(spec.Args, "--sandbox")+1]
			thread = "thread-" + mode
		}
		output, ran := outputs[mode]
		if !ran {
			return []string{`{"type":"thread.started","thread_id":"` + thread + `"}`, `{"type":"turn.completed","usage":{}}`}, exited
		}
		item := func(kind string) string {
			data, _ := json.Marshal(map[string]any{"type": kind, "item": map[string]any{"id": "c1", "type": "command_execution", "command": "/bin/zsh -lc 'sh probe.sh'", "aggregated_output": output, "exit_code": 0}})
			return string(data)
		}
		return []string{`{"type":"thread.started","thread_id":"` + thread + `"}`, item("item.started"), item("item.completed"), `{"type":"turn.completed","usage":{}}`}, exited
	}}}
}

var (
	readOnly       = outcomes("read file", "git show")
	workspaceWrite = outcomes("read file", "git show", "write in repository", "write under /tmp")
	everything     = outcomes(probeActions...)
)

// A mode holds when each action's outcome in its turn is the one the mode
// allows or refuses; read-only only when it holds resumed too.
func TestTheProbeVerifiesTheModesWhoseSandboxHeld(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		outputs map[string]string
		want    []string
	}{
		"both held":               {map[string]string{"read-only": readOnly, "workspace-write": workspaceWrite, "resumed read-only": readOnly}, []string{"read-only", "workspace-write"}},
		"read-only wrote":         {map[string]string{"read-only": workspaceWrite, "workspace-write": workspaceWrite, "resumed read-only": readOnly}, []string{"workspace-write"}},
		"resumed read-only wrote": {map[string]string{"read-only": readOnly, "workspace-write": workspaceWrite, "resumed read-only": workspaceWrite}, []string{"workspace-write"}},
		"workspace-write tagged":  {map[string]string{"read-only": readOnly, "workspace-write": outcomes("read file", "git show", "write in repository", "write under /tmp", "git tag"), "resumed read-only": readOnly}, []string{"read-only"}},
	} {
		probe, err := (&codex.Runner{Command: "codex", Transport: probedCodex(everything, c.outputs)}).Probe(context.Background())
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if probe.Version != "0.163.0" || !slices.Equal(probe.Primitives, c.want) {
			t.Errorf("%s: probe = %s %q, want 0.163.0 %q", name, probe.Version, probe.Primitives, c.want)
		}
		if !slices.Equal(c.want, []string{"read-only", "workspace-write"}) && !strings.Contains(probe.Report, "(want refused)") {
			t.Errorf("%s: the report names no action against the mode:\n%s", name, probe.Report)
		}
	}
}

// The probe's turns are the adapter's own on the cheapest model at its
// lowest effort, each in its own repository, and the resumed one resumes
// the workspace-write thread, in its repository.
func TestTheProbeRunsTheAdaptersTurns(t *testing.T) {
	t.Parallel()
	spy := probedCodex(everything, map[string]string{"read-only": readOnly, "workspace-write": workspaceWrite, "resumed read-only": readOnly})
	if _, err := (&codex.Runner{Command: "/opt/codex", Transport: spy}).Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	var turns []codex.Spec
	for _, spec := range spy.Specs() {
		if spec.Command == "/opt/codex" {
			turns = append(turns, spec)
		}
	}
	if len(turns) != 3 {
		t.Fatalf("turns = %+v", turns)
	}
	for i, resume := range []string{"", "", "thread-workspace-write"} {
		mode := []string{"read-only", "workspace-write", "read-only"}[i]
		want, err := codex.Arguments(codex.TurnRequest{Primitives: []string{mode}, Model: codex.ProbeModel, Effort: codex.ProbeEffort, ResumeSessionID: resume}, "")
		if err != nil {
			t.Fatal(err)
		}
		if !slices.Equal(turns[i].Args, want) {
			t.Errorf("turn %d args = %q, want %q", i, turns[i].Args, want)
		}
	}
	if turns[0].Dir == turns[1].Dir || turns[2].Dir != turns[1].Dir {
		t.Errorf("turn dirs = %s, %s, %s", turns[0].Dir, turns[1].Dir, turns[2].Dir)
	}
	if codex.ProbeModel != "gpt-6-luna" || codex.ProbeEffort != "low" {
		t.Errorf("probe model = %s at %s", codex.ProbeModel, codex.ProbeEffort)
	}
}

// A probe that proves nothing is an error: the script fails outside the
// sandbox, where the host refused the action, or the model did not run it.
func TestAProbeThatProvesNothingIsAnError(t *testing.T) {
	t.Parallel()
	held := map[string]string{"read-only": readOnly, "workspace-write": workspaceWrite, "resumed read-only": readOnly}
	for name, c := range map[string]struct {
		control string
		outputs map[string]string
		want    string
	}{
		"no network on the host": {outcomes(probeActions[:8]...), held, "not every action ok"},
		"the model ran nothing":  {everything, map[string]string{"read-only": readOnly}, "workspace-write: the model did not run the probe"},
	} {
		_, err := (&codex.Runner{Command: "codex", Transport: probedCodex(c.control, c.outputs)}).Probe(context.Background())
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: err = %v, want %q", name, err, c.want)
		}
	}
}
