package codex_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// facts.feature, "Its facts".
func TestItsFacts(t *testing.T) {
	t.Parallel()
	want := codex.Facts{
		Contract:     "codex/2",
		Schema:       true,
		Session:      true,
		Skills:       true,
		Model:        true,
		Efforts:      []string{"minimal", "low", "medium", "high", "xhigh"},
		ToolCalls:    true,
		ToolCommands: true,
	}
	if got := codex.New().Facts(); !reflect.DeepEqual(got, want) {
		t.Errorf("facts\n got %+v\nwant %+v", got, want)
	}
}
