package main

import (
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

func askPermissions() runstore.Permissions {
	return runstore.Permissions{Options: []string{"Glob"}, Required: []string{"repository.read"},
		Allowed: []string{"repository.read", "host.read"}, Granted: []string{"repository.read", "host.read"},
		Extra: []string{}, Withheld: []string{}}
}

// planProcess declares B before A, which reads a param not used by an input.
func planProcess() string {
	process := strings.Replace(askProcess, "  q: {}", "  q: {}\n  a: {}", 1)
	return strings.Replace(process, "  A: \"1\"", "  B: \"2\"\n  A: {from: params.a}", 1)
}

// plan.feature, "A call records its permission plan and its environment"
// and "A call whose inputs were refused records its plan alone".
// Contract test: the files home holds, as Agister ships them.
func TestACallRecordsItsPlan(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"made", "admission refused", "inputs refused", "extra and withheld"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			process := planProcess()
			wantPermissions := askPermissions()
			wantEnv := []runstore.Variable{{Name: "B", Value: "2"}, {Name: "A", Value: "1"}}
			switch kind {
			case "admission refused":
				process += "workspace: {clean: true}\n"
			case "inputs refused":
				process = strings.Replace(process, "  q: {source: param, name: q}", "  q: {source: param, name: q}\n  f: {source: file, path: {from: params.q}}", 1)
				wantEnv = []runstore.Variable{}
			case "extra and withheld":
				process = strings.Replace(process, "allow: [repository.read, host.read]", "allow: [repository.read, network]", 1)
				wantPermissions.Allowed = []string{"repository.read", "network"}
				wantPermissions.Extra, wantPermissions.Withheld = []string{"host.read"}, []string{"network"}
			}
			f := newRecordFixture(t, modelSettings(t, map[string]string{"/r/.agister/processes/ask.yaml": process}), nil)
			f.holding.clean = kind != "admission refused"
			f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`)})
			f.validator = &validatorSpy{}
			got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why", "--param", "a=1")
			wantCode, wantTurns := 0, 1
			if strings.Contains(kind, "refused") {
				wantCode, wantTurns = 1, 0
			}
			if got.code != wantCode || got.stderr != "" {
				t.Fatalf("ran %+v", got)
			}
			calls := f.store.last(t).Calls
			if len(calls) != 1 {
				t.Fatalf("calls %+v", calls)
			}
			call := calls[0]
			if !reflect.DeepEqual(call.Permissions, wantPermissions) || !reflect.DeepEqual(call.Environment, wantEnv) {
				t.Errorf("permissions %+v, environment %+v; want %+v, %+v", call.Permissions, call.Environment, wantPermissions, wantEnv)
			}
			if turns := f.runtimes.claude.ran(); len(turns) != wantTurns {
				t.Errorf("turns %+v, want %d", turns, wantTurns)
			}
			if wantCode == 1 && (call.Result.Class == nil || *call.Result.Class != "refused") {
				t.Errorf("result %+v, want refused", call.Result)
			}
		})
	}
}

// plan.feature, "A reuse takes a call only under the same environment".
// Contract test: the files home holds, as Agister ships them.
func TestReuseComparesTheResolvedProcessEnvironment(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"same", "value", "legacy", "empty", "order", "name", "extra", "missing", "legacy without declarations"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			process := planProcess()
			wantEnv := []runstore.Variable{{Name: "B", Value: "2"}, {Name: "A", Value: "1"}}
			if kind == "legacy without declarations" {
				process = strings.Replace(process, "environment:\n  B: \"2\"\n  A: {from: params.a}\n", "", 1)
				wantEnv = []runstore.Variable{}
			}
			f := newRecordFixture(t, modelSettings(t, map[string]string{"/r/.agister/processes/ask.yaml": process}), nil)
			f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`)})
			f.validator = &validatorSpy{}
			earlier := keptCall("R1/ask", "t1", "s1")
			earlier.Inputs = []runstore.Input{{Name: "q", Value: "why", Identity: identity("why")}}
			earlier.Definitions = askDefinitions(f.settings, "claude-opus")
			earlier.Environment = slices.Clone(wantEnv)
			switch kind {
			case "value":
				earlier.Environment[1].Value = "9"
			case "legacy", "legacy without declarations":
				earlier.Environment = nil
			case "empty":
				earlier.Environment = []runstore.Variable{}
			case "order":
				slices.Reverse(earlier.Environment)
			case "name":
				earlier.Environment[1].Name = "C"
			case "extra":
				earlier.Environment = append(earlier.Environment, runstore.Variable{Name: "C", Value: "3"})
			case "missing":
				earlier.Environment = earlier.Environment[:1]
			}
			record := keptRun("R1", earlier)
			record.Request = runstore.Request{Process: "ask", Agent: "claude-opus", Dir: "/r"}
			f.store.kept = map[string]runstore.Record{"R1": record}
			got := f.runWatching(t, f.signals.watch, []string{"INHERITED=private", "A=inherited"}, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why", "--param", "a=1", "--reuse", "R1")
			if got.code != 0 || got.stderr != "" {
				t.Fatalf("ran %+v", got)
			}
			call := f.store.last(t).Calls[0]
			wantReused := kind == "same" || kind == "legacy without declarations"
			wantTurns := 1
			if wantReused {
				wantTurns = 0
			}
			if (call.Reuses != nil) != wantReused || len(f.runtimes.claude.ran()) != wantTurns {
				t.Fatalf("reuses %v, turns %d; want reused %v", call.Reuses, len(f.runtimes.claude.ran()), wantReused)
			}
			if wantReused && *call.Reuses != earlier.ID {
				t.Errorf("reuses %q, want %q", *call.Reuses, earlier.ID)
			}
			if !reflect.DeepEqual(call.Permissions, askPermissions()) || !reflect.DeepEqual(call.Environment, wantEnv) {
				t.Errorf("permissions %+v, environment %+v; want this call's %+v, %+v", call.Permissions, call.Environment, askPermissions(), wantEnv)
			}
		})
	}
}

