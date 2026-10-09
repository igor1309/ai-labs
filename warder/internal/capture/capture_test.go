package capture_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/warder/internal/capture"
)

// readerStub records the context of every ReadAgents and answers each with
// what the test set: agents, an error, or both. It returns the slice it
// was given, not a copy. Like a cancellable read it answers a context that
// is done with that context's error. It fills in nothing else.
type readerStub struct {
	agents []capture.Agent
	err    error
	calls  []context.Context
}

func (s *readerStub) ReadAgents(ctx context.Context) ([]capture.Agent, error) {
	s.calls = append(s.calls, ctx)
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return s.agents, s.err
}

// clockStub is a fixed clock: every Now is the time the test set. It
// counts its readings and fills in nothing else.
type clockStub struct {
	now      time.Time
	readings int
}

func (s *clockStub) Now() time.Time {
	s.readings++
	return s.now
}

// readAt is the time the tests' clocks are set to, unless they say
// otherwise.
func readAt() time.Time { return time.Date(2026, 10, 9, 8, 28, 10, 0, time.UTC) }

func newCapturer(t *testing.T, source string, reader capture.AgentReader, clock capture.Clock) *capture.Capturer {
	t.Helper()
	capturer, err := capture.New(source, reader, clock)
	if err != nil {
		t.Fatal(err)
	}
	return capturer
}

// assertNoObservation fails unless the capture failed with no observation
// and without reading the clock.
func assertNoObservation(t *testing.T, observation capture.Observation, err error, clock *clockStub) {
	t.Helper()
	if err == nil {
		t.Fatalf("Capture returned no error, and the observation %+v", observation)
	}
	if observation.Source != "" || !observation.ObservedAt.IsZero() || observation.Agents != nil {
		t.Errorf("Capture returned the observation %+v with its error", observation)
	}
	if clock.readings != 0 {
		t.Errorf("the clock was read %d times, want 0", clock.readings)
	}
}

// readFunc is a reader made of a function, so a nil one is a typed nil.
type readFunc func(ctx context.Context) ([]capture.Agent, error)

func (f readFunc) ReadAgents(ctx context.Context) ([]capture.Agent, error) { return f(ctx) }

// readMap, readSlice and readChan are readers of the other kinds whose nil
// is a typed nil.
type readMap map[string]string

func (m readMap) ReadAgents(context.Context) ([]capture.Agent, error) { return nil, nil }

type readSlice []capture.Agent

func (s readSlice) ReadAgents(context.Context) ([]capture.Agent, error) { return nil, nil }

type readChan chan capture.Agent

func (c readChan) ReadAgents(context.Context) ([]capture.Agent, error) { return nil, nil }

// nowFunc is a clock made of a function, so a nil one is a typed nil.
type nowFunc func() time.Time

func (f nowFunc) Now() time.Time { return f() }

// nowMap, nowSlice and nowChan are clocks of the other kinds whose nil is
// a typed nil.
type nowMap map[string]time.Time

func (m nowMap) Now() time.Time { return time.Time{} }

type nowSlice []time.Time

func (s nowSlice) Now() time.Time { return time.Time{} }

type nowChan chan time.Time

func (c nowChan) Now() time.Time { return time.Time{} }

// assertNotConstructed fails unless New failed, with an error that names
// what is missing and no capturer.
func assertNotConstructed(t *testing.T, capturer *capture.Capturer, err error, missing string) {
	t.Helper()
	if err == nil {
		t.Fatal("New returned no error")
	}
	if !strings.Contains(err.Error(), missing) {
		t.Errorf("got the error %q, want one that says %q", err, missing)
	}
	if capturer != nil {
		t.Errorf("New returned a capturer: %v", capturer)
	}
}

// An empty source ID fails at construction.
func TestNewRejectsAnEmptySource(t *testing.T) {
	t.Parallel()

	capturer, err := capture.New("", &readerStub{}, &clockStub{now: readAt()})

	assertNotConstructed(t, capturer, err, "no source ID")
}

