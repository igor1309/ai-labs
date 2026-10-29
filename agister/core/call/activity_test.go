package call_test

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// activity.feature, "Each tool call reaches the call's report, in order":
// what the report was given is read once the call has ended; a tool's
// result and a line that makes no tool call reach it too.
func TestEachToolCallReachesTheCallsReportInOrder(t *testing.T) {
	t.Parallel()
	reports := []call.Report{{Tool: &call.Tool{Name: "Bash", Input: "ls"}}, {Result: true}, {}, {Tool: &call.Tool{Name: "Read", Input: "a.go"}}}
	spy := &runtimeSpy{turn: replies(call.Reply{Text: "t"}), reports: reports}
	var reported []call.Report
	got := modelCaller(t, spy, &validatorSpy{}).Call(context.Background(), call.Step{}, func(r call.Report) {
		reported = append(reported, r)
	})
	// Call lifecycle facts precede the runtime reports.
	want := append([]call.Report{{Running: true}}, reports...)
	if !reflect.DeepEqual(reported, want) {
		t.Errorf("reported %+v, want %+v", reported, want)
	}
	if got.Status != call.Completed {
		t.Errorf("status %q, want completed", got.Status)
	}
}

func TestTurnProgressPrecedesTheCapacityWaitAndTheRetry(t *testing.T) {
	t.Parallel()
	clock := clocktest.NewClock(start)
	spy := &runtimeSpy{turn: inOrder(
		replies(call.Reply{Session: "s1", Failure: call.Capacity, Reason: busy, Cost: dollars(0.25)}),
		replies(call.Reply{Session: "s1", Text: "done", Cost: dollars(0.5)}),
	)}
	ctx, cancel := context.WithCancel(context.Background())
	var reports []call.Report
	done := calling(ctx, recoveringCaller(t, spy, &stalenessSpy{}, clock), call.Step{}, func(r call.Report) { reports = append(reports, r) })
	finished := false
	t.Cleanup(func() {
		cancel()
		if !finished {
			<-done
		}
	})
	clock.Started(30 * time.Second)
	want := []call.Report{
		{Running: true},
		{Session: "s1", Cost: dollars(0.25)},
		{Capacity: &call.CapacityTurn{Reason: busy, Retry: 30 * time.Second}},
	}
	if !reflect.DeepEqual(reports, want) {
		t.Fatalf("before wait: %+v, want %+v", reports, want)
	}
	clock.Advance(30 * time.Second)
	result := <-done
	finished = true
	want = append(want, call.Report{Running: true}, call.Report{Session: "s1", Cost: dollars(0.5)})
	if !reflect.DeepEqual(reports, want) || result.Cost == nil || *result.Cost != 0.75 {
		t.Fatalf("reports %+v, result %+v", reports, result)
	}
}
