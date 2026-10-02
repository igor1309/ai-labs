package outcome_test

import (
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/outcome"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func TestARecordedProcessIsNotAFailure(t *testing.T) {
	if _, failed := outcome.RecordFailure(run.Turn{}, outcome.Evidence{}); failed {
		t.Fatal("no record error, yet the turn was failed")
	}
}

// A non-zero exit quotes the runtime's reasons, its stream's then its
// stderr's last line, each once; with neither it says only the exit code.
func TestANonZeroExitQuotesTheRuntimesReasons(t *testing.T) {
	one := 1
	failed := func(stderr, stream string) string {
		evidence := outcome.Evidence{Exit: &run.Exit{Code: &one}, StderrTail: stderr}
		turn := outcome.WithoutTerminal(outcome.Base(evidence), evidence, stream)
		if turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError {
			t.Fatalf("turn = %+v", turn)
		}
		return turn.Error.Message
	}
	for _, c := range []struct{ stderr, stream, want string }{
		{"", "", "exit code 1"},
		{"warming up\nError: too large\n\n", "", "exit code 1: Error: too large"},
		{"", "stream closed", "exit code 1: stream closed"},
		{"Error: unauthorized", "401 Unauthorized", "exit code 1: 401 Unauthorized; Error: unauthorized"},
		{"Error: 401 Unauthorized", "401 Unauthorized", "exit code 1: Error: 401 Unauthorized"},
		{"401 Unauthorized", "Error: 401 Unauthorized", "exit code 1: Error: 401 Unauthorized"},
		{"Error: " + strings.Repeat("é", 400), "", "exit code 1: Error: " + strings.Repeat("é", 146) + "…"},
	} {
		if got := failed(c.stderr, c.stream); got != c.want {
			t.Errorf("stderr %q, stream %q: message %q, want %q", c.stderr, c.stream, got, c.want)
		}
	}
}
