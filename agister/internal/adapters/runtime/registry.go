// Package runtime maps adapter names to runtime runners.
package runtime

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

// Registry builds a runner for an adapter name and runtime command.
type Registry map[string]func(command string) app.TurnRunner

func (r Registry) Runner(adapter, command string) (app.TurnRunner, error) {
	factory, ok := r[adapter]
	if !ok {
		return nil, fmt.Errorf("no runtime adapter %q (available: %s)", adapter, strings.Join(r.Adapters(), ", "))
	}
	return factory(command), nil
}

func (r Registry) Adapters() []string {
	names := make([]string, 0, len(r))
	for name := range r {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// Identity is what the adapter's runner for command reports about itself.
func (r Registry) Identity(ctx context.Context, adapter, command string) (app.RuntimeIdentity, error) {
	runner, err := r.Runner(adapter, command)
	if err != nil {
		return app.RuntimeIdentity{}, err
	}
	return runner.Identity(ctx)
}
