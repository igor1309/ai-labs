package call_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/call"
)

// activity.feature, "Each tool call reaches the call's report, in order":
// what the report was given is read once the call has ended.
func TestEachToolCallReachesTheCallsReportInOrder(t *testing.T) {
	t.Parallel()
	tools := []call.Tool{{Name: "Bash", Input: "ls"}, {Name: "Read", Input: "a.go"}}
	spy := &runtimeSpy{turn: replies(call.Reply{Text: "t"}), tools: tools}
	var reported []call.Tool
	got := modelCaller(t, spy, &validatorSpy{}).Call(context.Background(), call.Step{}, func(tool call.Tool) {
		reported = append(reported, tool)
	})
	if !reflect.DeepEqual(reported, tools) {
		t.Errorf("reported %+v, want %+v", reported, tools)
	}
	if got.Status != call.Completed {
		t.Errorf("status %q, want completed", got.Status)
	}
}
