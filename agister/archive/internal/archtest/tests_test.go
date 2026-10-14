package archtest

import (
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/gokit/testdiscipline"
)

// The module's own tests keep ADR-017's marker and parallelism (rules 1 and
// 5), by the rules testdiscipline.Findings documents. Real machinery is the
// standard library's and the module's own fake builds.
func TestTestsKeepTheMarkerAndTheParallelism(t *testing.T) {
	t.Parallel()
	machinery := testdiscipline.StandardMachinery()
	machinery[module+"/internal/adapters/runtime/runtimetest"] = []string{"Binary", "Build"}
	findings, err := testdiscipline.Findings("../..", machinery)
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) > 0 {
		t.Error(strings.Join(findings, "\n"))
	}
}
