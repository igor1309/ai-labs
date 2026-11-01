package run_test

import (
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// A trail keeps a path once, with the tool that wrote it first, and every
// denial, each in the order added. Adding to it leaves the trail added to
// as it was: a record that holds it does not change.
func TestATrailKeepsAPathOnceAndEveryDenial(t *testing.T) {
	t.Parallel()
	var none *run.Trail
	first := none.Touch("a.go", "Edit")
	second := first.Touch("b.go", "Write")
	if again := second.Touch("a.go", "Write"); again != second {
		t.Fatalf("a path it holds made a new trail: %+v", again)
	}
	third := second.Deny("Bash", "rm a.go").Deny("Bash", "rm a.go")
	fourth := third.Touch("c.go", "Edit")

	want := &run.Trail{
		Touched: []run.Touched{{Path: "a.go", Tool: "Edit"}, {Path: "b.go", Tool: "Write"}, {Path: "c.go", Tool: "Edit"}},
		Denied:  []run.Denial{{Tool: "Bash", Input: "rm a.go"}, {Tool: "Bash", Input: "rm a.go"}},
	}
	if !reflect.DeepEqual(fourth, want) {
		t.Fatalf("trail = %+v", fourth)
	}
	if none != nil || !reflect.DeepEqual(first, &run.Trail{Touched: want.Touched[:1]}) || !reflect.DeepEqual(second, &run.Trail{Touched: want.Touched[:2]}) || len(third.Touched) != 2 {
		t.Fatalf("earlier trails changed: %+v, %+v, %+v", first, second, third)
	}
	if denied := none.Deny("Write", ""); !reflect.DeepEqual(denied, &run.Trail{Denied: []run.Denial{{Tool: "Write"}}}) {
		t.Fatalf("trail = %+v", denied)
	}
}
