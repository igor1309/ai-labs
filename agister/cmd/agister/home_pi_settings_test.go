package main

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakepi"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/gokit/fakeproc"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
)

// Home verifies the same seven Pi primitives for 1.0.2 as for 0.85:
// check --probe plans both implement workflows on their bound agents
// (ADR-030 rule 8), and their runs record all seven tools. A later,
// unverified patch version runs with warnings (ADR-036). Only the in-process fakes
// run: this proves the settings, not Pi's live primitive contracts.
func TestHomePiSettingsVerify102AndKeep085(t *testing.T) {
	t.Parallel()
	for _, version := range []string{"0.85.1", "1.0.2", "1.0.3"} {
		t.Run(version, func(t *testing.T) {
			t.Parallel()
			root, repo, home := onFakeRuntimes(t)
			startThrough(t, home, runtimetest.InProcess{
				Env: []string{"FAKE_OUTPUT=schema"},
				Fakes: map[string]supervisortest.Fake{
					"pi":    piAt(version),
					"codex": codexAt("0.159.0"),
				},
			})
			launch := filepath.Join(repo, "agister")
			r := agister(t, home, launch, "check", "--probe", "--json")

			var report contract.CheckReport
			if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || r.code != 0 || len(report.Problems) != 0 {
				t.Fatalf("check --probe: exit %d, decode %v\n%s%s", r.code, err, r.stdout, r.stderr)
			}
			if version == "1.0.3" && !strings.Contains(strings.Join(report.Warnings, "\n"), "runtime pi version 1.0.3 is unverified") {
				t.Fatalf("warnings = %q", report.Warnings)
			}
			var bindings []contract.Binding
			for _, binding := range report.Bindings {
				if binding.Runtime == "pi" {
					bindings = append(bindings, binding)
				}
			}
			want := []contract.Binding{
				{Workflow: "implement_pi", Node: "implement", Process: "implement", Agent: "pi-m3", Runtime: "pi", Version: version},
				{Workflow: "implement_pi_glm", Node: "implement", Process: "implement", Agent: "pi-glm-53", Runtime: "pi", Version: version},
			}
			if !reflect.DeepEqual(bindings, want) {
				t.Fatalf("Pi bindings = %+v, want %+v", bindings, want)
			}

			runs := &newRuns{home: home}
			for _, binding := range want {
				args := append([]string{"run", binding.Workflow, "--quiet", "--timeout", "1m"}, paramArgs(t, "agister", parseProcess(t, root, "implement").Params)...)
				r = agister(t, home, launch, args...)
				last := runs.one(t)
				if r.code != cli.ExitCompleted || last.record["agent"] != binding.Agent || calledProcess(last.record) != "implement" {
					t.Fatalf("%s: exit %d, agent %v, process %s\n%s%s", binding.Workflow, r.code, last.record["agent"], calledProcess(last.record), r.stdout, r.stderr)
				}
				plan := last.record["plan"].(map[string]any)
				tools := []any{"read", "grep", "find", "ls", "edit", "write", "bash"}
				if !reflect.DeepEqual(plan["primitives"], tools) {
					t.Fatalf("%s plan = %v, want primitives %v", binding.Workflow, plan, tools)
				}
				if args := strings.Join(last.argv(), " "); !strings.Contains(args, "--tools read,grep,find,ls,edit,write,bash") {
					t.Fatalf("%s Pi argv = %s", binding.Workflow, args)
				}
			}
		})
	}
}

// piAt is the fake Pi, reporting the version the test gives it.
func piAt(version string) supervisortest.Fake {
	return func(p fakeproc.Process) int {
		getenv := p.Getenv
		p.Getenv = func(key string) string {
			if key == "FAKE_VERSION" {
				return version
			}
			return getenv(key)
		}
		return fakepi.Main(p)
	}
}
