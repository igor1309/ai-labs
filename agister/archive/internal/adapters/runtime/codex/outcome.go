package codex

import (
	"strconv"
	"strings"
	"unicode/utf8"
)

// reasonBytes bounds the stderr reason an error message quotes.
const reasonBytes = 300

// Base is a turn carrying only transport evidence.
func baseTurn(evidence Evidence) Turn {
	return Turn{Status: Lost, Exit: evidence.Exit, StderrTail: evidence.StderrTail, StderrOmitted: evidence.StderrOmitted}
}

// Reason is the runtime's own reason on stderr: the tail's last non-empty
// line, bounded; empty when the process printed nothing.
func reason(evidence Evidence) string {
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
func recordFailure(turn Turn, evidence Evidence) (Turn, bool) {
	if evidence.RecordError == "" {
		return turn, false
	}
	fault := Fault(ClassInternal, "recording the runtime process failed, so it was killed: %s", evidence.RecordError)
	turn.Status, turn.Error = StatusOf(fault.Class), fault
	return turn, true
}

// WithoutTerminal decides a turn for which the runtime reported no terminal
// event: Agister's own timeout or cancellation first, then spawn failure,
// then the exit. A clean exit without a terminal event is lost. A non-zero
// exit quotes the runtime's reasons: lastError from its stream, then its
// stderr's (Reason); with neither it says only the exit code.
func withoutTerminal(turn Turn, evidence Evidence, lastError string) Turn {
	detail := ""
	if lastError != "" {
		detail = ": " + lastError
	}
	var fault *Error
	switch {
	case evidence.TimedOut:
		fault = Fault(ClassTimeout, "")
	case evidence.Aborted:
		fault = Fault(ClassCancelled, "")
	case evidence.SpawnError != "":
		fault = Fault(ClassRuntimeUnavailable, "%s", evidence.SpawnError)
	case evidence.Exit != nil && evidence.Exit.Code != nil && *evidence.Exit.Code != 0:
		fault = Fault(ClassRuntimeError, "exit code %s%s", strconv.Itoa(*evidence.Exit.Code), reasons(lastError, reason(evidence)))
	case evidence.Exit != nil && evidence.Exit.Signal != "":
		fault = Fault(ClassKilled, "%s%s", evidence.Exit.Signal, detail)
	default:
		fault = Fault(ClassNoResult, "exited without a result%s", detail)
	}
	turn.Status, turn.Error = StatusOf(fault.Class), fault
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
func failedTurn(class Class, err error) Turn {
	return Turn{Status: StatusOf(class), Error: Fault(class, "%v", err)}
}
