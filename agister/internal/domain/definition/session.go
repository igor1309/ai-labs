package definition

// Session modes. A fresh-only call always starts a new session; a
// resumable one's session may be resumed: by a repair turn, a recovery
// turn or a caller that continues the run. A process says which, and its
// agent where the process says nothing (ADR-030 rule 3).
const (
	SessionFresh     = "fresh-only"
	SessionResumable = "resumable"
)

// sessionMode is mode where it is a session mode; a problem of session
// and "" otherwise.
func sessionMode(mode string, p *problems) string {
	if mode != SessionFresh && mode != SessionResumable {
		p.add("session", "unsupported session mode %q (supported: %s, %s)", mode, SessionFresh, SessionResumable)
		return ""
	}
	return mode
}

// CallSession is the session mode a call of the process on the agent runs
// under, and the document that says it, as "process <name>" or "agent
// <name>": the process where it sets session, whatever its agent's, and
// its agent where it sets none (ADR-030 rule 3).
func CallSession(process Process, agent Agent) (mode, by string) {
	if process.Session != "" {
		return process.Session, "process " + process.Name
	}
	return agent.Session, "agent " + agent.Name
}
