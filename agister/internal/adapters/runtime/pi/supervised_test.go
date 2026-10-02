package pi_test

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/pi"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
)

// supervised runs Pi on the supervisor, translating as the composition
// root does.
type supervised struct{}

func (supervised) Run(ctx context.Context, spec pi.Spec, sink pi.Sink, onLine func(string)) pi.Evidence {
	return pi.Evidence(supervisor.Run(ctx, supervisor.Spec{
		Command:   spec.Command,
		Args:      spec.Args,
		Dir:       spec.Dir,
		Stdin:     spec.Stdin,
		Timeout:   spec.Timeout,
		KillGrace: spec.KillGrace,
	}, sink, onLine))
}

func (supervised) Version(ctx context.Context, command string) (string, error) {
	return supervisor.Version(ctx, command)
}
