package codex_test

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
)

// supervised runs Codex on the supervisor, translating as the composition
// root does.
type supervised struct{}

func (supervised) Run(ctx context.Context, spec codex.Spec, sink codex.Sink, onLine func(string)) codex.Evidence {
	return codex.Evidence(supervisor.Run(ctx, supervisor.Spec{
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