// A missing reader, nil or a typed nil carried by AgentReader, fails at
// construction.
func TestNewRejectsAMissingReader(t *testing.T) {
	t.Parallel()
	for name, reader := range map[string]capture.AgentReader{
		"nil":           nil,
		"nil pointer":   (*readerStub)(nil),
		"nil read func": readFunc(nil),
		"nil map":       readMap(nil),
		"nil slice":     readSlice(nil),
		"nil chan":      readChan(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			capturer, err := capture.New("claude-main", reader, &clockStub{now: readAt()})

			assertNotConstructed(t, capturer, err, "no agent reader")
		})
	}
}

// A missing clock, nil or a typed nil carried by Clock, fails at
// construction.
func TestNewRejectsAMissingClock(t *testing.T) {
	t.Parallel()
	for name, clock := range map[string]capture.Clock{
		"nil":          nil,
		"nil pointer":  (*clockStub)(nil),
		"nil now func": nowFunc(nil),
		"nil map":      nowMap(nil),
		"nil slice":    nowSlice(nil),
		"nil chan":     nowChan(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			capturer, err := capture.New("claude-main", &readerStub{}, clock)

			assertNotConstructed(t, capturer, err, "no clock")
		})
	}
}

// A capture is one read, under the context the capture was given.
func TestCaptureReadsOnceUnderItsContext(t *testing.T) {
	t.Parallel()
	reader := &readerStub{}
	capturer := newCapturer(t, "claude-main", reader, &clockStub{now: readAt()})
	type captureKey struct{}
	ctx := context.WithValue(t.Context(), captureKey{}, "this capture")

	if _, err := capturer.Capture(ctx); err != nil {
		t.Fatal(err)
	}

	if len(reader.calls) != 1 {
		t.Fatalf("got %d reads, want 1", len(reader.calls))
	}
	if reader.calls[0] != ctx {
		t.Errorf("read under the context %v, want the capture's %v", reader.calls[0], ctx)
	}
}

