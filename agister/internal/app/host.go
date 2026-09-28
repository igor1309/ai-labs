package app

import "github.com/igor1309/ai-labs/agister/internal/contract"

// Host runs the core in-process behind the client contract. A service would
// host the same use cases behind the same contract.
type Host struct {
	*Settings
	*Checker
	*Inspection
	*Calls
	*Runs
}

var _ contract.Client = (*Host)(nil)
