package jsonl_test

import (
	"errors"
	"fmt"
	"io"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/warder/jsonl"
)

// writerSpy records every Write and answers each with what the test set:
// a short count or an error. It fills in nothing else.
type writerSpy struct {
	writes [][]byte
	short  int
	err    error
}

func (s *writerSpy) Write(p []byte) (int, error) {
	s.writes = append(s.writes, append([]byte(nil), p...))
	return len(p) - s.short, s.err
}

func newPublisher(t *testing.T, writer jsonl.RecordWriter) *jsonl.Publisher {
	t.Helper()
	publisher, err := jsonl.New(writer)
	if err != nil {
		t.Fatal(err)
	}
	return publisher
}

func writtenLines(spy *writerSpy) []string {
	lines := make([]string, len(spy.writes))
	for i, write := range spy.writes {
		lines[i] = string(write)
	}
	return lines
}

func assertLines(t *testing.T, spy *writerSpy, want ...string) {
	t.Helper()
	got := writtenLines(spy)
	if len(got) != len(want) {
		t.Fatalf("got %d writes %q, want %d %q", len(got), got, len(want), want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("write %d:\n got %q\nwant %q", i, got[i], want[i])
		}
	}
}

// writeFunc is a writer made of a function, so a nil one is a typed nil.
type writeFunc func(p []byte) (int, error)

func (f writeFunc) Write(p []byte) (int, error) { return f(p) }

// A missing writer, nil or a typed nil carried by RecordWriter, fails at
// construction.
func TestNewRejectsAMissingWriter(t *testing.T) {
	t.Parallel()
	for name, writer := range map[string]jsonl.RecordWriter{
		"nil":            nil,
		"nil pointer":    (*writerSpy)(nil),
		"nil write func": writeFunc(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			publisher, err := jsonl.New(writer)
			if err == nil {
				t.Fatal("New returned no error")
			}
			if publisher != nil {
				t.Errorf("New returned a publisher: %v", publisher)
			}
		})
	}
}

