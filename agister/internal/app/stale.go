package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// staleInputChars bounds the tool input a stale turn's evidence quotes.
const staleInputChars = 300

// CallStale are a call's staleness limits: what ends a turn or a
// verification run before its timeout because it stopped moving. A zero one
// is not set and ends nothing.
type CallStale struct {
	NoEvent           time.Duration // an agent turn without a runtime event
	NoOutput          time.Duration // a verification run without output
	ToolCommand       time.Duration // one command an agent's tool runs
	RepeatedToolCalls int           // identical tool calls in a row
}

// CallTimer starts the wait of a staleness limit: the limit is reached when
// the channel it returns delivers, and stop releases it.
type CallTimer func(wait time.Duration) (fired <-chan time.Time, stop func())

// staleClock tells when a turn last moved and when it was found stale.
type staleClock interface{ Now() time.Time }

// turnSink is what a turn's watcher passes the turn's events on to, and
// records the limit reached on.
type turnSink interface {
	Event(source, kind string, data map[string]any)
	Raw(line string)
	ProcessStarted(ref string) error
}

// turnWatch is the sink of one turn. It passes the turn's events on, one at
// a time, and watches them against the call's staleness limits: the first
// limit reached is recorded and ends the turn, by cancelling the context
// the runtime runs under, so the runtime's process group ends as it does on
// any cancellation. Without limits it only passes events on.
type turnWatch struct {
	mu     sync.Mutex
	inner  turnSink
	limits CallStale
	timer  CallTimer
	clock  staleClock
	cancel context.CancelFunc

	// ended is set once the turn returned: nothing is watched after it.
	ended bool
	// stale is the first limit reached.
	stale *run.Stale
	// last is when the runtime's last event came; quiet disarms the wait
	// for the next one.
	last  time.Time
	quiet func()
	// commands disarms the wait of each tool command in flight, by call ID.
	commands map[string]func()
	// repeated is the latest tool call, made count times in a row, the
	// first of them at first.
	repeated ToolCall
	count    int
	first    time.Time
}

// watchTurn returns the sink of a turn that starts now. cancel ends the
// turn's runtime.
func watchTurn(inner turnSink, limits CallStale, timer CallTimer, clock staleClock, cancel context.CancelFunc) *turnWatch {
	w := &turnWatch{inner: inner, limits: limits, timer: timer, clock: clock, cancel: cancel, commands: map[string]func(){}}
	w.mu.Lock()
	defer w.mu.Unlock()
	w.moved()
	return w
}

func (w *turnWatch) Event(source, kind string, data map[string]any) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.inner.Event(source, kind, data)
	// Agister's own observations are not the runtime moving.
	if source != run.SourceAgister {
		w.moved()
	}
}

func (w *turnWatch) Raw(line string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.inner.Raw(line)
	w.moved()
}

func (w *turnWatch) ProcessStarted(ref string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.inner.ProcessStarted(ref)
}

// ToolStarted counts the call against the one before it and, when it runs a
// command, starts the command's wait.
func (w *turnWatch) ToolStarted(call ToolCall) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.ended || w.stale != nil {
		return
	}
	now := w.clock.Now()
	if w.count > 0 && call.Name == w.repeated.Name && call.Input == w.repeated.Input {
		w.count++
	} else {
		w.repeated, w.count, w.first = call, 1, now
	}
	if limit := w.limits.RepeatedToolCalls; limit > 0 && w.count >= limit {
		first := w.first
		w.found(run.Stale{Limit: run.StaleRepeatedToolCalls, Count: w.count, Since: &first, Tool: recordedCall(call)})
		return
	}
	// A call the runtime does not name has no end to wait for.
	if limit := w.limits.ToolCommand; limit > 0 && call.Command && call.ID != "" {
		if disarm, ok := w.commands[call.ID]; ok {
			disarm()
		}
		w.commands[call.ID] = w.arm(limit, func() {
			delete(w.commands, call.ID)
			w.found(run.Stale{Limit: run.StaleToolCommand, After: limit, Since: &now, Tool: recordedCall(call)})
		})
	}
}

func (w *turnWatch) ToolFinished(id string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if disarm, ok := w.commands[id]; ok {
		disarm()
		delete(w.commands, id)
	}
}

