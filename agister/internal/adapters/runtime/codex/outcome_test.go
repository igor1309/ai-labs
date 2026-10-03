package codex

import (
	"strings"
	"testing"
)

func TestARecordedProcessIsNotAFailure(t *testing.T) {
	t.Parallel()
	if _, failed := recordFailure(Turn{}, Evidence{}); failed {
		t.Fatal("no record error, yet the turn was failed")
	}
}

// A non-zero exit quotes the runtime's reasons, its stream's then its
// stderr's last line, each once; with neither it says only the exit code.
func TestANonZeroExitQuotesTheRuntimesReasons(t *testing.T) {
	t.Parallel()
	one := 1
	failed := func(stderr, stream string) string {
		evidence := Evidence{Exit: &Exit{Code: &one}, StderrTail: stderr}
		turn := withoutTerminal(baseTurn(evidence), evidence, stream)
		if turn.Status != Failed || turn.Error.Class != ClassRuntimeError {
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
