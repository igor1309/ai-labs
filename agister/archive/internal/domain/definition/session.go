package definition

// Session modes. A fresh-only call always starts a new session; a
// resumable one's session may be resumed: by a repair turn, a recovery
// turn or a caller that continues the run. A process says which (ADR-030
// rule 3).
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

// CallSession is the session mode a call of the process runs under: the
// one it sets, and SessionFresh where it sets none (ADR-030 rules 2 and 3).
func CallSession(process Process) string {
	if process.Session == "" {
		return SessionFresh
	}
	return process.Session
}
