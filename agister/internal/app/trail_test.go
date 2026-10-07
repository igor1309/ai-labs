package app_test

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// The trail of a call through Calls: the runner is a spy that reports the
// paths its tool calls write and the calls it was denied.

// trailed is one of a call's events as its trail test reads it: its kind
// and data.
type trailed struct {
	kind string
	data map[string]any
}

// trailOf lists the call's events of the kinds given, in order.
func trailOf(h *harness, kinds ...string) []trailed {
	h.recorder.mu.Lock()
	defer h.recorder.mu.Unlock()
	var found []trailed
	for _, event := range h.recorder.events {
		for _, kind := range kinds {
			if event.Kind == kind {
				found = append(found, trailed{event.Kind, event.Data})
			}
		}
	}
	return found
}

// touched is the TOUCHED event of a path the tool's call id wrote.
func touched(path, tool, id string) trailed {
	return trailed{"TOUCHED", map[string]any{"path": path, "tool": tool, "tool_use_id": id}}
}

// denied is the PERMISSION_DENIED event of the tool's call with input.
func denied(tool, input string) trailed {
	return trailed{"PERMISSION_DENIED", map[string]any{"tool": tool, "input": input}}
}

// A completed turn's events hold, in the order the runtime reported them,
// each path a tool call wrote, as given, with its tool and call, and each
// tool call denied; the record's trail holds each path once, at its first
// write, and every denial. The paths are on record as soon as reported.
func TestACompletedTurnLeavesItsTrail(t *testing.T) {
	t.Parallel()
	h := newHarness()
	var during *run.Trail
	h.runner.acting = func(_ context.Context, sink app.EventSink) {
		sink.Event(run.SourceProtocol, "TOOL_REQUESTED", map[string]any{"tool_use_id": "t1"})
		sink.ToolStarted(app.ToolCall{ID: "t1", Name: "Edit", Input: `{"file_path":"/work/checkout/a.go"}`, Writes: []string{"/work/checkout/a.go"}})
		sink.ToolStarted(app.ToolCall{ID: "t2", Name: "Bash", Input: `{"command":"rm b.go"}`, Command: true})
		// Neither inside the workspace nor absolute: recorded as given.
		sink.ToolStarted(app.ToolCall{ID: "t3", Name: "file_change", Writes: []string{"../outside/c.go", "/work/checkout/a.go", "d.go"}})
		sink.ToolStarted(app.ToolCall{ID: "t4", Name: "Write", Writes: []string{"/work/checkout/a.go"}})
		h.recorder.mu.Lock()
		if n := len(h.recorder.updates); n > 0 {
			during = h.recorder.updates[n-1].Trail
		}
		h.recorder.mu.Unlock()
		sink.Event(run.SourceProtocol, "TURN_COMPLETED", nil)
		sink.PermissionDenied(app.PermissionDenial{Tool: "Bash", Input: `{"command":"rm b.go"}`})
		sink.PermissionDenied(app.PermissionDenial{Tool: "Bash", Input: `{"command":"rm b.go"}`})
		sink.PermissionDenied(app.PermissionDenial{Tool: "Write"})
	}
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed {
		t.Fatalf("result = %+v", record.Result)
	}
	events := []trailed{
		{"TOOL_REQUESTED", map[string]any{"tool_use_id": "t1"}},
		touched("/work/checkout/a.go", "Edit", "t1"),
		touched("../outside/c.go", "file_change", "t3"),
		touched("/work/checkout/a.go", "file_change", "t3"),
		touched("d.go", "file_change", "t3"),
		touched("/work/checkout/a.go", "Write", "t4"),
		{"TURN_COMPLETED", nil},
		denied("Bash", `{"command":"rm b.go"}`),
		denied("Bash", `{"command":"rm b.go"}`),
		denied("Write", ""),
	}
	if got := trailOf(h, "TOOL_REQUESTED", "TOUCHED", "TURN_COMPLETED", "PERMISSION_DENIED"); !reflect.DeepEqual(got, events) {
		t.Fatalf("events =\n%v\nwant\n%v", got, events)
	}
	paths := []run.Touched{{Path: "/work/checkout/a.go", Tool: "Edit"}, {Path: "../outside/c.go", Tool: "file_change"}, {Path: "d.go", Tool: "file_change"}}
	want := &run.Trail{
		Touched: paths,
		Denied:  []run.Denial{{Tool: "Bash", Input: `{"command":"rm b.go"}`}, {Tool: "Bash", Input: `{"command":"rm b.go"}`}, {Tool: "Write"}},
	}
	if !reflect.DeepEqual(record.Trail, want) {
		t.Fatalf("trail = %+v", record.Trail)
	}
	if !reflect.DeepEqual(during, &run.Trail{Touched: paths}) {
		t.Fatalf("trail on record while the turn ran = %+v", during)
	}
	// What `runs show` prints of it.
	printed, _ := json.Marshal(struct {
		Trail *run.Trail `json:"trail"`
	}{record.Trail})
	if got := string(printed); got != `{"trail":{"touched":[{"path":"/work/checkout/a.go","tool":"Edit"},{"path":"../outside/c.go","tool":"file_change"},{"path":"d.go","tool":"file_change"}],`+
		`"denied":[{"tool":"Bash","input":"{\"command\":\"rm b.go\"}"},{"tool":"Bash","input":"{\"command\":\"rm b.go\"}"},{"tool":"Write"}]}}` {
		t.Fatalf("printed %s", got)
	}
}

