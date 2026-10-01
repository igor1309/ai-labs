package app_test

import (
	"context"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// staleHarness is a harness whose policy declares the staleness limits
// given, over a clock and timers the test moves; its runtime reports tool
// calls.
func staleHarness(limits string) (*harness, *timersSpy) {
	h := newHarness()
	h.defs.docs[definition.KindPolicy]["pol"] += "stale: {" + limits + "}\n"
	h.runner.identity.ToolCalls = true
	clock := &settableClock{now: fixedClock{}.Now()}
	timers := &timersSpy{clock: clock}
	h.clock, h.timer = clock, timers.start
	h.calls = h.callsOn(h.defs)
	return h, timers
}

// staleEvent is the STALE event the call recorded, if any.
func staleEvent(h *harness) (run.Event, bool) {
	h.recorder.mu.Lock()
	defer h.recorder.mu.Unlock()
	for _, event := range h.recorder.events {
		if event.Kind == "STALE" {
			return event, true
		}
	}
	return run.Event{}, false
}

// A turn whose runtime reports no event for stale.no_event ends before the
// call's timeout as a timeout, and its evidence says what went stale and
// when.
func TestATurnWithoutEventsEndsBeforeItsTimeout(t *testing.T) {
	h, timers := staleHarness("no_event: 5m")
	h.runner.block = true
	start := fixedClock{}.Now()
	h.runner.acting = func(context.Context, app.EventSink) { timers.advance(6 * time.Minute) }
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Interrupted || class(record) != run.ClassTimeout ||
		message(record) != "stale: the runtime reported no event for 5m0s (stale.no_event)" {
		t.Fatalf("result = %+v", record.Result)
	}
	at := start.Add(6 * time.Minute)
	want := &run.Stale{Limit: run.StaleNoEvent, After: 5 * time.Minute, Since: &start, At: at}
	if !reflect.DeepEqual(record.Turn.Stale, want) {
		t.Fatalf("stale = %+v", record.Turn.Stale)
	}
	if elapsed := at.Sub(record.CreatedAt); elapsed >= record.Effective.Timeout {
		t.Fatalf("ended after %s, the timeout is %s", elapsed, record.Effective.Timeout)
	}
	event, ok := staleEvent(h)
	if !ok || event.Source != run.SourceAgister || event.Data["limit"] != run.StaleNoEvent || event.Data["after"] != "5m0s" {
		t.Fatalf("event = %+v, %v", event, ok)
	}
	if want := (&run.StaleLimits{NoEvent: 5 * time.Minute}); !reflect.DeepEqual(record.Effective.Stale, want) {
		t.Fatalf("effective stale = %+v", record.Effective.Stale)
	}
}

// A long turn whose events keep arriving is live: it runs past the limit
// many times over and is not ended.
func TestALongLiveTurnIsNotEndedEarly(t *testing.T) {
	h, timers := staleHarness("no_event: 5m")
	var cancelled error
	h.runner.acting = func(ctx context.Context, sink app.EventSink) {
		for i := 0; i < 4; i++ {
			timers.advance(4 * time.Minute)
			if i%2 == 0 {
				sink.Event(run.SourceProtocol, "ASSISTANT", nil)
			} else {
				sink.Raw(`{"type":"assistant"}`)
			}
		}
		cancelled = ctx.Err()
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed || record.Turn.Stale != nil || cancelled != nil {
		t.Fatalf("result = %+v, stale %+v, turn context %v", record.Result, record.Turn.Stale, cancelled)
	}
	if _, ok := staleEvent(h); ok {
		t.Fatalf("events = %v", h.recorder.kinds())
	}
}

// Agister's own events are not the runtime moving: they do not restart the
// wait.
func TestAgistersOwnEventsDoNotKeepATurnLive(t *testing.T) {
	h, timers := staleHarness("no_event: 5m")
	h.runner.block = true
	h.runner.acting = func(_ context.Context, sink app.EventSink) {
		timers.advance(4 * time.Minute)
		sink.Event(run.SourceAgister, "NOTE", nil)
		timers.advance(4 * time.Minute)
	}
	record := h.call(t, contract.CallRequest{})
	if class(record) != run.ClassTimeout || record.Turn.Stale == nil || record.Turn.Stale.Limit != run.StaleNoEvent {
		t.Fatalf("result = %+v, stale %+v", record.Result, record.Turn.Stale)
	}
}

// The same tool call made stale.repeated_tool_calls times in a row ends the
// turn as no progress, with the repeated call on record; a different call
// in between starts the count again.
func TestARepeatedIdenticalToolCallEndsTheTurn(t *testing.T) {
	h, _ := staleHarness("repeated_tool_calls: 3")
	h.runner.block = true
	same := app.ToolCall{Name: "Bash", Input: `{"command":"go test ./..."}`, Command: true}
	h.runner.acting = func(ctx context.Context, sink app.EventSink) {
		call := func(id string, call app.ToolCall) {
			call.ID = id
			sink.ToolStarted(call)
			sink.ToolFinished(id)
		}
		call("t1", same)
		call("t2", same)
		call("t3", app.ToolCall{Name: "Read", Input: `{"file_path":"a.go"}`})
		if ctx.Err() != nil {
			t.Error("ended before the call was repeated 3 times in a row")
		}
		call("t4", same)
		call("t5", same)
		call("t6", same)
	}
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Failed || class(record) != run.ClassBudgetExhausted ||
		message(record) != `stale: no progress, the agent made the same tool call 3 times in a row (stale.repeated_tool_calls): Bash {"command":"go test ./..."}` {
		t.Fatalf("result = %+v", record.Result)
	}
	stale := record.Turn.Stale
	if stale == nil || stale.Limit != run.StaleRepeatedToolCalls || stale.Count != 3 || stale.Tool == nil ||
		stale.Tool.ID != "t6" || stale.Tool.Name != "Bash" || stale.Tool.Input != same.Input || len(stale.Tool.SHA256) != 64 {
		t.Fatalf("stale = %+v", stale)
	}
	event, ok := staleEvent(h)
	if !ok || event.Data["name"] != "Bash" || event.Data["input"] != same.Input || event.Data["count"] != 3 {
		t.Fatalf("event = %+v, %v", event, ok)
	}
}

// A command an agent's tool runs for stale.tool_command ends the turn as a
// timeout, naming the command; one that finished in time is not counted.
func TestAToolCommandThatRunsTooLongEndsTheTurn(t *testing.T) {
	h, timers := staleHarness("tool_command: 10m")
	h.runner.block = true
	start := fixedClock{}.Now()
	h.runner.acting = func(ctx context.Context, sink app.EventSink) {
		sink.ToolStarted(app.ToolCall{ID: "c1", Name: "Bash", Input: `{"command":"make"}`, Command: true})
		timers.advance(9 * time.Minute)
		sink.ToolFinished("c1")
		// A tool that runs no command is not bounded by the limit.
		sink.ToolStarted(app.ToolCall{ID: "r1", Name: "Read", Input: `{"file_path":"a.go"}`})
		sink.ToolStarted(app.ToolCall{ID: "c2", Name: "Bash", Input: `{"command":"tail -f log"}`, Command: true})
		timers.advance(9 * time.Minute)
		if ctx.Err() != nil {
			t.Error("ended by a command that finished, or a tool that runs none")
		}
		timers.advance(time.Minute)
	}
	record := h.call(t, contract.CallRequest{})

	if record.Result.Status != run.Interrupted || class(record) != run.ClassTimeout ||
		message(record) != `stale: a tool's command ran for 10m0s (stale.tool_command): Bash {"command":"tail -f log"}` {
		t.Fatalf("result = %+v", record.Result)
	}
	stale, since := record.Turn.Stale, start.Add(9*time.Minute)
	if stale == nil || stale.Limit != run.StaleToolCommand || stale.After != 10*time.Minute || stale.Tool == nil || stale.Tool.ID != "c2" ||
		stale.Since == nil || !stale.Since.Equal(since) || !stale.At.Equal(since.Add(10*time.Minute)) {
		t.Fatalf("stale = %+v", stale)
	}
}

// What the runtime itself reported of a turn ended as stale is never
// replaced; the evidence still says the limit was reached.
func TestAStaleTurnsOwnFailureIsNotReplaced(t *testing.T) {
	h, timers := staleHarness("no_event: 5m")
	h.runner.turn = run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "429")}
	h.runner.acting = func(ctx context.Context, _ app.EventSink) {
		timers.advance(5 * time.Minute)
		<-ctx.Done()
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Failed || class(record) != run.ClassRateLimited || record.Turn.Stale == nil {
		t.Fatalf("result = %+v, stale %+v", record.Result, record.Turn.Stale)
	}
}

// A policy without staleness limits starts no wait and records none.
func TestWithoutStalenessLimitsNothingIsWatched(t *testing.T) {
	h := newHarness()
	clock := &settableClock{now: fixedClock{}.Now()}
	timers := &timersSpy{clock: clock}
	h.clock, h.timer = clock, timers.start
	h.calls = h.callsOn(h.defs)
	verifying(h)
	h.runner.acting = func(_ context.Context, sink app.EventSink) {
		for i := 0; i < 5; i++ {
			sink.ToolStarted(app.ToolCall{ID: "t", Name: "Bash", Input: "{}", Command: true})
		}
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Completed || record.Turn.Stale != nil || record.Effective.Stale != nil || len(timers.asked()) != 0 {
		t.Fatalf("result = %+v, stale %+v, effective %+v, waits %v", record.Result, record.Turn.Stale, record.Effective.Stale, timers.asked())
	}
	if runs := h.commands.runs(); len(runs) != 1 || runs[0].NoOutput != 0 {
		t.Fatalf("command runs = %+v", runs)
	}
}

// A verification run that produces no output for stale.no_output is ended
// by its runner before verify.timeout; the call ends as a timeout and the
// attempt's run records the cause.
func TestAVerificationRunWithoutOutputEndsTheCall(t *testing.T) {
	h, _ := staleHarness("no_output: 2m")
	verifying(h)
	h.commands.stale = true
	record := h.call(t, contract.CallRequest{})

	if runs := h.commands.runs(); len(runs) != 1 || runs[0].NoOutput != 2*time.Minute || runs[0].Timeout != 10*time.Minute {
		t.Fatalf("command runs = %+v", runs)
	}
	if record.Result.Status != run.Interrupted || class(record) != run.ClassTimeout ||
		message(record) != "stale: attempt 1's run produced no output for 2m0s (stale.no_output)" {
		t.Fatalf("result = %+v", record.Result)
	}
	if len(record.Attempts) != 1 || record.Attempts[0].Run == nil {
		t.Fatalf("attempts = %+v", record.Attempts)
	}
	ran := record.Attempts[0].Run
	if ran.Passed || ran.Stale == nil || ran.Stale.Limit != run.StaleNoOutput || ran.Stale.After != 2*time.Minute || ran.Stale.At.IsZero() {
		t.Fatalf("run = %+v, stale %+v", ran, ran.Stale)
	}
	if len(h.runner.calls()) != 1 {
		t.Fatalf("a stale run was repaired: %d turns", len(h.runner.calls()))
	}
}

// A limit on tool calls needs a runtime that reports them: without one the
// call is refused before any effect, and check says so when it probes.
func TestToolCallLimitsNeedARuntimeThatReportsThem(t *testing.T) {
	for limit, want := range map[string]string{
		"tool_command: 10m":      "runtime rt does not report tool calls, so it cannot enforce stale.tool_command 10m0s",
		"repeated_tool_calls: 3": "runtime rt does not report tool calls, so it cannot enforce stale.repeated_tool_calls 3",
	} {
		h, _ := staleHarness(limit)
		h.runner.identity.ToolCalls = false
		record := h.call(t, contract.CallRequest{})
		if record.Result.Status != run.Failed || class(record) != run.ClassRefused || !strings.Contains(message(record), want) {
			t.Fatalf("%s: result %+v", limit, record.Result)
		}
		if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 {
			t.Fatalf("%s: turns %d, checkouts %v after the refusal", limit, len(h.runner.calls()), h.workspaces.checkouts)
		}
	}
}

// check rejects a staleness limit above the timeout, in the policy that
// declares both and in a process that narrows its policy's timeout.
func TestCheckRejectsAStalenessLimitAboveTheTimeout(t *testing.T) {
	check := func(h *harness) []string {
		t.Helper()
		checker := app.NewChecker(h.defs, h.validator, h.runtimes, []string{"git.revision", "git.diff"})
		report, err := checker.Check(context.Background(), false)
		if err != nil {
			t.Fatal(err)
		}
		return report.Problems
	}
	h, _ := staleHarness("no_event: 5m, no_output: 2m, tool_command: 10m, repeated_tool_calls: 5")
	if problems := check(h); len(problems) != 0 {
		t.Fatalf("limits within the timeout: %q", problems)
	}

	h, _ = staleHarness("no_event: 30m")
	if problems := strings.Join(check(h), "\n"); !strings.Contains(problems, "stale.no_event: 30m0s exceeds timeout 20m0s") {
		t.Fatalf("policy above its timeout: %q", problems)
	}

	h, _ = staleHarness("no_event: 15m")
	h.defs.docs[definition.KindProcess]["p"] += "timeout: 10m\n"
	if problems := strings.Join(check(h), "\n"); !strings.Contains(problems, "stale.no_event 15m0s exceeds the timeout 10m0s") {
		t.Fatalf("process timeout below the policy's limit: %q", problems)
	}

	h, _ = staleHarness("no_event: 5m")
	h.defs.docs[definition.KindProcess]["p"] += "stale: {no_event: 6m}\n"
	if problems := strings.Join(check(h), "\n"); !strings.Contains(problems, "stale.no_event: 6m0s widens the policy's 5m0s") {
		t.Fatalf("process widening its policy's limit: %q", problems)
	}
}

// process show shows the effective limits: the policy's, narrowed by the
// process.
func TestShowProcessShowsTheEffectiveStalenessLimits(t *testing.T) {
	h := newHarness()
	inspection := app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator))
	view, err := inspection.ShowProcess(context.Background(), "p", "")
	if err != nil || view.Stale != (contract.Stale{}) {
		t.Fatalf("without limits: %+v, %v", view.Stale, err)
	}

	h, _ = staleHarness("no_event: 5m, no_output: 2m, tool_command: 10m, repeated_tool_calls: 5")
	h.defs.docs[definition.KindProcess]["p"] += "stale: {no_event: 3m, repeated_tool_calls: 4}\n"
	inspection = app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator))
	view, err = inspection.ShowProcess(context.Background(), "p", "")
	want := contract.Stale{NoEvent: 3 * time.Minute, NoOutput: 2 * time.Minute, ToolCommand: 10 * time.Minute, RepeatedToolCalls: 4}
	if err != nil || view.Stale != want || view.Refusal != "" {
		t.Fatalf("stale = %+v, refusal %q, %v", view.Stale, view.Refusal, err)
	}
}
