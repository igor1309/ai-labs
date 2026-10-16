package claudecode_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

// facts.feature, "Its facts".
func TestItsFacts(t *testing.T) {
	t.Parallel()
	want := claudecode.Facts{
		Contract:     "claude-code/3",
		Schema:       true,
		Session:      true,
		Skills:       true,
		Model:        true,
		Efforts:      []string{"low", "medium", "high", "xhigh", "max"},
		ToolCalls:    true,
		ToolCommands: true,
	}
	if got := claudecode.New().Facts(); !reflect.DeepEqual(got, want) {
		t.Errorf("facts\n got %+v\nwant %+v", got, want)
	}
}
