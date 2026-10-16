package bash_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/bash"
)

// facts.feature, "Its facts".
func TestItsFacts(t *testing.T) {
	t.Parallel()
	want := bash.Facts{
		Contract:     "bash/1",
		Schema:       false,
		Session:      false,
		Skills:       false,
		Model:        false,
		Efforts:      nil,
		ToolCalls:    false,
		ToolCommands: false,
	}
	if got := bash.New().Facts(); !reflect.DeepEqual(got, want) {
		t.Errorf("facts\n got %+v\nwant %+v", got, want)
	}
}
