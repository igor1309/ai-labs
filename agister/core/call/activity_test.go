package call_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/call"
)

// activity.feature, "Each tool call reaches the call's report, in order":
// what the report was given is read once the call has ended; a line that
// makes no tool call reaches it too.
func TestEachToolCallReachesTheCallsReportInOrder(t *testing.T) {
	t.Parallel()
	reports := []call.Report{{Tool: &call.Tool{Name: "Bash", Input: "ls"}}, {}, {Tool: &call.Tool{Name: "Read", Input: "a.go"}}}
	spy := &runtimeSpy{turn: replies(call.Reply{Text: "t"}), reports: reports}
	var reported []call.Report
	got := modelCaller(t, spy, &validatorSpy{}).Call(context.Background(), call.Step{}, func(r call.Report) {
		reported = append(reported, r)
	})
	if !reflect.DeepEqual(reported, reports) {
		t.Errorf("reported %+v, want %+v", reported, reports)
	}
	if got.Status != call.Completed {
		t.Errorf("status %q, want completed", got.Status)
	}
}
