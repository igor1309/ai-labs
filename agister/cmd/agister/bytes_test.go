package main

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

// assertDefinitionBytes checks every record write against the byte writes
// that preceded it, and that each named digest was tried exactly once.
func assertDefinitionBytes(t *testing.T, f *runFixture) {
	t.Helper()
	s := f.store
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.records) == 0 {
		t.Fatal("no record written")
	}
	want := map[string]string{}
	for i, record := range s.records {
		named := append([]runstore.Definition{}, record.Request.Definitions...)
		for _, call := range record.Calls {
			named = append(named, call.Definitions...)
		}
		before := map[string]string{}
		for _, write := range s.definitionWrites[:s.definitionWritesAtRecord[i]] {
			if write.id != record.ID {
				t.Errorf("bytes written under %q, want %q", write.id, record.ID)
			}
			before[write.digest] = write.data
		}
		for _, definition := range named {
			for _, file := range definition.Files {
				data, exists := f.settings[file.Path]
				if !exists || identity(data) != file.Digest {
					t.Fatalf("unexpected file %+v", file)
				}
				if got, ok := before[file.Digest]; !ok || got != data {
					t.Errorf("record write %d names %q before its bytes: got %q, tried %v; want %q", i, file.Path, got, ok, data)
				}
				want[file.Digest] = data
			}
		}
	}
	got := map[string]string{}
	for _, write := range s.definitionWrites {
		if _, duplicate := got[write.digest]; duplicate {
			t.Errorf("digest %q tried twice", write.digest)
		}
		got[write.digest] = write.data
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("definition bytes %q, want %q", got, want)
	}
}

// bytes.feature, "A call's definition files are written by their digest"
// and "A call taken by a reuse has its bytes written under this run".
// Contract test: the files home holds, as Agister ships them.
func TestACallsDefinitionBytesPrecedeItsRecord(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"made", "refused", "reused"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			settings := modelSettings(t, map[string]string{"/r/.agister/processes/ask.yaml": askProcess + "workspace: {clean: true}\n"})
			f := newRecordFixture(t, settings, nil)
			f.holding.clean = kind != "refused"
			f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`)})
			f.validator = &validatorSpy{}
			args := []string{"run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why"}
			if kind == "reused" {
				earlier := keptCall("R1/ask", "t1", "s1")
				earlier.Inputs = []runstore.Input{{Name: "q", Value: "why", Identity: identity("why")}}
				earlier.Definitions = askDefinitions(settings, "claude-opus")
				earlier.Environment = []runstore.Variable{{Name: "A", Value: "1"}}
				record := keptRun("R1", earlier)
				record.Request = runstore.Request{Process: "ask", Agent: "claude-opus", Dir: "/r"}
				f.store.kept = map[string]runstore.Record{"R1": record}
				args = append(args, "--reuse", "R1")
			}
			got := f.run(t, "/r", args...)
			wantCode := 0
			if kind == "refused" {
				wantCode = 1
			}
			if got.code != wantCode || got.stderr != "" {
				t.Fatalf("ran %+v", got)
			}
			call := f.store.last(t).Calls[0]
			if !reflect.DeepEqual(call.Definitions, askDefinitions(settings, "claude-opus")) {
				t.Fatalf("definitions %+v", call.Definitions)
			}
			if kind == "reused" && (call.Reuses == nil || *call.Reuses != "R1/ask" || len(f.runtimes.claude.ran()) != 0) {
				t.Fatalf("reuse %+v, turns %d", call.Reuses, len(f.runtimes.claude.ran()))
			}
			assertDefinitionBytes(t, f)
		})
	}
}

// bytes.feature, "A digest read by two steps is written once": the
// workflow precedes the first record, and shared call files are tried once.
// Contract test: the files home holds, as Agister ships them.
func TestAWorkflowKeepsEachDefinitionsBytesOnce(t *testing.T) {
	t.Parallel()
	f := newRecordFixture(t, runSettings(t, nil), echoes)
	if got := f.run(t, "/r", "run", "pair"); got.code != 0 || got.stderr != "" {
		t.Fatalf("ran %+v", got)
	}
	if record := f.store.last(t); len(record.Request.Definitions) != 1 || len(record.Calls) != 2 {
		t.Fatalf("record %+v", record)
	}
	assertDefinitionBytes(t, f)
}

// bytes.feature, "Bytes not written are a warning, the call kept".
// Contract test: the files home holds, as Agister ships them.
func TestDefinitionWriteFailuresWarnOnceAndKeepTheRecord(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"guidance", "same bytes at two paths", "shared by two calls", "workflow", "continuation"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			settings := modelSettings(t, nil)
			path := "/r/.agister/prompts/g.md"
			args := []string{"run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why"}
			if kind == "same bytes at two paths" {
				settings[path] = settings["/r/.agister/prompts/ask.md"]
				path = "/r/.agister/prompts/ask.md"
			}
			if kind == "continuation" {
				path = "/u/.agister/prompts/continuation.md"
				settings[path] = settings["/r/.agister/prompts/g.md"]
				args = append(args, "--continue", "R1")
			}
			if kind == "shared by two calls" || kind == "workflow" {
				settings = runSettings(t, nil)
				path = "/u/.agister/processes/say.yaml"
				if kind == "workflow" {
					path = "/u/.agister/workflows/pair.yaml"
				}
				args = []string{"run", "pair"}
			}
			f := newRecordFixture(t, settings, echoes)
			if kind == "continuation" {
				f.store.kept = map[string]runstore.Record{"R1": keptRun("R1", keptCall("R1/ask", "t1", "s1"))}
			}
			f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`)})
			f.validator = &validatorSpy{}
			f.store.failDefinition = map[string]error{identity(settings[path]): errFull}
			got := f.run(t, "/r", args...)
			if got.code != 0 || got.stderr != "" {
				t.Fatalf("ran %+v", got)
			}
			var printed runstore.Result
			if err := json.Unmarshal([]byte(got.stdout), &printed); err != nil {
				t.Fatal(err)
			}
			var byteWarnings []string
			for _, warning := range printed.Warnings {
				if strings.HasPrefix(warning, "the definition ") {
					byteWarnings = append(byteWarnings, warning)
				}
			}
			if printed.Status != "completed" || len(byteWarnings) != 1 || byteWarnings[0] != "the definition \""+path+"\" could not be kept: "+errFull.Error() {
				t.Fatalf("result %+v; want completed, one warning naming %q", printed, path)
			}
			record := f.store.last(t)
			if record.Status != "completed" || !reflect.DeepEqual(record.Result.Warnings, printed.Warnings) {
				t.Fatalf("record %+v", record)
			}
			assertDefinitionBytes(t, f)
		})
	}
}
