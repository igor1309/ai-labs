package main

import (
	"context"
	"maps"
	"sync"

	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/runstore"
)

// childInputCapture observes one declared child's resolutions. A repeat
// resolves that child again before its next start; a refusal clears the
// previous pass's inputs. Parallel children each have their own observer.
type childInputCapture struct {
	inputs declaredResolver
	mu     sync.Mutex
	fixed  map[string]inputs.Fixed
}

func (c *childInputCapture) Resolve(ctx context.Context, declared inputs.Declared, given map[string]string) (inputs.Resolved, error) {
	resolved, err := c.inputs.Resolve(ctx, declared, given)
	c.mu.Lock()
	defer c.mu.Unlock()
	c.fixed = nil
	if err == nil {
		c.fixed = maps.Clone(resolved.Inputs)
	}
	return resolved, err
}

func (c *childInputCapture) recorded() []runstore.Input {
	c.mu.Lock()
	defer c.mu.Unlock()
	return childInputs(c.fixed)
}
