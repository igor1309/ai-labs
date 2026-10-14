package app

// agentProfile is an agent as the package uses it: the runtime profile a
// workflow's node binds a process to, whatever file says it. The reader
// maps an agent document to it.
type agentProfile struct {
	name string
	// runtime names the runtime mapping the agent's calls run on.
	runtime     string
	model       string
	modelFamily string
	effort      string
	// command is the command its runtime's adapter is given to run.
	command string
	// skills are the skill documents its calls are given (ADR-021).
	skills []string
}
