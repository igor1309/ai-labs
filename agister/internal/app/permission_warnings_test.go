package app_test

import (
	"context"
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"sync"
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
		extra, granted                                    []string
		writer                                            bool
	}{
		{name: "extra grants", grants: "repository.read, process.execute", required: "repository.read", version: "1.", warning: "grants beyond tools.allow: process.execute", extra: []string{"process.execute"}, granted: []string{"repository.read", "process.execute"}},
		{name: "extra writing grant", grants: "repository.read, repository.write", required: "repository.read", version: "1.", warning: "grants beyond tools.allow: repository.write", extra: []string{"repository.write"}, granted: []string{"repository.read", "repository.write"}, writer: true},
		{name: "require withheld", grants: "repository.read", required: "repository.search", version: "1.", refusal: "required permissions would be withheld: repository.search"},
		{name: "state reaching", grants: "repository.read, host.read", required: "repository.read", version: "1.", refusal: "grants state_reaching permissions: host.read"},
		{name: "unverified version", grants: "repository.read", required: "repository.read", version: "9.", warning: "unverified", granted: []string{"repository.read"}},
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
			var granted []string
			if record.Plan != nil {
				granted = record.Plan.Granted
			}
			if !slices.Equal(granted, c.granted) {
				t.Fatalf("recorded granted = %v, want %v", granted, c.granted)
			}
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
			if child.Plan == nil || !reflect.DeepEqual(child.Plan.Declared, []string{"repository.read", "repository.search"}) || !slices.Equal(child.Plan.Extra, c.extra) || !strings.Contains(strings.Join(child.Result.Warnings, "\n"), c.warning) {
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

// Integration test: temporary settings files, resolution and workflow inspection;
// runtime identity and effects are the harness's spies.
func TestShowWorkflowWarnsOfExtraGrantsOnARefusedBinding(t *testing.T) {
	t.Parallel()
	h := newHarness()
	docs := settingsDocs()
	docs[document.KindRuntime]["rt"] = oneOf("rt", `Read: {grants: [repository.read, process.execute], verified: ["1."]}`)
	docs[document.KindProcess]["p"] = strings.Replace(docs[document.KindProcess]["p"],
		"tools: {allow: [repository.read, repository.search, repository.diff]}",
		"tools: {allow: [repository.read, repository.search, repository.diff], require: [repository.search]}", 1)
	client := h.clientOn(settingsFiles(t, docs))
	view, err := client.ShowWorkflow(context.Background(), "p_a")
	if err != nil {
		t.Fatal(err)
	}
	const refusal = "required permissions would be withheld: repository.search"
	if !strings.Contains(view.Refusal, refusal) || view.Call == nil || !strings.Contains(view.Call.Process.Refusal, refusal) {
		t.Fatalf("view = %+v, want a workflow and binding refused for %q", view, refusal)
	}
	const warning = "runtime rt grants beyond tools.allow: process.execute"
	if !reflect.DeepEqual(view.Call.Process.Warnings, []string{warning}) || !reflect.DeepEqual(view.Warnings, []string{"node p: " + warning}) {
		t.Fatalf("binding warnings = %q, workflow warnings = %q", view.Call.Process.Warnings, view.Warnings)
	}
	if !reflect.DeepEqual(view.Call.Process.Withheld, []string{"repository.diff"}) {
		t.Fatalf("withheld = %q, want only the optional withheld permission", view.Call.Process.Withheld)
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
	if !slices.Equal(record.Workflow.Warnings, record.Result.Warnings) {
		t.Fatalf("persisted workflow warnings = %q, outcome warnings = %q", record.Workflow.Warnings, record.Result.Warnings)
	}
}

// Integration test: repeated grants in temporary settings, resolution and run
// records; runtime and worktree effects are the harness's spies.
func TestOnePrimitiveCountsDistinctGrants(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name, required string
		primitives     []string
		want           string
		granted, extra []string
		refused        bool
	}{
		{
			name: "narrowest required mode", required: "repository.read",
			primitives: []string{
				`Wide: {grants: [repository.read, repository.search, repository.diff], verified: ["1."]}`,
				`Narrow: {grants: [repository.read, process.execute, repository.read, process.execute], verified: ["1."]}`,
			},
			want: "Narrow", granted: []string{"repository.read", "process.execute"}, extra: []string{"process.execute"},
		},
		{
			name: "narrowest refusal fallback", required: "repository.search", refused: true,
			primitives: []string{
				`Wide: {grants: [repository.read, process.execute], verified: ["1."]}`,
				`Narrow: {grants: [repository.read, repository.read, repository.read], verified: ["1."]}`,
			},
			want: "Narrow", granted: []string{"repository.read"},
		},
		{
			name: "required mode tie uses mapping order", required: "repository.read",
			primitives: []string{
				`First: {grants: [repository.read, repository.read], verified: ["1."]}`,
				`Second: {grants: [repository.read], verified: ["1."]}`,
			},
			want: "First", granted: []string{"repository.read"},
		},
		{
			name: "fallback tie uses mapping order", required: "repository.search", refused: true,
			primitives: []string{
				`First: {grants: [repository.read, repository.read], verified: ["1."]}`,
				`Second: {grants: [process.execute], verified: ["1."]}`,
			},
			want: "First", granted: []string{"repository.read"},
		},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := newHarness()
			docs := settingsDocs()
			docs[document.KindRuntime]["rt"] = oneOf("rt", c.primitives...)
			docs[document.KindProcess]["p"] = strings.Replace(docs[document.KindProcess]["p"],
				"tools: {allow: [repository.read, repository.search, repository.diff]}",
				"tools: {allow: [repository.read, repository.search], require: ["+c.required+"]}", 1)
			client := h.clientOn(settingsFiles(t, docs))
			view, err := callShown(client, "p_a")
			if err != nil || (!c.refused && !slices.Equal(view.Primitives, []string{c.want})) {
				t.Fatalf("plan = %+v, %v; want %s granting %v, extra %v", view, err, c.want, c.granted, c.extra)
			}
			record := h.submit(t, client, contract.CallRequest{Process: "p_a"})
			if c.refused {
				if len(view.Warnings) != 0 || len(view.Withheld) != 0 {
					t.Fatalf("fallback view = %+v; want no extra grants or optional withheld permissions", view)
				}
				if class(record) != run.ClassRefused || !strings.Contains(message(record), "required permissions would be withheld: repository.search") || len(h.runner.calls()) != 0 {
					t.Fatalf("required permission: result %+v, turns %v", record.Result, h.runner.calls())
				}
				return
			}
			if record.Result.Status != run.Completed || record.Plan == nil || !slices.Equal(record.Plan.Primitives, []string{c.want}) || !slices.Equal(record.Plan.Granted, c.granted) || !slices.Equal(record.Plan.Extra, c.extra) || len(h.runner.calls()) != 1 {
				t.Fatalf("recorded plan = %+v, result %+v, turns %v", record.Plan, record.Result, h.runner.calls())
			}
			if len(c.extra) > 0 && !contains(record.Result.Warnings, "runtime rt grants beyond tools.allow: process.execute") {
				t.Fatalf("warnings = %v", record.Result.Warnings)
			}
		})
	}
}