// A call whose runtime reports no path written and no call denied has no
// trail, and none of its events.
func TestACallThatReportsNeitherHasNoTrail(t *testing.T) {
	t.Parallel()
	h := newHarness()
	h.runner.acting = func(_ context.Context, sink app.EventSink) {
		sink.ToolStarted(app.ToolCall{ID: "t1", Name: "Read", Input: `{"file_path":"a.go"}`})
		sink.ToolFinished(app.ToolResult{ID: "t1"})
	}
	record := h.call(t, contract.CallRequest{})
	data, _ := json.Marshal(record)
	var printed map[string]any
	_ = json.Unmarshal(data, &printed)
	if _, has := printed["trail"]; record.Trail != nil || has || len(trailOf(h, "TOUCHED", "PERMISSION_DENIED")) != 0 {
		t.Fatalf("trail = %+v, printed %v, events %v", record.Trail, has, h.recorder.kinds())
	}
}

// A turn a staleness limit ended keeps what it reported before it ended:
// the events, in order with the limit reached, and the record's trail,
// beside the turn's stale record. A path reported once the limit was
// reached, before the runtime ended, is kept too.
func TestAStaleTurnKeepsItsTrail(t *testing.T) {
	t.Parallel()
	h, timers := staleHarness(t, "no_event: 5m")
	h.runner.block = true
	h.runner.acting = func(_ context.Context, sink app.EventSink) {
		sink.ToolStarted(app.ToolCall{ID: "t1", Name: "Edit", Writes: []string{"a.go"}})
		sink.PermissionDenied(app.PermissionDenial{Tool: "Bash", Input: `{"command":"git push"}`})
		timers.advance(6 * time.Minute)
		sink.ToolStarted(app.ToolCall{ID: "t2", Name: "Write", Writes: []string{"late.go"}})
	}
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Interrupted || class(record) != run.ClassTimeout || record.Turn.Stale == nil || record.Turn.Stale.Limit != run.StaleNoEvent {
		t.Fatalf("result = %+v, stale %+v", record.Result, record.Turn.Stale)
	}
	got := trailOf(h, "TOUCHED", "PERMISSION_DENIED", "STALE")
	if len(got) != 4 || !reflect.DeepEqual(got[0], touched("a.go", "Edit", "t1")) || !reflect.DeepEqual(got[1], denied("Bash", `{"command":"git push"}`)) ||
		got[2].kind != "STALE" || !reflect.DeepEqual(got[3], touched("late.go", "Write", "t2")) {
		t.Fatalf("events = %v", got)
	}
	want := &run.Trail{
		Touched: []run.Touched{{Path: "a.go", Tool: "Edit"}, {Path: "late.go", Tool: "Write"}},
		Denied:  []run.Denial{{Tool: "Bash", Input: `{"command":"git push"}`}},
	}
	if !reflect.DeepEqual(record.Trail, want) {
		t.Fatalf("trail = %+v", record.Trail)
	}
}

// The trail is the call's, not a turn's: a stale turn's paths stay on it
// when a recovery turn follows, whose own come after them.
func TestTheTrailHoldsEveryTurnOfTheCall(t *testing.T) {
	t.Parallel()
	h, timers := recoveryHarness(t, "no_event: 5m", 1)
	stale := silent(timers, "prov-1")
	quiet := stale.act
	stale.act = func(ctx context.Context, sink app.EventSink) {
		sink.ToolStarted(app.ToolCall{ID: "t1", Name: "Edit", Writes: []string{"a.go"}})
		quiet(ctx, sink)
	}
	recovered := completes(h)
	recovered.act = func(_ context.Context, sink app.EventSink) {
		sink.ToolStarted(app.ToolCall{ID: "t1", Name: "Write", Writes: []string{"a.go"}})
		sink.ToolStarted(app.ToolCall{ID: "t2", Name: "Write", Writes: []string{"b.go"}})
	}
	play(h, stale, recovered)
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed || len(record.Recoveries) != 1 || record.Turn.Stale != nil {
		t.Fatalf("result = %+v, recoveries %+v", record.Result, record.Recoveries)
	}
	want := &run.Trail{Touched: []run.Touched{{Path: "a.go", Tool: "Edit"}, {Path: "b.go", Tool: "Write"}}}
	if !reflect.DeepEqual(record.Trail, want) {
		t.Fatalf("trail = %+v", record.Trail)
	}
	events := []trailed{touched("a.go", "Edit", "t1"), touched("a.go", "Write", "t1"), touched("b.go", "Write", "t2")}
	if got := trailOf(h, "TOUCHED"); !reflect.DeepEqual(got, events) {
		t.Fatalf("events = %v", got)
	}
}