// A successful capture is the configured source, the agents as read, in
// their order, and the clock's time. The states are the contract's literal
// values, not the package's constants, so a constant whose value changes
// fails here. IDs are opaque: those that differ only in case or spaces are
// different agents.
func TestCaptureReturnsTheSourceTheAgentsAsReadAndTheClocksTime(t *testing.T) {
	t.Parallel()
	reader := &readerStub{agents: []capture.Agent{
		{ID: "agent-2", State: "working"},
		{ID: "agent-1", State: "idle"},
		{ID: "agent-3", State: "unknown"},
		{ID: "Agent-1", State: "idle"},
		{ID: " agent-1", State: "working"},
	}}
	clock := &clockStub{now: readAt()}
	capturer := newCapturer(t, "claude-main", reader, clock)

	observation, err := capturer.Capture(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if observation.Source != "claude-main" {
		t.Errorf("got the source %q, want claude-main", observation.Source)
	}
	want := []capture.Agent{
		{ID: "agent-2", State: "working"},
		{ID: "agent-1", State: "idle"},
		{ID: "agent-3", State: "unknown"},
		{ID: "Agent-1", State: "idle"},
		{ID: " agent-1", State: "working"},
	}
	if !slices.Equal(observation.Agents, want) {
		t.Errorf("got the agents %v, want %v", observation.Agents, want)
	}
	if !observation.ObservedAt.Equal(readAt()) {
		t.Errorf("got observedAt %v, want %v", observation.ObservedAt, readAt())
	}
}

// ObservedAt is the clock's time in UTC, whatever zone the clock tells it
// in.
func TestCaptureTakesObservedAtInUTC(t *testing.T) {
	t.Parallel()
	moscow := time.FixedZone("MSK", 3*60*60)
	clock := &clockStub{now: time.Date(2026, 10, 9, 11, 28, 10, 0, moscow)}
	capturer := newCapturer(t, "claude-main", &readerStub{}, clock)

	observation, err := capturer.Capture(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if location := observation.ObservedAt.Location(); location != time.UTC {
		t.Errorf("got observedAt in %v, want UTC", location)
	}
	if got := observation.ObservedAt.Format(time.RFC3339); got != "2026-10-09T08:28:10Z" {
		t.Errorf("got observedAt %s, want 2026-10-09T08:28:10Z", got)
	}
}

// The clock is read once, after the read returned: observedAt is when the
// complete read succeeded, not when the capture began.
func TestCaptureReadsTheClockOnceAfterTheRead(t *testing.T) {
	t.Parallel()
	var calls []string
	reader := readFunc(func(context.Context) ([]capture.Agent, error) {
		calls = append(calls, "read")
		return []capture.Agent{{ID: "agent-1", State: "working"}}, nil
	})
	clock := nowFunc(func() time.Time {
		calls = append(calls, "now")
		return readAt()
	})
	capturer := newCapturer(t, "claude-main", reader, clock)

	if _, err := capturer.Capture(t.Context()); err != nil {
		t.Fatal(err)
	}

	if want := []string{"read", "now"}; !slices.Equal(calls, want) {
		t.Errorf("got the calls %v, want %v", calls, want)
	}
}

// Each capture is a read and a clock reading of its own: nothing of an
// earlier one is kept.
func TestEachCaptureReadsAgain(t *testing.T) {
	t.Parallel()
	reader := &readerStub{agents: []capture.Agent{{ID: "agent-1", State: "working"}}}
	clock := &clockStub{now: readAt()}
	capturer := newCapturer(t, "claude-main", reader, clock)

	if _, err := capturer.Capture(t.Context()); err != nil {
		t.Fatal(err)
	}
	later := readAt().Add(5 * time.Second)
	reader.agents = []capture.Agent{{ID: "agent-2", State: "idle"}}
	clock.now = later
	observation, err := capturer.Capture(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	if want := []capture.Agent{{ID: "agent-2", State: "idle"}}; !slices.Equal(observation.Agents, want) {
		t.Errorf("got the agents %v, want %v", observation.Agents, want)
	}
	if !observation.ObservedAt.Equal(later) {
		t.Errorf("got observedAt %v, want %v", observation.ObservedAt, later)
	}
	if len(reader.calls) != 2 || clock.readings != 2 {
		t.Errorf("got %d reads and %d clock readings, want 2 of each", len(reader.calls), clock.readings)
	}
}

// A reader error fails the capture with an error that wraps it and no
// observation, whatever agents came with it, and the clock is not read.
func TestAReaderErrorFailsTheCapture(t *testing.T) {
	t.Parallel()
	errRuntime := errors.New("runtime unreachable")
	for name, agents := range map[string][]capture.Agent{
		"alone":       nil,
		"with agents": {{ID: "agent-1", State: "working"}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			reader := &readerStub{agents: agents, err: errRuntime}
			clock := &clockStub{now: readAt()}
			capturer := newCapturer(t, "claude-main", reader, clock)

			observation, err := capturer.Capture(t.Context())

			assertNoObservation(t, observation, err, clock)
			if !errors.Is(err, errRuntime) {
				t.Errorf("got the error %v, want one that wraps %v", err, errRuntime)
			}
			if len(reader.calls) != 1 {
				t.Errorf("got %d reads, want 1", len(reader.calls))
			}
		})
	}
}

// A capture under a cancelled context still reads once, under it, and
// fails with an error that wraps the context's.
func TestACancelledContextFailsTheCapture(t *testing.T) {
	t.Parallel()
	reader := &readerStub{agents: []capture.Agent{{ID: "agent-1", State: "working"}}}
	clock := &clockStub{now: readAt()}
	capturer := newCapturer(t, "claude-main", reader, clock)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	observation, err := capturer.Capture(ctx)

	assertNoObservation(t, observation, err, clock)
	if !errors.Is(err, context.Canceled) {
		t.Errorf("got the error %v, want one that wraps %v", err, context.Canceled)
	}
	if len(reader.calls) != 1 || reader.calls[0] != ctx {
		t.Errorf("got the reads %v, want one under the capture's context", reader.calls)
	}
}

// A read outside the common model is invalid as a whole: an empty ID, an
// ID two agents share, or a state that is not one of the contract's three.
// The error says why and names the agent by its index, there is no
// observation, and the clock is not read.
func TestAReadOutsideTheCommonModelFailsTheCapture(t *testing.T) {
	t.Parallel()
	for name, test := range map[string]struct {
		agents []capture.Agent
		why    string
	}{
		"an empty ID": {
			[]capture.Agent{{ID: "", State: "working"}},
			"agent 0 has an empty ID",
		},
		"an empty ID after valid agents": {
			[]capture.Agent{{ID: "agent-1", State: "working"}, {ID: "agent-2", State: "idle"}, {ID: "", State: "idle"}},
			"agent 2 has an empty ID",
		},
		"a shared ID": {
			[]capture.Agent{{ID: "agent-1", State: "working"}, {ID: "agent-1", State: "working"}},
			`agents 0 and 1 share the ID "agent-1"`,
		},
		"a shared ID apart, in different states": {
			[]capture.Agent{{ID: "agent-1", State: "working"}, {ID: "agent-2", State: "idle"}, {ID: "agent-3", State: "unknown"}, {ID: "agent-2", State: "working"}},
			`agents 1 and 3 share the ID "agent-2"`,
		},
		"an empty state": {
			[]capture.Agent{{ID: "agent-1", State: ""}},
			`agent 0 has the state "", not working, idle or unknown`,
		},
		"another state": {
			[]capture.Agent{{ID: "agent-1", State: "idle"}, {ID: "agent-2", State: "blocked"}},
			`agent 1 has the state "blocked", not working, idle or unknown`,
		},
		"a state in another case": {
			[]capture.Agent{{ID: "agent-1", State: "Working"}},
			`agent 0 has the state "Working", not working, idle or unknown`,
		},
		"a state with a space": {
			[]capture.Agent{{ID: "agent-1", State: "idle "}},
			`agent 0 has the state "idle ", not working, idle or unknown`,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			reader := &readerStub{agents: test.agents}
			clock := &clockStub{now: readAt()}
			capturer := newCapturer(t, "claude-main", reader, clock)

			observation, err := capturer.Capture(t.Context())

			assertNoObservation(t, observation, err, clock)
			if !strings.Contains(err.Error(), test.why) {
				t.Errorf("got the error %q, want one that says %q", err, test.why)
			}
		})
	}
}

// A read of no agents, nil or empty, is a successful observation whose
// agent set is empty and not nil.
func TestAReadOfNoAgentsIsAnEmptyObservation(t *testing.T) {
	t.Parallel()
	for name, agents := range map[string][]capture.Agent{
		"nil":   nil,
		"empty": {},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			capturer := newCapturer(t, "claude-main", &readerStub{agents: agents}, &clockStub{now: readAt()})

			observation, err := capturer.Capture(t.Context())
			if err != nil {
				t.Fatal(err)
			}

			if observation.Agents == nil {
				t.Error("got nil agents, want an empty set")
			}
			if len(observation.Agents) != 0 {
				t.Errorf("got the agents %v, want none", observation.Agents)
			}
			if observation.Source != "claude-main" {
				t.Errorf("got the source %q, want claude-main", observation.Source)
			}
			if !observation.ObservedAt.Equal(readAt()) {
				t.Errorf("got observedAt %v, want %v", observation.ObservedAt, readAt())
			}
		})
	}
}

// The observation's agents are its own: a change to the reader's slice
// after the capture does not reach them, nor a change to them the
// reader's.
func TestTheObservationDoesNotAliasTheReadersSlice(t *testing.T) {
	t.Parallel()
	read := []capture.Agent{
		{ID: "agent-1", State: "working"},
		{ID: "agent-2", State: "idle"},
	}
	capturer := newCapturer(t, "claude-main", &readerStub{agents: read}, &clockStub{now: readAt()})

	observation, err := capturer.Capture(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	read[0] = capture.Agent{ID: "changed-by-the-reader", State: "unknown"}
	afterTheReader := slices.Clone(observation.Agents)
	observation.Agents[1] = capture.Agent{ID: "changed-by-the-caller", State: "unknown"}

	if want := []capture.Agent{{ID: "agent-1", State: "working"}, {ID: "agent-2", State: "idle"}}; !slices.Equal(afterTheReader, want) {
		t.Errorf("after the reader changed its slice, got the agents %v, want %v", afterTheReader, want)
	}
	if want := (capture.Agent{ID: "agent-2", State: "idle"}); read[1] != want {
		t.Errorf("after the caller changed the observation, the reader's slice has %v, want %v", read[1], want)
	}
}
