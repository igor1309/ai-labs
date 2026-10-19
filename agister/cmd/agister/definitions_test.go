package main

import (
	"context"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// definitionAt is the identity expected for the given fixture file.
func definitionAt(settings map[string]string, kind, name, layer, path string) runstore.Definition {
	return runstore.Definition{Kind: kind, Name: name, Files: []runstore.File{{Layer: layer, Path: path, Digest: identity(settings[path])}}}
}

func askDefinitions(settings map[string]string, agent string) []runstore.Definition {
	runtime := "claude-code"
	if agent == "codex-sol-61" {
		runtime = "codex"
	}
	return []runstore.Definition{
		definitionAt(settings, "agent", agent, "home", "/u/.agister/agents/"+agent+".toml"),
		definitionAt(settings, "process", "ask", "repository", "/r/.agister/processes/ask.yaml"),
		definitionAt(settings, "prompt", "ask", "repository", "/r/.agister/prompts/ask.md"),
		definitionAt(settings, "prompt", "g", "repository", "/r/.agister/prompts/g.md"),
		definitionAt(settings, "runtime", runtime, "home", "/u/.agister/runtimes/"+runtime+".yaml"),
		definitionAt(settings, "schema", "answer", "repository", "/r/.agister/schemas/answer.json"),
	}
}

// definitions.feature, "A call names each document its plan read" and
// "A call refused names its definitions".
// Contract test: the files home holds, as Agister ships them.
func TestACallRecordsItsDefinitions(t *testing.T) {
	t.Parallel()
	for _, clean := range []bool{true, false} {
		t.Run(map[bool]string{true: "made", false: "refused"}[clean], func(t *testing.T) {
			t.Parallel()
			settings := modelSettings(t, map[string]string{"/r/.agister/processes/ask.yaml": askProcess + "workspace: {clean: true}\n"})
			f := newRecordFixture(t, settings, nil)
			f.holding.clean = clean
			f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`)})
			f.validator = &validatorSpy{}
			got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
			wantCode := 0
			if !clean {
				wantCode = 1
			}
			if got.code != wantCode || got.stderr != "" {
				t.Fatalf("ran %+v", got)
			}
			record := f.store.last(t)
			if len(record.Calls) != 1 {
				t.Fatalf("calls %+v", record.Calls)
			}
			want := askDefinitions(settings, "claude-opus")
			if !reflect.DeepEqual(record.Calls[0].Definitions, want) {
				t.Errorf("definitions %+v, want %+v", record.Calls[0].Definitions, want)
			}
			if clean {
				if record.Calls[0].Result.Status != "completed" {
					t.Errorf("result %+v", record.Calls[0].Result)
				}
			} else if record.Calls[0].Result.Class == nil || *record.Calls[0].Result.Class != "refused" {
				t.Errorf("result %+v", record.Calls[0].Result)
			}
			if defs := asJSON(t, record.Request)["definitions"]; !reflect.DeepEqual(defs, []any{}) {
				t.Errorf("request definitions %v, want []", defs)
			}
		})
	}
}

// definitions.feature, "A workflow's files are the request's".
// Contract test: the files home holds, as Agister ships them.
func TestAWorkflowRecordsItsDefinitionsApartFromItsCalls(t *testing.T) {
	t.Parallel()
	settings := runSettings(t, nil)
	f := newRecordFixture(t, settings, echoes)
	if got := f.run(t, "/r", "run", "pair"); got.code != 0 || got.stderr != "" {
		t.Fatalf("ran %+v", got)
	}
	record := f.store.last(t)
	want := []runstore.Definition{definitionAt(settings, "workflow", "pair", "home", "/u/.agister/workflows/pair.yaml")}
	if !reflect.DeepEqual(record.Request.Definitions, want) {
		t.Errorf("request definitions %+v, want %+v", record.Request.Definitions, want)
	}
	want = []runstore.Definition{
		definitionAt(settings, "agent", "bash", "home", "/u/.agister/agents/bash.toml"),
		definitionAt(settings, "process", "say", "home", "/u/.agister/processes/say.yaml"),
		definitionAt(settings, "prompt", "say", "home", "/u/.agister/prompts/say.md"),
		definitionAt(settings, "runtime", "bash", "home", "/u/.agister/runtimes/bash.yaml"),
	}
	if len(record.Calls) != 2 {
		t.Fatalf("calls %+v", record.Calls)
	}
	for _, c := range record.Calls {
		if !reflect.DeepEqual(c.Definitions, want) {
			t.Errorf("%s definitions %+v, want %+v", c.Step, c.Definitions, want)
		}
	}
}

// definitions.feature, "A workflow's input briefs are the request's".
// Contract test: the files home holds, as Agister ships them.
func TestAWorkflowRecordsItsInputBriefs(t *testing.T) {
	t.Parallel()
	f := newReviewFixture(t)
	f.runtimes.codex.answer = func(_ctx context.Context, turn codex.Turn) (codex.Result, error) {
		return completesReview(t, f.settings, turn)
	}
	got := f.run(t, "/r", "run", "code_review", "--param", "goal=g.md")
	if got.code != 0 || got.stderr != "" {
		t.Fatalf("ran %+v", got)
	}
	want := []runstore.Definition{
		definitionAt(f.settings, "brief", "goal", "home", "/u/.agister/brief-forms/goal.yaml"),
		definitionAt(f.settings, "workflow", "code_review", "home", "/u/.agister/workflows/code_review.yaml"),
	}
	if got := f.store.last(t).Request.Definitions; !reflect.DeepEqual(got, want) {
		t.Errorf("definitions %+v, want %+v", got, want)
	}
	assertDefinitionBytes(t, f)
}

// definitions.feature, "A continuation names the prompt continuation";
// session bindings include it only on the call that continues.
// Contract test: the files home holds, as Agister ships them.
func TestAContinuationRecordsItsPromptDefinition(t *testing.T) {
	t.Parallel()
	for _, external := range []bool{true, false} {
		t.Run(map[bool]string{true: "earlier run", false: "session binding"}[external], func(t *testing.T) {
			t.Parallel()
			f := newSessionFixture(t, talkWorkflow(), nil)
			args := []string{"run", "talk", "--param", "q=why"}
			if external {
				f.store.kept = map[string]runstore.Record{"R1": keptRun("R1", keptCall("R1/ask", "t1", "s1"))}
				args = []string{"run", "--process", "ask", "--agent", "claude-opus", "--param", "q=more", "--continue", "R1"}
			}
			if got := f.run(t, "/r", args...); got.code != 0 || got.stderr != "" {
				t.Fatalf("ran %+v", got)
			}
			for _, call := range f.store.last(t).Calls {
				want := askDefinitions(f.settings, "claude-opus")
				if external || call.Step == "second" {
					want = append(want[:3:3], append([]runstore.Definition{definitionAt(f.settings, "prompt", "continuation", "home", "/u/.agister/prompts/continuation.md")}, want[3:]...)...)
				}
				if !reflect.DeepEqual(call.Definitions, want) {
					t.Errorf("%s definitions %+v, want %+v", call.Step, call.Definitions, want)
				}
			}
			assertDefinitionBytes(t, f)
		})
	}
}

// definitions.feature, "A reuse takes a call only under the same definitions".
// Contract test: the files home holds, as Agister ships them.
func TestReuseComparesAllDefinitionFiles(t *testing.T) {
	t.Parallel()
	for _, change := range []string{"same", "unrelated document", "digest", "layer", "path", "legacy", "empty", "extra", "missing", "extra file"} {
		t.Run(change, func(t *testing.T) {
			t.Parallel()
			settings := modelSettings(t, nil)
			f := newRecordFixture(t, settings, nil)
			f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`)})
			f.validator = &validatorSpy{}
			earlier := keptCall("R1/ask", "t1", "s1")
			earlier.Inputs = []runstore.Input{{Name: "q", Value: "why", Identity: identity("why")}}
			earlier.Definitions = askDefinitions(settings, "claude-opus")
			earlier.Environment = []runstore.Variable{{Name: "A", Value: "1"}}
			switch change {
			case "unrelated document":
				f.settings["/r/.agister/prompts/unrelated.md"] = "other step changed"
			case "digest":
				earlier.Definitions[2].Files[0].Digest = "different"
			case "layer":
				earlier.Definitions[2].Files[0].Layer = "home"
			case "path":
				earlier.Definitions[2].Files[0].Path = "/elsewhere/ask.md"
			case "legacy":
				earlier.Definitions = nil
			case "empty":
				earlier.Definitions = []runstore.Definition{}
			case "extra":
				earlier.Definitions = append(earlier.Definitions, definitionAt(settings, "prompt", "x", "home", "/x"))
			case "missing":
				earlier.Definitions = slices.Delete(earlier.Definitions, 2, 3)
			case "extra file":
				earlier.Definitions[2].Files = append(earlier.Definitions[2].Files, runstore.File{Layer: "home", Path: "/h/ask.md", Digest: identity("p")})
			}
			record := keptRun("R1", earlier)
			record.Request = runstore.Request{Process: "ask", Agent: "claude-opus", Dir: "/r"}
			f.store.kept = map[string]runstore.Record{"R1": record}
			got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why", "--reuse", "R1")
			if got.code != 0 || got.stderr != "" {
				t.Fatalf("ran %+v", got)
			}
			recorded := f.store.last(t).Calls[0]
			reused := recorded.Reuses != nil
			if reused != (change == "same" || change == "unrelated document") {
				t.Errorf("reuses %v, turns %d", recorded.Reuses, len(f.runtimes.claude.ran()))
			}
			wantTurns := 1
			if change == "same" || change == "unrelated document" {
				wantTurns = 0
				if !reflect.DeepEqual(recorded.Definitions, earlier.Definitions) {
					t.Errorf("reused definitions %+v, want %+v", recorded.Definitions, earlier.Definitions)
				}
			}
			if len(f.runtimes.claude.ran()) != wantTurns {
				t.Errorf("turns %d, want %d", len(f.runtimes.claude.ran()), wantTurns)
			}
			if strings.Contains(got.progress, "reused") != reused {
				t.Errorf("progress %q", got.progress)
			}
		})
	}
}
