package main

import (
	"context"

	"github.com/igor1309/ai-labs/warder/internal/capture"
	"github.com/igor1309/ai-labs/warder/internal/claude"
	"github.com/igor1309/ai-labs/warder/internal/codex"
)

// readClaudeAgents is the Claude Code adapter's read, as a capture's agent
// reader: it translates the agents read into the capture's own.
type readClaudeAgents func(ctx context.Context) ([]claude.Agent, error)

// ReadAgents reads once, under ctx, and returns the agents read as the
// capture's, in their order and with their IDs. A failed read is returned
// as it is, with no agents.
func (read readClaudeAgents) ReadAgents(ctx context.Context) ([]capture.Agent, error) {
	agents, err := read(ctx)
	if err != nil {
		return nil, err
	}
	translated := make([]capture.Agent, 0, len(agents))
	for _, agent := range agents {
		translated = append(translated, capture.Agent{ID: agent.ID, State: captureState(agent.State)})
	}
	return translated, nil
}

// captureState maps working, idle and unknown one to one. Any other state
// is passed on unchanged: rejecting it is the capture's job.
func captureState(state claude.State) capture.State {
	switch state {
	case claude.Working:
		return capture.Working
	case claude.Idle:
		return capture.Idle
	case claude.Unknown:
		return capture.Unknown
	}
	return capture.State(state)
}

// readCodexAgents is the Codex adapter's read, as a capture's agent
// reader: it translates the agents read into the capture's own.
type readCodexAgents func(ctx context.Context) ([]codex.Agent, error)

// ReadAgents reads once, under ctx, and returns the agents read as the
// capture's, in their order and with their IDs. A failed read is returned
// as it is, with no agents.
func (read readCodexAgents) ReadAgents(ctx context.Context) ([]capture.Agent, error) {
	agents, err := read(ctx)
	if err != nil {
		return nil, err
	}
	translated := make([]capture.Agent, 0, len(agents))
	for _, agent := range agents {
		translated = append(translated, capture.Agent{ID: agent.ID, State: codexCaptureState(agent.State)})
	}
	return translated, nil
}

// codexCaptureState maps working, idle and unknown one to one. Any other
// state is passed on unchanged: rejecting it is the capture's job.
func codexCaptureState(state codex.State) capture.State {
	switch state {
	case codex.Working:
		return capture.Working
	case codex.Idle:
		return capture.Idle
	case codex.Unknown:
		return capture.Unknown
	}
	return capture.State(state)
}
