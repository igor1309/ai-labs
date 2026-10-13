package app

import "time"

// declaredVerification is a verification as the package uses it: a
// verification command as a document of its own, which a process names
// (ADR-010), whatever file says it. The reader maps a verification
// document to it.
type declaredVerification struct {
	name   string
	verify verifyValues
	// obsolete are the warnings for the fields it holds that ADR-025
	// removed, which are read and ignored.
	obsolete []string
}

// verifyValues are a verification command and its bounds (ADR-002), of a
// process's inline block or of a verification it names: run after a valid
// turn, in the call's worktree, with the operator's authority (ADR-025
// rule 5).
type verifyValues struct {
	// command is one Bash command.
	command string
	// timeout bounds each run.
	timeout time.Duration
	// maxAttempts counts the runs, the first included.
	maxAttempts int
	// instruction is what the agent is told when a run fails.
	instruction string
}

// repairs reports whether a failed run may be followed by a repair turn,
// which resumes the call's session: a call whose session may not be
// resumed, or whose runtime cannot resume one, cannot run it.
func (v *verifyValues) repairs() bool { return v != nil && v.maxAttempts > 1 }
