package app_test

import (
	"context"
	"encoding/json"
	"errors"
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

// written is the trail of the record as the recorder was last given it to
// write: what a turn killed now would leave.
func written(h *harness) *run.Trail {
	h.recorder.mu.Lock()
	defer h.recorder.mu.Unlock()
	if n := len(h.recorder.updates); n > 0 {
		return h.recorder.updates[n-1].Trail
	}
	return nil
}

// A completed turn's events hold, in the order the runtime reported them,
// each path a tool call wrote, as given, with its tool and call, and each
// tool call denied; the record's trail holds each path once, at its first
// write, and every denial, a repeated one too, in the order reported. The
// paths and the denials are on record as soon as reported.
func TestACompletedTurnLeavesItsTrail(t *testing.T) {
	t.Parallel()
	h := newHarness()
	var during, denying *run.Trail
	h.runner.acting = func(_ context.Context, sink app.EventSink) {
		sink.Event(run.SourceProtocol, "TOOL_REQUESTED", map[string]any{"tool_use_id": "t1"})
		sink.ToolStarted(app.ToolCall{ID: "t1", Name: "Edit", Input: `{"file_path":"/work/checkout/a.go"}`, Writes: []string{"/work/checkout/a.go"}})
		sink.ToolStarted(app.ToolCall{ID: "t2", Name: "Bash", Input: `{"command":"rm b.go"}`, Command: true})
		// Neither inside the workspace nor absolute: recorded as given.
		sink.ToolStarted(app.ToolCall{ID: "t3", Name: "file_change", Writes: []string{"../outside/c.go", "/work/checkout/a.go", "d.go"}})
		sink.ToolStarted(app.ToolCall{ID: "t4", Name: "Write", Writes: []string{"/work/checkout/a.go"}})
		during = written(h)
		sink.Event(run.SourceProtocol, "TURN_COMPLETED", nil)
		// Ordered by neither tool nor input: only the order reported gives it.
		sink.PermissionDenied(app.PermissionDenial{Tool: "Write"})
		denying = written(h)
		sink.PermissionDenied(app.PermissionDenial{Tool: "Bash", Input: `{"command":"rm b.go"}`})
		sink.PermissionDenied(app.PermissionDenial{Tool: "Edit", Input: `{"file_path":"e.go"}`})
		sink.PermissionDenied(app.PermissionDenial{Tool: "Bash", Input: `{"command":"rm b.go"}`})
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
		denied("Write", ""),
		denied("Bash", `{"command":"rm b.go"}`),
		denied("Edit", `{"file_path":"e.go"}`),
		denied("Bash", `{"command":"rm b.go"}`),
	}
	if got := trailOf(h, "TOOL_REQUESTED", "TOUCHED", "TURN_COMPLETED", "PERMISSION_DENIED"); !reflect.DeepEqual(got, events) {
		t.Fatalf("events =\n%v\nwant\n%v", got, events)
	}
	paths := []run.Touched{{Path: "/work/checkout/a.go", Tool: "Edit"}, {Path: "../outside/c.go", Tool: "file_change"}, {Path: "d.go", Tool: "file_change"}}
	want := &run.Trail{
		Touched: paths,
		Denied:  []run.Denial{{Tool: "Write"}, {Tool: "Bash", Input: `{"command":"rm b.go"}`}, {Tool: "Edit", Input: `{"file_path":"e.go"}`}, {Tool: "Bash", Input: `{"command":"rm b.go"}`}},
	}
	if !reflect.DeepEqual(record.Trail, want) {
		t.Fatalf("trail = %+v", record.Trail)
	}
	if !reflect.DeepEqual(during, &run.Trail{Touched: paths}) {
		t.Fatalf("trail on record while the turn ran = %+v", during)
	}
	if !reflect.DeepEqual(denying, &run.Trail{Touched: paths, Denied: want.Denied[:1]}) {
		t.Fatalf("trail on record once a call was denied = %+v", denying)
	}
	// What `runs show` prints of it is the record: its trail field, which
	// reads back as it was.
	data, err := json.Marshal(record)
	if err != nil {
		t.Fatal(err)
	}
	var printed struct {
		Trail json.RawMessage `json:"trail"`
	}
	if err := json.Unmarshal(data, &printed); err != nil {
		t.Fatal(err)
	}
	if got := string(printed.Trail); got != `{"touched":[{"path":"/work/checkout/a.go","tool":"Edit"},{"path":"../outside/c.go","tool":"file_change"},{"path":"d.go","tool":"file_change"}],`+
		`"denied":[{"tool":"Write"},{"tool":"Bash","input":"{\"command\":\"rm b.go\"}"},{"tool":"Edit","input":"{\"file_path\":\"e.go\"}"},{"tool":"Bash","input":"{\"command\":\"rm b.go\"}"}]}` {
		t.Fatalf("printed %s", got)
	}
	var read run.Record
	if err := json.Unmarshal(data, &read); err != nil || !reflect.DeepEqual(read.Trail, want) {
		t.Fatalf("trail read back = %+v, %v", read.Trail, err)
	}
}

// A denial is on record as soon as reported, with no path written after it
// to carry it there: a turn killed then leaves it.
func TestADenialIsOnRecordAsSoonAsReported(t *testing.T) {
	t.Parallel()
	h := newHarness()
	var during *run.Trail
	h.runner.acting = func(_ context.Context, sink app.EventSink) {
		sink.PermissionDenied(app.PermissionDenial{Tool: "Bash", Input: `{"command":"git push"}`})
		during = written(h)
	}
	record := h.call(t, contract.CallRequest{})

	want := &run.Trail{Denied: []run.Denial{{Tool: "Bash", Input: `{"command":"git push"}`}}}
	if !reflect.DeepEqual(during, want) {
		t.Fatalf("trail on record while the turn ran = %+v", during)
	}
	if !reflect.DeepEqual(record.Trail, want) {
		t.Fatalf("trail = %+v", record.Trail)
	}
}

// A trail that could not be written is written with the next path
// reported, one the trail already holds too: a turn killed then leaves it.
func TestATrailThatCouldNotBeWrittenIsWrittenWithTheNextPath(t *testing.T) {
	t.Parallel()
	h := newHarness()
	failed := false
	h.recorder.updateErr = func(record run.Record) error {
		if record.Trail != nil && !failed {
			failed = true
			return errors.New("disk full")
		}
		return nil
	}
	var first, repeated *run.Trail
	h.runner.acting = func(_ context.Context, sink app.EventSink) {
		sink.ToolStarted(app.ToolCall{ID: "t1", Name: "Edit", Writes: []string{"a.go"}})
		first = written(h)
		sink.ToolStarted(app.ToolCall{ID: "t2", Name: "Write", Writes: []string{"a.go"}})
		repeated = written(h)
	}
	record := h.call(t, contract.CallRequest{})

	want := &run.Trail{Touched: []run.Touched{{Path: "a.go", Tool: "Edit"}}}
	if first != nil {
		t.Fatalf("trail on record after the write that failed = %+v", first)
	}
	if !reflect.DeepEqual(repeated, want) {
		t.Fatalf("trail on record once the path was repeated = %+v", repeated)
	}
	if !reflect.DeepEqual(record.Trail, want) {
		t.Fatalf("trail = %+v", record.Trail)
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

// A repair turn (ADR-002) adds to the call's trail: its paths come after
// the first turn's and its denials with them, on record and in the events,
// in the order the turns reported them around the failed verification run.
func TestARepairTurnAddsToTheTrail(t *testing.T) {
	t.Parallel()
	h := newHarness()
	verifying(h)
	h.commands.exits = []int{1}
	// The repair turn's content was not checked before.
	changingEachTurn(h)
	first, repair := completes(h), completes(h)
	first.act = func(_ context.Context, sink app.EventSink) {
		sink.ToolStarted(app.ToolCall{ID: "t1", Name: "Edit", Writes: []string{"a.go"}})
	}
	repair.act = func(_ context.Context, sink app.EventSink) {
		sink.ToolStarted(app.ToolCall{ID: "t1", Name: "Write", Writes: []string{"b.go"}})
		sink.PermissionDenied(app.PermissionDenial{Tool: "Bash", Input: `{"command":"git push"}`})
	}
	play(h, first, repair)
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Completed || len(record.Attempts) != 2 || len(h.runner.calls()) != 2 {
		t.Fatalf("result = %+v, attempts %+v", record.Result, record.Attempts)
	}
	want := &run.Trail{
		Touched: []run.Touched{{Path: "a.go", Tool: "Edit"}, {Path: "b.go", Tool: "Write"}},
		Denied:  []run.Denial{{Tool: "Bash", Input: `{"command":"git push"}`}},
	}
	if !reflect.DeepEqual(record.Trail, want) {
		t.Fatalf("trail = %+v", record.Trail)
	}
	got := trailOf(h, "TOUCHED", "PERMISSION_DENIED", "VERIFY_FINISHED", "REPAIR_STARTED")
	if len(got) != 6 || !reflect.DeepEqual(got[0], touched("a.go", "Edit", "t1")) || got[1].kind != "VERIFY_FINISHED" || got[2].kind != "REPAIR_STARTED" ||
		!reflect.DeepEqual(got[3], touched("b.go", "Write", "t1")) || !reflect.DeepEqual(got[4], denied("Bash", `{"command":"git push"}`)) || got[5].kind != "VERIFY_FINISHED" {
		t.Fatalf("events = %v", got)
	}
}
