package main

import (
	"errors"
	"fmt"
	"runtime"
	"slices"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/igor1309/ai-labs/warder/internal/attempt"
)

var _ attempt.Reporter = sourceReporter{}

// writeSpy records every Write and answers each with what the test's
// answer returns for it, the count and the error. It fills in nothing
// else.
type writeSpy struct {
	answer func(p []byte) (int, error)
	writes []string
}

func (s *writeSpy) Write(p []byte) (int, error) {
	s.writes = append(s.writes, string(p))
	return s.answer(p)
}

// writeAll answers a Write as written whole.
func writeAll(p []byte) (int, error) { return len(p), nil }

// A diagnostic is one line, `warder: <source-id>: <error>`, in one Write.
func TestReportWritesEachDiagnosticAsOneLineInOneWrite(t *testing.T) {
	t.Parallel()
	spy := &writeSpy{answer: writeAll}
	reporter := sourceReporter{source: "claude-main", writer: spy}

	reporter.Report(errors.New("attempt: read failed: exit status 1"))
	reporter.Report(errors.New("attempt: read timed out: context deadline exceeded"))

	want := []string{
		"warder: claude-main: attempt: read failed: exit status 1\n",
		"warder: claude-main: attempt: read timed out: context deadline exceeded\n",
	}
	if !slices.Equal(spy.writes, want) {
		t.Errorf("got the writes %q, want %q", spy.writes, want)
	}
}

// A diagnostic whose text has line breaks, as what a command wrote to its
// standard error has, is still one line.
func TestReportKeepsADiagnosticWithLineBreaksOnOneLine(t *testing.T) {
	t.Parallel()
	spy := &writeSpy{answer: writeAll}
	reporter := sourceReporter{source: "claude-main", writer: spy}

	reporter.Report(errors.New("exit status 1: not logged in\r\nrun claude login\n\nand retry\n"))

	want := []string{"warder: claude-main: exit status 1: not logged in run claude login and retry\n"}
	if !slices.Equal(spy.writes, want) {
		t.Errorf("got the writes %q, want %q", spy.writes, want)
	}
}

// A diagnostic that cannot be written is dropped: Report returns.
func TestReportDropsADiagnosticThatCannotBeWritten(t *testing.T) {
	t.Parallel()
	spy := &writeSpy{answer: func([]byte) (int, error) { return 0, errors.New("stderr is closed") }}
	reporter := sourceReporter{source: "claude-main", writer: spy}

	reporter.Report(errors.New("attempt: read failed"))

	if len(spy.writes) != 1 {
		t.Errorf("got %d writes, want 1", len(spy.writes))
	}
}

// A serial writer passes each Write on as given and returns its result.
func TestSerialWriterPassesEachWriteOn(t *testing.T) {
	t.Parallel()
	failure := errors.New("stderr is closed")
	spy := &writeSpy{answer: func([]byte) (int, error) { return 3, failure }}
	writer := &serialWriter{writer: spy}

	n, err := writer.Write([]byte("a line\n"))

	if n != 3 || err != failure {
		t.Errorf("got %d and the error %v, want 3 and the error %v", n, err, failure)
	}
	if want := []string{"a line\n"}; !slices.Equal(spy.writes, want) {
		t.Errorf("got the writes %q, want %q", spy.writes, want)
	}
}

// overlapSpy detects a Write that starts while another is in progress. It
// records writes without a lock of its own, so under -race reporters that
// let writes overlap also fail as a data race.
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
	// Give another reporter the chance to start a write while this one is
	// in progress.
	runtime.Gosched()
	s.writes[string(p)]++
	return len(p), nil
}

// The reporters of concurrent sources that share one serial writer never
// overlap their writes, and each diagnostic is written whole, once.
func TestReportersOfConcurrentSourcesNeverOverlapTheirWrites(t *testing.T) {
	t.Parallel()
	spy := &overlapSpy{writes: map[string]int{}}
	shared := &serialWriter{writer: spy}
	const sources, rounds = 32, 50

	var wg sync.WaitGroup
	for source := range sources {
		wg.Add(1)
		go func() {
			defer wg.Done()
			reporter := sourceReporter{source: fmt.Sprintf("source-%d", source), writer: shared}
			for round := range rounds {
				reporter.Report(fmt.Errorf("failure %d", round))
			}
		}()
	}
	wg.Wait()

	if n := spy.overlaps.Load(); n != 0 {
		t.Errorf("%d writes started while another was in progress", n)
	}
	for source := range sources {
		for round := range rounds {
			line := fmt.Sprintf("warder: source-%d: failure %d\n", source, round)
			if got := spy.writes[line]; got != 1 {
				t.Errorf("diagnostic %q written %d times, want 1", line, got)
			}
		}
	}
	if len(spy.writes) != sources*rounds {
		t.Errorf("got %d distinct writes, want %d", len(spy.writes), sources*rounds)
	}
}
