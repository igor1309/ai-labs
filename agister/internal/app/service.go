package app

import "github.com/igor1309/ai-labs/agister/internal/domain/policy"

// serviceSettings are the service settings as the package uses them: what
// bounds every call, whatever file says it. The reader maps a service
// document to them.
type serviceSettings struct {
	// ceilings bound a call's limits; their permissions are the
	// vocabulary.
	ceilings policy.Ceilings
	// stateReaching are the permissions that would let an agent reach
	// Agister's own state. They are never granted, whatever a process
	// allows.
	stateReaching []string
}