// Each Publish is one Write of one complete record, the contract's fields
// in its order, ending in a newline.
func TestPublishWritesEachObservationAsOneLineInOneWrite(t *testing.T) {
	t.Parallel()
	spy := &writerSpy{}
	publisher := newPublisher(t, spy)

	err := publisher.Publish(jsonl.Observation{
		Source:     "claude-main",
		ObservedAt: time.Date(2026, 10, 9, 8, 28, 10, 0, time.UTC),
		Agents: []jsonl.Agent{
			{ID: "agent-1", State: "working"},
			{ID: "agent-2", State: "idle"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	err = publisher.Publish(jsonl.Observation{
		Source:     "codex",
		ObservedAt: time.Date(2026, 10, 9, 8, 28, 15, 0, time.UTC),
		Agents:     []jsonl.Agent{{ID: "agent-3", State: "unknown"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	assertLines(t, spy,
		`{"source":"claude-main","observedAt":"2026-10-09T08:28:10Z","agents":[{"id":"agent-1","state":"working"},{"id":"agent-2","state":"idle"}]}`+"\n",
		`{"source":"codex","observedAt":"2026-10-09T08:28:15Z","agents":[{"id":"agent-3","state":"unknown"}]}`+"\n",
	)
}

// observedAt is the UTC RFC 3339 form of the given time, whatever its zone.
func TestPublishWritesObservedAtInUTC(t *testing.T) {
	t.Parallel()
	spy := &writerSpy{}
	publisher := newPublisher(t, spy)
	moscow := time.FixedZone("MSK", 3*60*60)

	err := publisher.Publish(jsonl.Observation{
		Source:     "claude-main",
		ObservedAt: time.Date(2026, 10, 9, 11, 28, 10, 0, moscow),
		Agents:     []jsonl.Agent{{ID: "agent-1", State: "idle"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	assertLines(t, spy,
		`{"source":"claude-main","observedAt":"2026-10-09T08:28:10Z","agents":[{"id":"agent-1","state":"idle"}]}`+"\n",
	)
}

// An observation with no agents, nil or empty, is written with an empty
// array, never null.
func TestPublishWritesNoAgentsAsAnEmptyArray(t *testing.T) {
	t.Parallel()
	for name, agents := range map[string][]jsonl.Agent{
		"nil":   nil,
		"empty": {},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			spy := &writerSpy{}
			publisher := newPublisher(t, spy)

			err := publisher.Publish(jsonl.Observation{
				Source:     "claude-main",
				ObservedAt: time.Date(2026, 10, 9, 8, 28, 10, 0, time.UTC),
				Agents:     agents,
			})
			if err != nil {
				t.Fatal(err)
			}

			assertLines(t, spy,
				`{"source":"claude-main","observedAt":"2026-10-09T08:28:10Z","agents":[]}`+"\n",
			)
		})
	}
}

// overlapSpy detects a Write that starts while another is in progress.
// It records writes without a lock of its own, so under -race a publisher
// that lets writes overlap also fails as a data race.
type overlapSpy struct {
	inFlight atomic.Int32
	overlaps atomic.Int32
	writes   map[string]int
}

func (s *overlapSpy) Write(p []byte) (int, error) {
	if s.inFlight.Add(1) > 1 {
		s.overlaps.Add(1)
	}
	defer s.inFlight.Add(-1)
	// Give another caller the chance to start a write while this one is
	// in progress.
	runtime.Gosched()
	s.writes[string(p)]++
	return len(p), nil
}

// Concurrent Publish calls never overlap their writes, and each record is
// written whole, once.
func TestConcurrentPublishesNeverOverlapTheirWrites(t *testing.T) {
	t.Parallel()
	spy := &overlapSpy{writes: map[string]int{}}
	publisher := newPublisher(t, spy)
	const sources, rounds = 32, 50
	at := time.Date(2026, 10, 9, 8, 28, 10, 0, time.UTC)

	var wg sync.WaitGroup
	errs := make(chan error, sources*rounds)
	for source := range sources {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for round := range rounds {
				errs <- publisher.Publish(jsonl.Observation{
					Source:     fmt.Sprintf("source-%d", source),
					ObservedAt: at,
					Agents:     []jsonl.Agent{{ID: fmt.Sprintf("agent-%d", round), State: "working"}},
				})
			}
		}()
	}
	wg.Wait()
	close(errs)

	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if n := spy.overlaps.Load(); n != 0 {
		t.Errorf("%d writes started while another was in progress", n)
	}
	for source := range sources {
		for round := range rounds {
			line := fmt.Sprintf(`{"source":"source-%d","observedAt":"2026-10-09T08:28:10Z","agents":[{"id":"agent-%d","state":"working"}]}`+"\n", source, round)
			if got := spy.writes[line]; got != 1 {
				t.Errorf("record %q written %d times, want 1", line, got)
			}
		}
	}
	if len(spy.writes) != sources*rounds {
		t.Errorf("got %d distinct writes, want %d", len(spy.writes), sources*rounds)
	}
}

// A failed write is returned, and breaks the publisher: every later
// Publish returns that failure and writes nothing.
func TestAFailedWriteIsReturnedAndBreaksThePublisher(t *testing.T) {
	t.Parallel()
	errDiskFull := errors.New("disk full")
	for name, tc := range map[string]struct {
		short int
		err   error
		want  error
	}{
		"write error":            {err: errDiskFull, want: errDiskFull},
		"short write":            {short: 1, want: io.ErrShortWrite},
		"short write with error": {short: 1, err: errDiskFull, want: errDiskFull},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			spy := &writerSpy{short: tc.short, err: tc.err}
			publisher := newPublisher(t, spy)
			observation := jsonl.Observation{
				Source:     "claude-main",
				ObservedAt: time.Date(2026, 10, 9, 8, 28, 10, 0, time.UTC),
				Agents:     []jsonl.Agent{{ID: "agent-1", State: "working"}},
			}

			first := publisher.Publish(observation)
			if !errors.Is(first, tc.want) {
				t.Fatalf("first Publish returned %v, want %v", first, tc.want)
			}
			// The writer would now succeed: the publisher must not use it.
			spy.short, spy.err = 0, nil
			for i := range 3 {
				if err := publisher.Publish(observation); err != first {
					t.Errorf("Publish %d after the failure returned %v, want %v", i+2, err, first)
				}
			}

			if len(spy.writes) != 1 {
				t.Errorf("got %d writes, want only the failed one", len(spy.writes))
			}
		})
	}
}

// failOnceSpy fails its first Write as the test set, a short count or an
// error, and accepts every later one. It counts its calls atomically, so
// the count holds even if writes overlapped.
type failOnceSpy struct {
	calls atomic.Int32
	short int
	err   error
}

func (s *failOnceSpy) Write(p []byte) (int, error) {
	if s.calls.Add(1) == 1 {
		return len(p) - s.short, s.err
	}
	return len(p), nil
}

// Concurrent callers racing into a write that fails cause exactly one
// Write: every caller gets an error, all of them the failure the publisher
// latched, even those that reach the writer after it would succeed again.
func TestConcurrentPublishesShareOneFailedWrite(t *testing.T) {
	t.Parallel()
	errDiskFull := errors.New("disk full")
	for name, tc := range map[string]struct {
		short int
		err   error
		want  error
	}{
		"write error": {err: errDiskFull, want: errDiskFull},
		"short write": {short: 1, want: io.ErrShortWrite},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			spy := &failOnceSpy{short: tc.short, err: tc.err}
			publisher := newPublisher(t, spy)
			const callers = 64

			start := make(chan struct{})
			errs := make([]error, callers)
			var wg sync.WaitGroup
			for caller := range callers {
				wg.Add(1)
				go func() {
					defer wg.Done()
					<-start
					errs[caller] = publisher.Publish(jsonl.Observation{
						Source:     fmt.Sprintf("source-%d", caller),
						ObservedAt: time.Date(2026, 10, 9, 8, 28, 10, 0, time.UTC),
						Agents:     []jsonl.Agent{{ID: "agent-1", State: "working"}},
					})
				}()
			}
			close(start)
			wg.Wait()

			if n := spy.calls.Load(); n != 1 {
				t.Errorf("got %d Write calls, want 1", n)
			}
			latched := errs[0]
			if !errors.Is(latched, tc.want) {
				t.Fatalf("caller 0 got %v, want %v", latched, tc.want)
			}
			for caller, err := range errs {
				if err != latched {
					t.Errorf("caller %d got %v, want the latched %v", caller, err, latched)
				}
			}
		})
	}
}

// An observedAt whose UTC year RFC 3339 cannot write, outside 0 to 9999,
// is an error and writes nothing.
func TestPublishRejectsAnUnrepresentableTime(t *testing.T) {
	t.Parallel()
	for name, at := range map[string]time.Time{
		// 10000-01-01T00:30:00Z in UTC.
		"year 10000 in UTC": time.Date(9999, 12, 31, 23, 30, 0, 0, time.FixedZone("", -3600)),
		"year -1":           time.Date(-1, 12, 31, 23, 59, 59, 0, time.UTC),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			spy := &writerSpy{}
			publisher := newPublisher(t, spy)

			err := publisher.Publish(jsonl.Observation{
				Source:     "claude-main",
				ObservedAt: at,
				Agents:     []jsonl.Agent{{ID: "agent-1", State: "working"}},
			})
			if err == nil || !strings.Contains(err.Error(), "outside the years 0 to 9999") {
				t.Errorf("Publish returned %v, want the year out of range", err)
			}
			assertLines(t, spy)
		})
	}
}

// The first and last representable years are written as four digits.
func TestPublishWritesTheYearsAtTheEdges(t *testing.T) {
	t.Parallel()
	spy := &writerSpy{}
	publisher := newPublisher(t, spy)

	for _, at := range []time.Time{
		time.Date(0, 1, 1, 0, 0, 0, 0, time.UTC),
		// 9999-12-31T23:30:00Z in UTC.
		time.Date(10000, 1, 1, 0, 30, 0, 0, time.FixedZone("", 3600)),
	} {
		if err := publisher.Publish(jsonl.Observation{Source: "claude-main", ObservedAt: at}); err != nil {
			t.Fatal(err)
		}
	}

	assertLines(t, spy,
		`{"source":"claude-main","observedAt":"0000-01-01T00:00:00Z","agents":[]}`+"\n",
		`{"source":"claude-main","observedAt":"9999-12-31T23:30:00Z","agents":[]}`+"\n",
	)
}

// A publisher broken by a write failure returns that failure for an
// observation it could not write either, and writes nothing more.
func TestABrokenPublisherReturnsItsFailureForAnUnrepresentableTime(t *testing.T) {
	t.Parallel()
	errDiskFull := errors.New("disk full")
	spy := &writerSpy{err: errDiskFull}
	publisher := newPublisher(t, spy)

	first := publisher.Publish(jsonl.Observation{
		Source:     "claude-main",
		ObservedAt: time.Date(2026, 10, 9, 8, 28, 10, 0, time.UTC),
	})
	if !errors.Is(first, errDiskFull) {
		t.Fatalf("first Publish returned %v, want %v", first, errDiskFull)
	}
	spy.err = nil
	err := publisher.Publish(jsonl.Observation{
		Source:     "claude-main",
		ObservedAt: time.Date(9999, 12, 31, 23, 30, 0, 0, time.FixedZone("", -3600)),
	})
	if err != first {
		t.Errorf("Publish returned %v, want the latched %v", err, first)
	}
	if len(spy.writes) != 1 {
		t.Errorf("got %d writes, want only the failed one", len(spy.writes))
	}
}
