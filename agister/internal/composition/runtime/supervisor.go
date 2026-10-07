package runtime

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
	"github.com/igor1309/ai-labs/gokit/supervisor"
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

// HoldProcesses translates the holder's process contract to the
// supervisor.
type HoldProcesses struct{ Supervisor ProcessSupervisor }

func (p HoldProcesses) Reap(ctx context.Context, ref string) (app.HoldReaping, error) {
	result, err := p.Supervisor.Reap(ctx, ref)
	return app.HoldReaping(result), err
}

// supervisorSink passes a turn's events from the supervisor to a runtime
// adapter's sink, the supervisor's own decisions (a timeout, an abort, a
// failed record) as Agister's: they are not the runtime moving.
type supervisorSink struct{ supervisor.Sink }

func (s supervisorSink) Event(source, kind string, data map[string]any) {
	if source == supervisor.SourceSupervisor {
		source = run.SourceAgister
	}
	s.Sink.Event(source, kind, data)
}