// Integration test: temporary settings, the recorder's runtime-start snapshot,
// the abandoned reader view and reaper outcome; external effects are spies.
func TestPermissionWarningsSurviveAbandonmentAndReaping(t *testing.T) {
	t.Parallel()
	h := newHarness()
	docs := settingsDocs()
	docs[document.KindRuntime]["rt"] = oneOf("rt", `Read: {grants: [repository.read, process.execute], verified: ["9."]}`)
	want := []string{
		"runtime rt grants beyond tools.allow: process.execute",
		"runtime rt version 1.2.3 is unverified",
	}
	snapshot := make(chan run.Record, 1)
	h.runner.during = func(app.TurnRequest) {
		h.recorder.mu.Lock()
		defer h.recorder.mu.Unlock()
		for _, update := range h.recorder.updates {
			if update.Plan != nil && (update.Effects == nil || update.Effects.Process == nil) {
				snapshot <- update
				return
			}
		}
		snapshot <- run.Record{}
	}
	finished := h.submit(t, h.clientOn(settingsFiles(t, docs)), contract.CallRequest{Process: "p_a"})
	if !slices.Equal(finished.Result.Warnings, want) {
		t.Fatalf("finished warnings = %v, want %v", finished.Result.Warnings, want)
	}
	left := <-snapshot
	if left.Result != nil || left.FinishedAt != nil || left.Plan == nil || !slices.Equal(left.Plan.Warnings, want) {
		t.Fatalf("runtime-start snapshot = %+v, plan %+v", left, left.Plan)
	}
	reader := &readerSpy{record: left, state: run.StateAbandoned}
	runs := app.NewRuns(reader, unwritten{}, &cancellerSpy{}, app.RunsTimer(h.timer), 0)
	view, err := runs.Inspect(context.Background(), left.ID)
	if err != nil || view.Result == nil || view.Result.Status != "lost" || !slices.Equal(view.Result.Warnings, want) {
		t.Fatalf("abandoned result = %+v, %v", view.Result, err)
	}
	reaper := reaping(h, left)
	reaper.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) { return context.WithCancel(ctx) }
	if _, owned, err := reaper.ReapRun(context.Background(), left.ID); err != nil || owned {
		t.Fatalf("reap: owned %v, %v", owned, err)
	}
	reaped := reaper.adopter.handles[left.ID].wait(t)
	if reaped.Result == nil || reaped.Result.Status != run.Lost || class(reaped) != run.ClassAbandoned || !slices.Equal(reaped.Result.Warnings, want) {
		t.Fatalf("reaped result = %+v", reaped.Result)
	}
	reader.record, reader.state = reaped, run.StateFinished
	view, err = runs.Inspect(context.Background(), left.ID)
	if err != nil || view.Result == nil || !slices.Equal(view.Result.Warnings, want) {
		t.Fatalf("reaped caller result = %+v, %v", view.Result, err)
	}
}