// end stops watching once the turn returned and says which limit ended it,
// if one did.
func (w *turnWatch) end() *run.Stale {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.ended = true
	w.disarm()
	return w.stale
}

// moved restarts the wait for the runtime's next event. The caller holds
// the lock.
func (w *turnWatch) moved() {
	limit := w.limits.NoEvent
	if limit <= 0 || w.ended || w.stale != nil {
		return
	}
	if w.quiet != nil {
		w.quiet()
	}
	last := w.clock.Now()
	w.last = last
	w.quiet = w.arm(limit, func() {
		w.quiet = nil
		w.found(run.Stale{Limit: run.StaleNoEvent, After: limit, Since: &last})
	})
}

// arm starts a wait and returns what disarms it; reached runs under the
// lock if the wait passes first. The caller holds the lock, and disarms a
// wait once, under it. The wait's stop is called once nothing more comes of
// it: it was disarmed, or it passed and what it reached is done.
func (w *turnWatch) arm(wait time.Duration, reached func()) (disarm func()) {
	fired, stop := w.timer(wait)
	disarmed := make(chan struct{})
	go func() {
		defer stop()
		select {
		case <-disarmed:
		case <-fired:
			w.mu.Lock()
			defer w.mu.Unlock()
			select {
			case <-disarmed: // while this waited for the lock
			default:
				reached()
			}
		}
	}()
	return func() { close(disarmed) }
}

// found records the first limit reached and ends the turn. The caller holds
// the lock.
func (w *turnWatch) found(stale run.Stale) {
	if w.ended || w.stale != nil {
		return
	}
	stale.At = w.clock.Now()
	w.stale = &stale
	w.disarm()
	data := map[string]any{"limit": stale.Limit, "at": stale.At}
	if stale.After > 0 {
		data["after"] = stale.After.String()
	}
	if stale.Count > 0 {
		data["count"] = stale.Count
	}
	if stale.Since != nil {
		data["since"] = *stale.Since
	}
	if tool := stale.Tool; tool != nil {
		data["tool_use_id"], data["name"], data["input"], data["input_sha256"] = tool.ID, tool.Name, tool.Input, tool.SHA256
	}
	w.inner.Event(run.SourceAgister, "STALE", data)
	w.cancel()
}

// disarm releases every wait still armed. The caller holds the lock.
func (w *turnWatch) disarm() {
	if w.quiet != nil {
		w.quiet()
		w.quiet = nil
	}
	for id, disarm := range w.commands {
		disarm()
		delete(w.commands, id)
	}
}

// recordedCall is a tool call as evidence keeps it: its input bounded, with
// the digest of the whole.
func recordedCall(call ToolCall) *run.ToolCall {
	digest := sha256.Sum256([]byte(call.Input))
	input := call.Input
	if len(input) > staleInputChars {
		cut := staleInputChars
		for cut > 0 && input[cut]&0xC0 == 0x80 { // not inside a rune
			cut--
		}
		input = input[:cut] + "…"
	}
	return &run.ToolCall{ID: call.ID, Name: call.Name, Input: input, SHA256: hex.EncodeToString(digest[:])}
}

// staleFault is the fault of a turn Agister ended at a staleness limit. No
// class is its own: a limit of time is a timeout, and an agent repeating a
// call makes no progress, as a verification that cannot (ADR-002 rule 6).
func staleFault(stale run.Stale) *run.Error {
	tool := ""
	if stale.Tool != nil {
		tool = fmt.Sprintf(": %s %s", stale.Tool.Name, stale.Tool.Input)
	}
	switch stale.Limit {
	case run.StaleRepeatedToolCalls:
		return run.Fault(run.ClassBudgetExhausted, "stale: no progress, the agent made the same tool call %d times in a row (stale.repeated_tool_calls)%s", stale.Count, tool)
	case run.StaleToolCommand:
		return run.Fault(run.ClassTimeout, "stale: a tool's command ran for %s (stale.tool_command)%s", stale.After, tool)
	}
	return run.Fault(run.ClassTimeout, "stale: the runtime reported no event for %s (stale.no_event)", stale.After)
}
