package main

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/pi"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
)

// Each runtime adapter declares the transport it takes in its own types;
// these translate them to the supervisor's and run the process on it.

type claudeCodeTransport struct{}

func (claudeCodeTransport) Run(ctx context.Context, spec claudecode.Spec, sink claudecode.Sink, onLine func(string)) claudecode.Evidence {
	return claudecode.Evidence(supervisor.Run(ctx, supervisor.Spec{
		Command:   spec.Command,
		Args:      spec.Args,
		Dir:       spec.Dir,
		Stdin:     spec.Stdin,
		Timeout:   spec.Timeout,
		KillGrace: spec.KillGrace,
	}, sink, onLine))
}

func (claudeCodeTransport) Version(ctx context.Context, command string) (string, error) {
	return supervisor.Version(ctx, command)
}

type codexTransport struct {
	// run runs the translated process; nil: supervisor.Run.
	run func(ctx context.Context, spec supervisor.Spec, sink supervisor.Sink, onLine func(string)) supervisor.Evidence
}

func (t codexTransport) Run(ctx context.Context, spec codex.Spec, sink codex.Sink, onLine func(string)) codex.Evidence {
	run := t.run
	if run == nil {
		run = supervisor.Run
	}
	return codex.Evidence(run(ctx, supervisor.Spec{
		Command:   spec.Command,
		Args:      spec.Args,
		Dir:       spec.Dir,
		Stdin:     spec.Stdin,
		Timeout:   spec.Timeout,
		KillGrace: spec.KillGrace,
	}, sink, onLine))
}

func (codexTransport) Version(ctx context.Context, command string) (string, error) {
	return supervisor.Version(ctx, command)
}

type openCodeTransport struct{}

func (openCodeTransport) Run(ctx context.Context, spec opencode.Spec, sink opencode.Sink, onLine func(string)) opencode.Evidence {
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

func (openCodeTransport) Version(ctx context.Context, command string) (string, error) {
	return supervisor.Version(ctx, command)
}

type piTransport struct{}

func (piTransport) Run(ctx context.Context, spec pi.Spec, sink pi.Sink, onLine func(string)) pi.Evidence {
	return pi.Evidence(supervisor.Run(ctx, supervisor.Spec{
		Command:   spec.Command,
		Args:      spec.Args,
		Dir:       spec.Dir,
		Stdin:     spec.Stdin,
		Timeout:   spec.Timeout,
		KillGrace: spec.KillGrace,
	}, sink, onLine))
}

func (piTransport) Version(ctx context.Context, command string) (string, error) {
	return supervisor.Version(ctx, command)
}
