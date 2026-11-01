package pi_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/pi"
)

// facts.feature, "Its facts".
func TestItsFacts(t *testing.T) {
	t.Parallel()
	want := pi.Facts{
		Contract:     "pi/1",
		Schema:       true,
		Session:      true,
		Skills:       true,
		Model:        true,
		Efforts:      []string{"off", "minimal", "low", "medium", "high", "xhigh", "max"},
		ToolCalls:    true,
		ToolCommands: true,
		Inputs:       pi.InMessage,
	}
	if got := pi.New().Facts(); !reflect.DeepEqual(got, want) {
		t.Errorf("facts\n got %+v\nwant %+v", got, want)
	}
}
