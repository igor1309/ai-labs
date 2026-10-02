package opencode_test

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
)

// supervised runs OpenCode on the supervisor, translating as the composition
// root does.
type supervised struct{}

func (supervised) Run(ctx context.Context, spec opencode.Spec, sink opencode.Sink, onLine func(string)) opencode.Evidence {
	return opencode.Evidence(supervisor.Run(ctx, supervisor.Spec{
		Command:   spec.Command,
		Args:      spec.Args,
		Dir:       spec.Dir,
		Env:       spec.Env,
		Stdin:     spec.Stdin,
		Timeout:   spec.Timeout,
		KillGrace: spec.KillGrace,
	}, sink, onLine))
}

func (supervised) Version(ctx context.Context, command string) (string, error) {
	return supervisor.Version(ctx, command)
}
