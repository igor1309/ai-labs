// Package outcome decides a runtime turn from what its process left: the
// exit, the end of its stderr, and whether Agister ended it or could not
// record it. It runs nothing; each runtime adapter converts the evidence
// its own transport returns.
package outcome

import (
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// reasonBytes bounds the stderr reason an error message quotes.
const reasonBytes = 300

// Evidence is what a runtime process left.
type Evidence struct {
	Exit       *run.Exit
	SpawnError string
	TimedOut   bool
	Aborted    bool
	// StderrTail is the end of what the process wrote to stderr;
	// StderrOmitted counts the bytes cut before it, and a cut tail starts
	// with a line that says so.
	StderrTail    string
	StderrOmitted int64
	// RecordError is why the process could not be recorded; it was killed
	// at once and the turn must fail (see RecordFailure).
	RecordError string
}

// Base is a turn carrying only transport evidence.
func Base(evidence Evidence) run.Turn {
	return run.Turn{Status: run.Lost, Exit: evidence.Exit, StderrTail: evidence.StderrTail, StderrOmitted: evidence.StderrOmitted}
}

// Reason is the runtime's own reason on stderr: the tail's last non-empty
// line, bounded; empty when the process printed nothing.
func Reason(evidence Evidence) string {
	lines := strings.Split(evidence.StderrTail, "\n")
	if evidence.StderrOmitted > 0 && len(lines) > 1 {
		lines = lines[1:] // the cut marker
	}
	for i := len(lines) - 1; i >= 0; i-- {
		if line := strings.TrimSpace(lines[i]); line != "" {
			return bound(line, reasonBytes)
		}
	}
	return ""
}

// RecordFailure decides a turn whose process could not be recorded and was
// killed for it, whatever the runtime said before that; false when the
// process was recorded.
func RecordFailure(turn run.Turn, evidence Evidence) (run.Turn, bool) {
	if evidence.RecordError == "" {
		return turn, false
	}
	fault := run.Fault(run.ClassInternal, "recording the runtime process failed, so it was killed: %s", evidence.RecordError)
	turn.Status, turn.Error = run.StatusOf(fault.Class), fault
	return turn, true
}

// WithoutTerminal decides a turn for which the runtime reported no terminal
// event: Agister's own timeout or cancellation first, then spawn failure,
// then the exit. A clean exit without a terminal event is lost. A non-zero
// exit quotes the runtime's reasons: lastError from its stream, then its
// stderr's (Reason); with neither it says only the exit code.
func WithoutTerminal(turn run.Turn, evidence Evidence, lastError string) run.Turn {
	detail := ""
	if lastError != "" {
		detail = ": " + lastError
	}
	var fault *run.Error
	switch {
	case evidence.TimedOut:
		fault = run.Fault(run.ClassTimeout, "")
	case evidence.Aborted:
		fault = run.Fault(run.ClassCancelled, "")
	case evidence.SpawnError != "":
		fault = run.Fault(run.ClassRuntimeUnavailable, "%s", evidence.SpawnError)
	case evidence.Exit != nil && evidence.Exit.Code != nil && *evidence.Exit.Code != 0:
		fault = run.Fault(run.ClassRuntimeError, "exit code %s%s", strconv.Itoa(*evidence.Exit.Code), reasons(lastError, Reason(evidence)))
	case evidence.Exit != nil && evidence.Exit.Signal != "":
		fault = run.Fault(run.ClassKilled, "%s%s", evidence.Exit.Signal, detail)
	default:
		fault = run.Fault(run.ClassNoResult, "exited without a result%s", detail)
	}
	turn.Status, turn.Error = run.StatusOf(fault.Class), fault
	return turn
}

// reasons is the detail of a non-zero exit: each distinct reason, the
// stream's first.
func reasons(stream, stderr string) string {
	switch {
	case stream == "" && stderr == "":
		return ""
	case stderr == "" || strings.Contains(stream, stderr):
		return ": " + stream
	case stream == "" || strings.Contains(stderr, stream):
		return ": " + stderr
	}
	return ": " + stream + "; " + stderr
}

// bound cuts text to at most max bytes on a rune boundary, marking the cut.
func bound(text string, max int) string {
	if len(text) <= max {
		return text
	}
	for max > 0 && !utf8.RuneStart(text[max]) {
		max--
	}
	return text[:max] + "…"
}

// Failed is a turn that could not be attempted.
func Failed(class run.Class, err error) run.Turn {
	return run.Turn{Status: run.StatusOf(class), Error: run.Fault(class, "%v", err)}
}
