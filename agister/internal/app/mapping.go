package app

import "github.com/igor1309/ai-labs/agister/internal/domain/enforce"

// runtimeMapping is a runtime mapping as the package uses it: what one
// runtime adapter offers a call, whatever file says it. The reader maps a
// runtime document to it.
type runtimeMapping struct {
	name    string
	adapter string
	// contract is the adapter contract the mapping describes, which the
	// adapter found must implement.
	contract string
	// efforts are the efforts an agent on the runtime may name.
	efforts []string
	// offer is what a plan is made of: the primitives, each with the
	// versions it was verified for, and whether a plan takes exactly one.
	offer enforce.Offer
}
