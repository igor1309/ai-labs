package app

import "github.com/igor1309/ai-labs/agister/internal/domain/policy"

// The session modes, as a call records and names the one it runs under. A
// fresh-only call always starts a new session; a resumable one's session
// may be resumed: by a repair turn, a recovery turn or a caller that
// continues the run (ADR-030 rule 3).
const (
	sessionFresh     = "fresh-only"
	sessionResumable = "resumable"
)

// declaredProcess is a process as the package uses it: named work,
// whatever file says it. It names no agent: a workflow's node binds it to
// one (ADR-030 rules 2 and 5). The reader maps a process document to it.
type declaredProcess struct {
	name        string
	instruction string
	// prompt names the prompt its calls are given as the input prompt, and
	// guidance the further prompts, each as the input guidance.<name>, in
	// order (ADR-028 rule 8).
	prompt   string
	guidance []string
	params   []declaredParam
	values   []declaredValue
	// revision names the input whose revision HEAD must be (ADR-025 rule
	// 2).
	revision string
	// clean says a fresh call needs the worktree's content to be HEAD's
	// (ADR-025 rule 3).
	clean bool
	// skills are the skill documents its calls are given (ADR-021).
	skills []string
	output processOutput
	// verify are the values of its inline block, or of the verification it
	// names once that is resolved; nil: no verification, or a named one
	// not resolved.
	verify *verifyValues
	// verifyName names a verification, in place of the inline block.
	verifyName string
	// limits are what it declares of its limits, its own within the
	// service's ceilings (ADR-030 rule 4), but for what of its
	// verification bounds a call: the verification may be one it names,
	// so declared adds it, of the verify the process has then.
	limits policy.Declared
	// resumable says a call's session may be resumed (ADR-030 rule 3). A
	// process that sets no session is fresh-only (rule 2).
	resumable bool
	// obsolete are the warnings for the fields it holds that ADR-025
	// removed, which are read and ignored.
	obsolete []string
}

// processOutput is a process's output contract.
type processOutput struct {
	// format is "json" or "text".
	format string
	// schema names the schema a json output is validated against.
	schema string
}

// prompts lists the prompts the process names: its prompt, then its
// guidance in order. A process that parsed has its prompt and no name
// twice.
func (p declaredProcess) prompts() []string {
	var names []string
	for _, name := range append([]string{p.prompt}, p.guidance...) {
		if name != "" && !contains(names, name) {
			names = append(names, name)
		}
	}
	return names
}

// forms lists the brief forms the process's inputs name, each once, in
// declaration order.
func (p declaredProcess) forms() []string { return formsOf(p.values) }

// session is the session mode a call of the process runs under, as it is
// recorded and named.
func (p declaredProcess) session() string {
	if p.resumable {
		return sessionResumable
	}
	return sessionFresh
}

// declared is what the process declares of its limits, for policy: its
// own, and what of the verify it has bounds a call.
func (p declaredProcess) declared() policy.Declared {
	out := p.limits
	if p.verify != nil {
		out.Verify = &policy.Verify{Timeout: p.verify.timeout, MaxAttempts: p.verify.maxAttempts}
	}
	return out
}
