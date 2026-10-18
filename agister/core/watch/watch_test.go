package watch_test

import (
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/watch"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

var start = time.Date(2026, 10, 17, 10, 0, 0, 0, time.UTC)

// watched is a turn watched against its test's limits on clock: report
// gives it a line, and stop ends the watch and gives what it told stale,
// nil for nothing.
type watched struct {
	report func(watch.Report)
	stop   func() *watch.Stale
}

func watching(t *testing.T, clock *clocktest.Clock, limits watch.Limits) watched {
	t.Helper()
	w, err := watch.New(clock.Timer)
	if err != nil {
		t.Fatal(err)
	}
	var told []watch.Stale
	report, stop := w.Watch(limits, func(s watch.Stale) { told = append(told, s) })
	t.Cleanup(stop)
	return watched{report: report, stop: func() *watch.Stale {
		stop()
		switch len(told) {
		case 0:
			return nil
		case 1:
			return &told[0]
		}
		t.Fatalf("told stale %d times: %+v", len(told), told)
		return nil
	}}
}

// call is the report of a tool call of name, given input.
func call(name, input string) watch.Report {
	return watch.Report{Tool: &watch.Tool{Name: name, Input: input}}
}

// line is the report of a line that makes no tool call.
var line = watch.Report{}

// result is the report of a tool's result.
var result = watch.Report{Result: true}

// watch.feature, "A limit reached reports the turn stale": what the turn
// reports, and when, decides what the watch tells; a watch stopped holds
// no wait.
func TestALimitReachedReportsTheTurnStale(t *testing.T) {
	t.Parallel()
	alike := strings.Repeat("x", 300)
	cases := []struct {
		name   string
		limits watch.Limits
		turn   func(clock *clocktest.Clock, report func(watch.Report))
		stale  *watch.Stale
	}{
		{"the same call three times in a row", watch.Limits{RepeatedToolCalls: 3}, func(_ *clocktest.Clock, report func(watch.Report)) {
			for range 3 {
				report(call("Bash", "ls"))
			}
		}, &watch.Stale{Limit: watch.RepeatedToolCalls, What: `the tool call "Bash" repeated 3 times`}},
		{"another call between", watch.Limits{RepeatedToolCalls: 3}, func(_ *clocktest.Clock, report func(watch.Report)) {
			report(call("Bash", "ls"))
			report(call("Bash", "pwd"))
			report(call("Bash", "ls"))
		}, nil},
		{"nothing after a call", watch.Limits{ToolCommand: 15 * time.Minute}, func(clock *clocktest.Clock, report func(watch.Report)) {
			report(call("Bash", "go test"))
			clock.Started(15 * time.Minute)
			clock.Advance(15 * time.Minute)
		}, &watch.Stale{Limit: watch.ToolCommand, What: `the tool command "Bash" ran over 15m`}},
		{"a line after a call", watch.Limits{ToolCommand: 15 * time.Minute}, func(clock *clocktest.Clock, report func(watch.Report)) {
			report(call("Bash", "go test"))
			clock.Started(15 * time.Minute)
			clock.Advance(10 * time.Minute)
			report(line)
			clock.Advance(5 * time.Minute)
		}, &watch.Stale{Limit: watch.ToolCommand, What: `the tool command "Bash" ran over 15m`}},
		{"a result after a call", watch.Limits{ToolCommand: 15 * time.Minute}, func(clock *clocktest.Clock, report func(watch.Report)) {
			report(call("Bash", "go test"))
			clock.Started(15 * time.Minute)
			clock.Advance(10 * time.Minute)
			report(result)
			clock.Advance(time.Hour)
		}, nil},
		{"nothing after a line", watch.Limits{NoEvent: 21 * time.Minute}, func(clock *clocktest.Clock, report func(watch.Report)) {
			clock.Started(21 * time.Minute)
			report(line)
			clock.Started(21 * time.Minute)
			clock.Advance(21 * time.Minute)
		}, &watch.Stale{Limit: watch.NoEvent, What: "no event for 21m"}},
		{"lines between the same calls", watch.Limits{RepeatedToolCalls: 3}, func(_ *clocktest.Clock, report func(watch.Report)) {
			for range 3 {
				report(call("Bash", "ls"))
				report(line)
			}
		}, &watch.Stale{Limit: watch.RepeatedToolCalls, What: `the tool call "Bash" repeated 3 times`}},
		{"inputs alike in their first 300 bytes only", watch.Limits{RepeatedToolCalls: 3}, func(_ *clocktest.Clock, report func(watch.Report)) {
			for _, end := range []string{"a", "b", "c"} {
				report(call("Write", alike+end))
			}
		}, nil},
		{"no limit", watch.Limits{}, func(clock *clocktest.Clock, report func(watch.Report)) {
			clock.Advance(time.Hour)
		}, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			clock := clocktest.NewClock(start)
			w := watching(t, clock, c.limits)
			c.turn(clock, w.report)
			got := w.stop()
			switch {
			case c.stale == nil && got != nil:
				t.Errorf("told %+v, want nothing", *got)
			case c.stale != nil && (got == nil || *got != *c.stale):
				t.Errorf("told %+v, want %+v", got, *c.stale)
			}
			if n := clock.Pending(); n > 0 {
				t.Errorf("%d waits left once stopped, want none", n)
			}
			if waits := clock.Waits(); c.limits == (watch.Limits{}) && len(waits) > 0 {
				t.Errorf("no limit, and the waits %v were started, want none", waits)
			}
		})
	}
}

// watch.feature, "Each report restarts the quiet limits".
func TestEachReportRestartsTheQuietLimits(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	w := watching(t, clock, watch.Limits{NoEvent: 21 * time.Minute})
	clock.Started(21 * time.Minute)
	for range 3 {
		clock.Advance(20 * time.Minute)
		w.report(line)
		clock.Started(21 * time.Minute)
	}
	if got := w.stop(); got != nil {
		t.Errorf("told %+v, want nothing", *got)
	}
}

// A watch stopped takes no more reports: one given after it is dropped,
// and tells nothing.
func TestAReportAfterStopIsDropped(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	w := watching(t, clock, watch.Limits{RepeatedToolCalls: 1})
	if got := w.stop(); got != nil {
		t.Fatalf("told %+v before any report", *got)
	}
	w.report(call("Bash", "ls"))
	if got := w.stop(); got != nil {
		t.Errorf("told %+v after stop, want nothing", *got)
	}
}

// A watcher takes its timer, and fails without one.
func TestNewFailsWithoutATimer(t *testing.T) {
	t.Parallel()
	if _, err := watch.New(nil); err == nil || err.Error() != "watch: no timer" {
		t.Errorf("New without a timer: %v, want watch: no timer", err)
	}
}
