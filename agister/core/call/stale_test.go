package call_test

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// watchedCaller is a caller over spy, which takes the inputs in its
// message, its turns watched by staleness.
func watchedCaller(t *testing.T, spy *runtimeSpy, staleness *stalenessSpy) *call.Caller {
	t.Helper()
	clock := clocktest.NewClock(start)
	c, err := call.New(spy, call.InMessage, &validatorSpy{}, staleness, clock, clock.Timer, "/r", nil)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// limits are the staleness limits of home's implement.
var limits = call.Limits{RepeatedToolCalls: 5, ToolCommand: 15 * time.Minute, NoEvent: 21 * time.Minute}

// stale.feature, "The call ends as what went stale says": the watch tells
// it while the turn runs, and the turn ends only once its context is
// ended; its reply, given after, decides nothing.
func TestTheCallEndsAsWhatWentStaleSays(t *testing.T) {
	t.Parallel()
	cases := []struct {
		stale  call.Stale
		status call.Status
		class  call.Class
	}{
		{call.Stale{Limit: call.RepeatedToolCalls, What: `the tool call "Bash" repeated 3 times`}, call.Failed, call.BudgetExhausted},
		{call.Stale{Limit: call.ToolCommand, What: `the tool command "Bash" ran over 15m`}, call.Interrupted, call.Timeout},
		{call.Stale{Limit: call.NoEvent, What: "no event for 21m"}, call.Interrupted, call.Timeout},
	}
	for _, c := range cases {
		t.Run(c.stale.What, func(t *testing.T) {
			t.Parallel()
			staleness := &stalenessSpy{}
			spy := &runtimeSpy{turn: func(ctx context.Context) (call.Ended, error) {
				staleness.stale(c.stale)
				<-ctx.Done()
				return call.Ended{Reply: &call.Reply{Text: "t"}}, nil
			}}
			got := watchedCaller(t, spy, staleness).Call(context.Background(), call.Step{Staleness: limits}, discard)
			if got.Status != c.status || got.Class != c.class || got.Reason != c.stale.What || got.Output != nil {
				t.Errorf("ended %q, class %q, reason %q, output %v; want %q, class %q, reason %q, none",
					got.Status, got.Class, got.Reason, got.Output, c.status, c.class, c.stale.What)
			}
			if staleness.stopped != 1 {
				t.Errorf("%d watches stopped, want 1", staleness.stopped)
			}
		})
	}
}

// A turn watched is watched against its step's limits, and the watch is
// given each line it reports, after the call's report.
func TestTheWatchIsGivenTheLimitsAndEachReport(t *testing.T) {
	t.Parallel()
	staleness := &stalenessSpy{}
	reports := []call.Report{{Tool: &call.Tool{Name: "Bash", Input: "ls"}}, {}}
	spy := &runtimeSpy{turn: replies(call.Reply{Text: "t"}), reports: reports}
	var seen []int
	got := watchedCaller(t, spy, staleness).Call(context.Background(), call.Step{Staleness: limits}, func(call.Report) {
		seen = append(seen, len(staleness.reports))
	})
	if got.Status != call.Completed {
		t.Errorf("status %q, want completed", got.Status)
	}
	if want := []call.Limits{limits}; !reflect.DeepEqual(staleness.limits, want) {
		t.Errorf("watched against %+v, want %+v", staleness.limits, want)
	}
	if !reflect.DeepEqual(staleness.reports, reports) || !reflect.DeepEqual(seen, []int{0, 1}) {
		t.Errorf("the watch was given %+v, the call's report seeing %v of it; want %+v, each after the report", staleness.reports, seen, reports)
	}
}

// stale.feature, "A process with no staleness limit is not watched".
func TestAProcessWithNoStalenessLimitIsNotWatched(t *testing.T) {
	t.Parallel()
	staleness := &stalenessSpy{}
	spy := &runtimeSpy{turn: replies(call.Reply{Text: "t"}), reports: []call.Report{{}}}
	got := watchedCaller(t, spy, staleness).Call(context.Background(), call.Step{TimeLimit: time.Hour}, discard)
	if got.Status != call.Completed {
		t.Errorf("status %q, want completed", got.Status)
	}
	if len(staleness.limits) > 0 || len(staleness.reports) > 0 {
		t.Errorf("watched against %+v, given %+v; want no watch", staleness.limits, staleness.reports)
	}
}
