package app_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// staleHarness is a harness whose policy declares the staleness limits
// given, over a clock and timers the test moves; its runtime reports tool
// calls. However the test ends, a turn still blocked is released and the
// call joined: its end does not depend on the limit under test.
func staleHarness(t *testing.T, limits string) (*harness, *timersSpy) {
	t.Helper()
	h := newHarness()
	h.defs.docs[definition.KindPolicy]["pol"] += "stale: {" + limits + "}\n"
	h.runner.identity.ToolCalls = true
	clock := &settableClock{now: fixedClock{}.Now()}
	timers := &timersSpy{t: t, clock: clock}
	h.clock, h.timer = clock, timers.start
	h.calls = h.callsOn(h.defs)
	release := make(chan struct{})
	h.runner.release = release
	t.Cleanup(func() {
		close(release)
		if h.recorder.running() {
			h.recorder.wait(t)
		}
	})
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
	h, timers := staleHarness(t, "no_event: 5m")
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
	h, timers := staleHarness(t, "no_event: 5m")
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
	h, timers := staleHarness(t, "no_event: 5m")
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
	h, _ := staleHarness(t, "repeated_tool_calls: 3")
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

// What a stale turn's evidence quotes of a tool call is bounded on a whole
// character, and the digest beside it is of the whole input.
func TestAStaleTurnsToolCallIsBoundedWithTheDigestOfTheWhole(t *testing.T) {
	h, _ := staleHarness(t, "repeated_tool_calls: 2")
	h.runner.block = true
	// The bound, 300 bytes, falls inside a character.
	input := "a" + strings.Repeat("€", 200)
	h.runner.acting = func(_ context.Context, sink app.EventSink) {
		sink.ToolStarted(app.ToolCall{ID: "t1", Name: "Write", Input: input})
		sink.ToolFinished("t1")
		sink.ToolStarted(app.ToolCall{ID: "t2", Name: "Write", Input: input})
	}
	record := h.call(t, contract.CallRequest{})

	bounded := "a" + strings.Repeat("€", 99) + "…"
	digest := sha256.Sum256([]byte(input))
	want := &run.ToolCall{ID: "t2", Name: "Write", Input: bounded, SHA256: hex.EncodeToString(digest[:])}
	stale := record.Turn.Stale
	if stale == nil || stale.Count != 2 || !reflect.DeepEqual(stale.Tool, want) {
		t.Fatalf("stale = %+v, tool %+v", stale, stale.Tool)
	}
	if !utf8.ValidString(stale.Tool.Input) {
		t.Fatalf("the bounded input is cut inside a character: %q", stale.Tool.Input)
	}
	event, ok := staleEvent(h)
	if !ok || event.Data["input"] != want.Input || event.Data["input_sha256"] != want.SHA256 {
		t.Fatalf("event = %+v, %v", event, ok)
	}
	if message(record) != "stale: no progress, the agent made the same tool call 2 times in a row (stale.repeated_tool_calls): Write "+bounded {
		t.Fatalf("message = %q", message(record))
	}
}

// A turn that panics is no longer watched: its waits are released, and no
// limit is recorded on the finished call when its time comes.
func TestATurnThatPanicsIsNoLongerWatched(t *testing.T) {
	h, timers := staleHarness(t, "no_event: 5m, tool_command: 10m")
	h.runner.acting = func(_ context.Context, sink app.EventSink) {
		sink.ToolStarted(app.ToolCall{ID: "c1", Name: "Bash", Input: `{"command":"make"}`, Command: true})
		panic("the runner exploded")
	}
	record := h.call(t, contract.CallRequest{})
	if record.Result.Status != run.Failed || class(record) != run.ClassInternal || message(record) != "the runner exploded" {
		t.Fatalf("result = %+v", record.Result)
	}
	if len(timers.asked()) == 0 {
		t.Fatal("the turn was not watched")
	}
	timers.released()
	before := h.recorder.kinds()
	timers.advance(11 * time.Minute)
	if after := h.recorder.kinds(); !reflect.DeepEqual(after, before) {
		t.Fatalf("events after the call finished: %v, were %v", after, before)
	}
}

// The watcher passes a turn on to the sink it declares, records the limit
// reached there, and ends the turn by the cancel it was given.
func TestTheWatcherReportsToTheSinkItDeclares(t *testing.T) {
	clock := &settableClock{now: fixedClock{}.Now()}
	timers := &timersSpy{t: t, clock: clock}
	spy := &turnSinkSpy{err: errors.New("not recorded")}
	cancels := 0
	watch := app.WatchTurn(spy, app.CallStale{NoEvent: 5 * time.Minute}, timers.start, clock, func() { cancels++ })
	t.Cleanup(func() {
		watch.End()
		timers.released()
	})

	if err := watch.ProcessStarted("ref-1"); err != spy.err {
		t.Fatalf("ProcessStarted = %v", err)
	}
	watch.Event(run.SourceProtocol, "ASSISTANT", map[string]any{"n": 1})
	watch.Raw("line")
	want := []string{"process ref-1", "event protocol ASSISTANT", "raw line"}
	if got := spy.seen(); !reflect.DeepEqual(got, want) {
		t.Fatalf("passed on %q", got)
	}
	timers.advance(4 * time.Minute)
	if got := spy.seen(); !reflect.DeepEqual(got, want) || cancels != 0 {
		t.Fatalf("before the limit: passed on %q, %d cancels", got, cancels)
	}

	timers.advance(time.Minute)
	if got := spy.seen(); !reflect.DeepEqual(got, append(want, "event agister STALE")) || cancels != 1 {
		t.Fatalf("at the limit: passed on %q, %d cancels", got, cancels)
	}
	stale := watch.End()
	if stale == nil || stale.Limit != run.StaleNoEvent || stale.After != 5*time.Minute {
		t.Fatalf("stale = %+v", stale)
	}
}

// turnSinkSpy is what a turn's watcher reports to: it keeps what it is
// told, in order.
type turnSinkSpy struct {
	mu   sync.Mutex
	told []string
	err  error // what ProcessStarted returns
}

func (s *turnSinkSpy) tell(what string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.told = append(s.told, what)
}

func (s *turnSinkSpy) Event(source, kind string, _ map[string]any) {
	s.tell("event " + source + " " + kind)
}

func (s *turnSinkSpy) Raw(line string) { s.tell("raw " + line) }

func (s *turnSinkSpy) ProcessStarted(ref string) error {
	s.tell("process " + ref)
	return s.err
}

func (s *turnSinkSpy) seen() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.told...)
}

