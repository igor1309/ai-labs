package app_test

import (
	"context"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// Integration test: temporary settings files, resolution, inspection and run
// records; runtime, clock, inputs and worktree effects are the harness's spies.
func TestPermissionWarningsAndHardRefusalsFromSettingsFiles(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name, grants, required, version, warning, refusal string
		extra                                             []string
		writer                                            bool
	}{
		{name: "extra grants", grants: "repository.read, process.execute", required: "repository.read", version: "1.", warning: "grants beyond tools.allow: process.execute", extra: []string{"process.execute"}},
		{name: "extra writing grant", grants: "repository.read, repository.write", required: "repository.read", version: "1.", warning: "grants beyond tools.allow: repository.write", extra: []string{"repository.write"}, writer: true},
		{name: "require withheld", grants: "repository.read", required: "repository.search", version: "1.", refusal: "required permissions would be withheld: repository.search"},
		{name: "state reaching", grants: "repository.read, host.read", required: "repository.read", version: "1.", refusal: "grants state_reaching permissions: host.read"},
		{name: "unverified version", grants: "repository.read", required: "repository.read", version: "9.", warning: "unverified"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			docs := settingsDocs()
			if c.writer {
				docs[document.KindService]["service"] = strings.Replace(strings.Replace(docs[document.KindService]["service"], "writing = []", "writing = [\"repository.write\"]", 1), "\"host.read\"]", "\"host.read\", \"repository.write\"]", 1)
			}
			docs[document.KindRuntime]["rt"] = oneOf("rt", "Read: {grants: ["+c.grants+"], verified: [\""+c.version+"\"]}")
			docs[document.KindProcess]["p"] = strings.Replace(docs[document.KindProcess]["p"], "tools: {allow: [repository.read, repository.search, repository.diff]}", "tools: {allow: [repository.read, repository.search], require: ["+c.required+"]}", 1)
			client := h.clientOn(settingsFiles(t, docs))
			report, err := client.Check(context.Background(), true)
			if err != nil {
				t.Fatal(err)
			}
			view, err := client.ShowWorkflow(context.Background(), "p_a")
			if err != nil {
				t.Fatal(err)
			}
			record := h.submit(t, client, contract.CallRequest{Process: "p_a"})
			if c.refusal != "" {
				if len(report.Problems) == 0 || !strings.Contains(strings.Join(messages(report.Problems), "\n"), c.refusal) || !strings.Contains(view.Refusal, c.refusal) || class(record) != run.ClassRefused || !strings.Contains(message(record), c.refusal) || len(h.runner.calls()) != 0 {
					t.Fatalf("hard check: report %+v, view %+v, result %+v", report, view, record.Result)
				}
				return
			}
			if len(report.Problems) != 0 || !strings.Contains(strings.Join(report.Warnings, "\n"), c.warning) || !strings.Contains(strings.Join(view.Warnings, "\n"), c.warning) || record.Result.Status != run.Completed || !strings.Contains(strings.Join(record.Result.Warnings, "\n"), c.warning) || len(h.runner.calls()) != 1 {
				t.Fatalf("warning and run: report %+v, view %+v, result %+v", report, view, record.Result)
			}
			if !reflect.DeepEqual(report.Bindings[0].Extra, c.extra) {
				t.Fatalf("binding extra = %v", report.Bindings[0].Extra)
			}
			child := record // A one-call workflow is the call's own record.
			if child.Plan == nil || !reflect.DeepEqual(child.Plan.Declared, []string{"repository.read", "repository.search"}) || !slices.Equal(child.Plan.Extra, c.extra) || !contains(child.Plan.Granted, "repository.read") || !strings.Contains(strings.Join(child.Result.Warnings, "\n"), c.warning) {
				t.Fatalf("call record = %+v", child)
			}
			if child.InPlace == nil || child.InPlace.HeldAlone() != c.writer {
				t.Fatalf("hold = %+v, writer %v", child.InPlace, c.writer)
			}
			// The serialized result is what callers consume, not only the domain record.
			shown, err := app.NewRuns(&readerSpy{record: record, state: run.StateFinished}, unwritten{}, &cancellerSpy{}, app.RunsTimer(h.timer), 0).Inspect(context.Background(), record.ID)
			if err != nil || shown.Result == nil || !strings.Contains(strings.Join(shown.Result.Warnings, "\n"), c.warning) {
				t.Fatalf("caller result = %+v, %v", shown.Result, err)
			}
		})
	}
}

// Integration test: temporary workflow settings and the call result boundary;
// the harness controls runtimes, worktree effects, inputs and time.
func TestWorkflowOutcomeCarriesEachNodesPermissionWarning(t *testing.T) {
	t.Parallel()
	h := newHarness()
	docs := workflowDocs()
	docs[document.KindRuntime]["rt"] = oneOf("rt", "Read: {grants: [repository.read, process.execute], verified: [\"1.\"]}")
	store := newStoreSpy()
	calls := h.callsRecordedWith(settingsFiles(t, docs), h.workspaces, h.changes, h.runs, store, &seqIDs{})
	id, err := calls.Submit(context.Background(), contract.CallRequest{Process: "w", Cwd: "/repo", Params: map[string]string{"candidate": "HEAD"}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		h.hosted.Cancel(id)
		<-store.handle(t, id).done
	})
	record := store.wait(t, id)
	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	for _, node := range []string{"one", "two", "merge"} {
		want := "node " + node + ": runtime rt grants beyond tools.allow: process.execute"
		if !contains(record.Result.Warnings, want) {
			t.Fatalf("warnings = %q, want %q", record.Result.Warnings, want)
		}
	}
	if len(record.Result.Warnings) != 3 {
		t.Fatalf("warnings = %q", record.Result.Warnings)
	}
}
