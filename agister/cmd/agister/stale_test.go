package main

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/core/watch"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

// watcherSpy is a spy of core/watch: it keeps the limits of each watch it
// starts, each report a watch is given and how many watches were stopped;
// stale tells the latest watch's stale.
type watcherSpy struct {
	limits  []watch.Limits
	reports []watch.Report
	stopped int
	stale   func(watch.Stale)
}

func (s *watcherSpy) Watch(limits watch.Limits, stale func(watch.Stale)) (func(watch.Report), func()) {
	s.limits, s.stale = append(s.limits, limits), stale
	return func(r watch.Report) { s.reports = append(s.reports, r) }, func() { s.stopped++ }
}

// A call's staleness is core/watch's, in core/call's words both ways: the
// limits and each line reported, a tool call and another line, go to the
// watch; each limit it reaches, and what it says, comes back; the stop is
// the watch's.
func TestACallsStalenessIsCoreWatchs(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name    string
		watched watch.Limit
		want    call.Limit
	}{
		{"repeated tool calls", watch.RepeatedToolCalls, call.RepeatedToolCalls},
		{"a tool command", watch.ToolCommand, call.ToolCommand},
		{"no event", watch.NoEvent, call.NoEvent},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &watcherSpy{}
			s, err := newStaleness(spy)
			if err != nil {
				t.Fatal(err)
			}
			var told []call.Stale
			report, stop := s.Watch(call.Limits{RepeatedToolCalls: 5, ToolCommand: 15 * time.Minute, NoEvent: 21 * time.Minute},
				func(stale call.Stale) { told = append(told, stale) })
			report(call.Report{Tool: &call.Tool{Name: "Bash", Input: "ls"}})
			report(call.Report{})
			spy.stale(watch.Stale{Limit: c.watched, What: "w"})
			stop()
			if want := []watch.Limits{{RepeatedToolCalls: 5, ToolCommand: 15 * time.Minute, NoEvent: 21 * time.Minute}}; !reflect.DeepEqual(spy.limits, want) {
				t.Errorf("watched against %+v, want %+v", spy.limits, want)
			}
			if want := []watch.Report{{Tool: &watch.Tool{Name: "Bash", Input: "ls"}}, {}}; !reflect.DeepEqual(spy.reports, want) {
				t.Errorf("the watch was given %+v, want %+v", spy.reports, want)
			}
			if want := []call.Stale{{Limit: c.want, What: "w"}}; !reflect.DeepEqual(told, want) || spy.stopped != 1 {
				t.Errorf("told %+v, %d stopped; want %+v, one stopped", told, spy.stopped, want)
			}
		})
	}
}

// The staleness is built with its watcher.
func TestTheStalenessNeedsAWatcher(t *testing.T) {
	t.Parallel()
	if _, err := newStaleness(nil); err == nil {
		t.Error("staleness built with no watcher, want an error")
	}
}

// home's implement on claude-code is watched against its staleness
// limits, as it ships them: a turn that goes stale, its session unread,
// so that no recovery turn can resume it, is ended, the call ending as
// what went stale says, and its hold is released.
//
// Contract test: the files home holds, as Agister ships them.
func TestHomesImplementEndsAStaleTurn(t *testing.T) {
	t.Parallel()
	bash := &claudecode.Tool{Name: "Bash", Input: `{"command":"go test ./..."}`}
	for _, c := range []struct {
		name    string
		reports []claudecode.Report
		turn    func(f *runFixture)
		status  string
		class   string
		reason  string
	}{
		{"the same tool call five times", []claudecode.Report{{Tool: bash}, {}, {Tool: bash}, {Tool: bash}, {}, {Tool: bash}, {Tool: bash}}, nil,
			"failed", "budget_exhausted", `the tool call "Bash" repeated 5 times`},
		{"a tool command that hangs", []claudecode.Report{{}, {Tool: bash}}, func(f *runFixture) {
			f.clock.Started(15 * time.Minute)
			f.clock.Advance(15 * time.Minute)
		}, "interrupted", "timeout", `the tool command "Bash" ran over 15m`},
		{"quiet from the turn's start", nil, func(f *runFixture) {
			f.clock.Started(21 * time.Minute)
			f.clock.Advance(21 * time.Minute)
		}, "interrupted", "timeout", "no event for 21m"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newRunFixture(t, shippedHome(t), nil)
			f.sources.commits = map[string]string{"HEAD": "c1"}
			f.sources.files = map[string]string{"/r/s.md": stepBrief}
			f.sources.exist = []string{"/r/g.md"}
			f.runtimes.claude.reports = c.reports
			f.runtimes.claude.answer = func(ctx context.Context, _ claudecode.Turn) (claudecode.Result, error) {
				if c.turn != nil {
					c.turn(f)
				}
				<-ctx.Done()
				return claudecode.Result{Reply: &claudecode.Reply{Output: []byte(implementation)}}, nil
			}
			got := f.run(t, "/r", "run", "--process", "implement", "--agent", "claude-opus", "--param", "brief=s.md")
			if got.stderr != "" || got.code != 1 {
				t.Fatalf("stderr %q, exit %d; want none, 1", got.stderr, got.code)
			}
			p := modelPrintedOf(t, got)
			if p.Status != c.status || p.Class == nil || *p.Class != c.class || p.Reason == nil || *p.Reason != c.reason || p.Output != nil {
				t.Errorf("printed %+v, want %s, class %s, the reason %q, no output", p, c.status, c.class, c.reason)
			}
			if _, alone, shared := f.holding.locks(); alone != 0 || shared != 0 {
				t.Errorf("after the run: %d held alone, %d shared; want none held", alone, shared)
			}
		})
	}
}