// A command an agent's tool runs for stale.tool_command ends the turn as a
// timeout, naming the command; one that finished in time is not counted.
func TestAToolCommandThatRunsTooLongEndsTheTurn(t *testing.T) {
	h, timers := staleHarness(t, "tool_command: 10m")
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
	h, timers := staleHarness(t, "no_event: 5m")
	h.runner.turn = run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "429")}
	h.runner.acting = func(ctx context.Context, _ app.EventSink) {
		timers.advance(5 * time.Minute)
		select {
		case <-ctx.Done():
		case <-h.runner.release:
		}
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
	timers := &timersSpy{t: t, clock: clock}
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
	h, _ := staleHarness(t, "no_output: 2m")
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
		h, _ := staleHarness(t, limit)
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
		return messages(report.Problems)
	}
	h, _ := staleHarness(t, "no_event: 5m, no_output: 2m, tool_command: 10m, repeated_tool_calls: 5")
	if problems := check(h); len(problems) != 0 {
		t.Fatalf("limits within the timeout: %q", problems)
	}

	h, _ = staleHarness(t, "no_event: 30m")
	if problems := strings.Join(check(h), "\n"); !strings.Contains(problems, "stale.no_event: 30m0s exceeds timeout 20m0s") {
		t.Fatalf("policy above its timeout: %q", problems)
	}

	h, _ = staleHarness(t, "no_event: 15m")
	h.defs.docs[definition.KindProcess]["p"] += "timeout: 10m\n"
	if problems := strings.Join(check(h), "\n"); !strings.Contains(problems, "stale.no_event 15m0s exceeds the timeout 10m0s") {
		t.Fatalf("process timeout below the policy's limit: %q", problems)
	}

	h, _ = staleHarness(t, "no_event: 5m")
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

	h, _ = staleHarness(t, "no_event: 5m, no_output: 2m, tool_command: 10m, repeated_tool_calls: 5")
	h.defs.docs[definition.KindProcess]["p"] += "stale: {no_event: 3m, repeated_tool_calls: 4}\n"
	inspection = app.NewInspection(app.NewResolver(h.defs, struct{ app.ResolverIdentities }{h.runtimes}, h.validator))
	view, err = inspection.ShowProcess(context.Background(), "p", "")
	want := contract.Stale{NoEvent: 3 * time.Minute, NoOutput: 2 * time.Minute, ToolCommand: 10 * time.Minute, RepeatedToolCalls: 4}
	if err != nil || view.Stale != want || view.Refusal != "" {
		t.Fatalf("stale = %+v, refusal %q, %v", view.Stale, view.Refusal, err)
	}
}