// Integration test: temporary workflow settings, unfinished parent records,
// abandoned inspection and reaping; channels control node completion and all
// runtime, clock and worktree effects are spies.
func TestWorkflowWarningsSurviveAbandonmentAndReaping(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name, instruction, running string
		completed                  []string
	}{
		{name: "sibling running", instruction: "Work as second.", running: "two", completed: []string{"one"}},
		{name: "join running", instruction: "Join them.", running: "merge", completed: []string{"one", "two"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			h := newFlowHarness()
			docs := workflowDocs()
			docs[document.KindRuntime]["rt"] = oneOf("rt", `Read: {grants: [repository.read, process.execute], verified: ["9."]}`)
			h.calls = h.callsOn(settingsFiles(t, docs))
			held := h.script(c.instruction)
			held.started, held.release = make(chan struct{}), make(chan struct{})
			snapshot := make(chan run.Record, 1)
			var once sync.Once
			h.store.onUpdate = func(record run.Record) {
				if record.Workflow == nil {
					return
				}
				for _, node := range record.Workflow.Nodes {
					if contains(c.completed, node.Name) && node.Status != run.Completed || node.Name == c.running && (node.Run == "" || node.Status != "") {
						return
					}
				}
				once.Do(func() {
					// A serialized snapshot cannot change when the live parent
					// records another node or finishes.
					data, err := json.Marshal(record)
					if err != nil {
						t.Error(err)
					}
					var saved run.Record
					if err := json.Unmarshal(data, &saved); err != nil {
						t.Error(err)
					}
					snapshot <- saved
				})
			}
			id := h.submit(t, contract.CallRequest{})
			h.stopOnCleanup(t, id)
			left := <-snapshot
			<-held.started
			want := []string{}
			for _, node := range c.completed {
				want = append(want, "node "+node+": runtime rt grants beyond tools.allow: process.execute", "node "+node+": runtime rt version 1.2.3 is unverified")
			}
			assertWarnings := func(got []string) {
				t.Helper()
				if !slices.Equal(slices.Sorted(slices.Values(got)), slices.Sorted(slices.Values(want))) {
					t.Fatalf("warnings = %v, want %v", got, want)
				}
			}
			if left.Result != nil || left.FinishedAt != nil || left.Plan != nil || left.Workflow == nil {
				t.Fatalf("unfinished parent = %+v", left)
			}
			assertWarnings(left.Workflow.Warnings)
			reader := &readerSpy{record: left, state: run.StateAbandoned}
			runs := app.NewRuns(reader, unwritten{}, &cancellerSpy{}, app.RunsTimer(unfired), 0)
			view, err := runs.Inspect(context.Background(), id)
			if err != nil || view.Result == nil || view.Result.Status != "lost" {
				t.Fatalf("abandoned parent = %+v, %v", view.Result, err)
			}
			assertWarnings(view.Result.Warnings)
			reaper := app.NewReaper(&adopterSpy{runs: []run.Record{left}}, &processesSpy{}, h.workspaces, fixedClock{})
			reaper.ReapContext = func(ctx context.Context) (context.Context, context.CancelFunc) { return context.WithCancel(ctx) }
			reaped, owned, err := reaper.ReapRun(context.Background(), id)
			if err != nil || owned || reaped.Result == nil || reaped.Result.Status != run.Lost || class(reaped) != run.ClassAbandoned {
				t.Fatalf("reaped parent = %+v, owned %v, %v", reaped.Result, owned, err)
			}
			assertWarnings(reaped.Workflow.Warnings)
			assertWarnings(reaped.Result.Warnings)
			reader.record, reader.state = reaped, run.StateFinished
			view, err = runs.Inspect(context.Background(), id)
			if err != nil || view.Result == nil || view.Result.Status != "lost" {
				t.Fatalf("reaped caller result = %+v, %v", view.Result, err)
			}
			assertWarnings(view.Result.Warnings)
		})
	}
}
