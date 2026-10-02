package runtime

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
)

type CommandSupervisor interface {
	Run(context.Context, supervisor.CommandRequest, func(string) error) supervisor.CommandResult
}
type Commands struct{ Supervisor CommandSupervisor }

func (c Commands) Run(ctx context.Context, request app.CommandRequest, started func(string) error) app.CommandResult {
	return app.CommandResult(c.Supervisor.Run(ctx, supervisor.CommandRequest(request), started))
}

type ProcessSupervisor interface {
	Reap(context.Context, string) (supervisor.Reaping, error)
}
type Processes struct{ Supervisor ProcessSupervisor }

func (p Processes) Reap(ctx context.Context, ref string) (app.Reaping, error) {
	result, err := p.Supervisor.Reap(ctx, ref)
	return app.Reaping(result), err
}