// Bash's permission plan is recorded too, each step's own, and its inputs
// in the program's environment are not process environment declarations.
// Contract test: the files home holds, as Agister ships them.
func TestEachWorkflowStepRecordsItsOwnPlan(t *testing.T) {
	t.Parallel()
	settings := runSettings(t, nil)
	settings["/u/.agister/workflows/pair.yaml"] = strings.Replace(pairWorkflow, "name: b, process: say", "name: b, process: checked", 1)
	settings["/u/.agister/processes/checked.yaml"] = settings["/u/.agister/processes/say.yaml"] + "permissions: {require: [network], allow: [host.read]}\n"
	f := newRecordFixture(t, settings, echoes)
	got := f.run(t, "/r", "run", "pair")
	if got.code != 0 || got.stderr != "" {
		t.Fatalf("ran %+v", got)
	}
	grants := []string{"repository.read", "repository.search", "repository.diff", "repository.history.read",
		"repository.write", "repository.history.write", "process.execute", "network", "host.read", "host.write"}
	wantA := runstore.Permissions{Options: []string{}, Required: []string{}, Allowed: []string{},
		Granted: grants, Extra: grants, Withheld: []string{}}
	wantB := runstore.Permissions{Options: []string{}, Required: []string{"network"}, Allowed: []string{"host.read", "network"},
		Granted: grants, Extra: []string{"repository.read", "repository.search", "repository.diff", "repository.history.read",
			"repository.write", "repository.history.write", "process.execute", "host.write"}, Withheld: []string{}}
	calls := f.store.last(t).Calls
	if len(calls) != 2 {
		t.Fatalf("calls %+v", calls)
	}
	for i, want := range []runstore.Permissions{wantA, wantB} {
		if !reflect.DeepEqual(calls[i].Permissions, want) || !reflect.DeepEqual(calls[i].Environment, []runstore.Variable{}) {
			t.Errorf("call %s permissions %+v, environment %+v; want %+v, []", calls[i].Step, calls[i].Permissions, calls[i].Environment, want)
		}
	}
}
