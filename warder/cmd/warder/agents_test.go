package main

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/warder/internal/capture"
	"github.com/igor1309/ai-labs/warder/internal/claude"
	"github.com/igor1309/ai-labs/warder/internal/codex"
)

var (
	_ capture.AgentReader = readClaudeAgents(nil)
	_ capture.AgentReader = readCodexAgents(nil)
)

// The agents read are returned as the capture's, in their order and with
// their IDs: working, idle and unknown mapped one to one, and any other
// state passed on unchanged.
func TestReadClaudeAgentsTranslatesTheAgentsRead(t *testing.T) {
	t.Parallel()
	read := readClaudeAgents(func(context.Context) ([]claude.Agent, error) {
		return []claude.Agent{
			{ID: "session-1", State: claude.Working},
			{ID: "session-2", State: claude.Idle},
			{ID: "session-3", State: claude.Unknown},
			{ID: "session-4", State: claude.State("blocked")},
		}, nil
	})

	got, err := read.ReadAgents(t.Context())

	if err != nil {
		t.Fatal(err)
	}
	want := []capture.Agent{
		{ID: "session-1", State: capture.Working},
		{ID: "session-2", State: capture.Idle},
		{ID: "session-3", State: capture.Unknown},
		{ID: "session-4", State: capture.State("blocked")},
	}
	if !slices.Equal(got, want) {
		t.Errorf("got the agents %v, want %v", got, want)
	}
}

// A read of no agents is an empty set, never nil.
func TestReadClaudeAgentsReturnsNoAgentsAsAnEmptySet(t *testing.T) {
	t.Parallel()
	read := readClaudeAgents(func(context.Context) ([]claude.Agent, error) { return []claude.Agent{}, nil })

	got, err := read.ReadAgents(t.Context())

	if err != nil {
		t.Fatal(err)
	}
	if got == nil || len(got) != 0 {
		t.Errorf("got the agents %#v, want an empty set", got)
	}
}

// The read happens under the caller's context, and a failed read is
// returned as it is, with no agents.
func TestReadClaudeAgentsReturnsAFailedReadAsItIs(t *testing.T) {
	t.Parallel()
	ctx := context.WithValue(t.Context(), contextKey{}, "the caller's")
	failure := errors.New("claude: execute claude agents --json: exit status 1")
	read := readClaudeAgents(func(ctx context.Context) ([]claude.Agent, error) {
		if ctx.Value(contextKey{}) != "the caller's" {
			t.Error("the read was not given the caller's context")
		}
		return []claude.Agent{{ID: "session-1", State: claude.Working}}, failure
	})

	got, err := read.ReadAgents(ctx)

	if err != failure {
		t.Errorf("got the error %v, want %v", err, failure)
	}
	if got != nil {
		t.Errorf("got the agents %v, want none", got)
	}
}

// The Codex agents read are returned as the capture's, in their order and
// with their thread IDs: working, idle and unknown mapped one to one, and
// any other state passed on unchanged.
func TestReadCodexAgentsTranslatesTheAgentsRead(t *testing.T) {
	t.Parallel()
	read := readCodexAgents(func(context.Context) ([]codex.Agent, error) {
		return []codex.Agent{
			{ID: threadWorking, State: codex.Working},
			{ID: threadIdle, State: codex.Idle},
			{ID: threadUnknown, State: codex.Unknown},
			{ID: threadStale, State: codex.State("blocked")},
		}, nil
	})

	got, err := read.ReadAgents(t.Context())

	if err != nil {
		t.Fatal(err)
	}
	want := []capture.Agent{
		{ID: threadWorking, State: capture.Working},
		{ID: threadIdle, State: capture.Idle},
		{ID: threadUnknown, State: capture.Unknown},
		{ID: threadStale, State: capture.State("blocked")},
	}
	if !slices.Equal(got, want) {
		t.Errorf("got the agents %v, want %v", got, want)
	}
}

// A Codex read of no agents is an empty set, never nil.
func TestReadCodexAgentsReturnsNoAgentsAsAnEmptySet(t *testing.T) {
	t.Parallel()
	read := readCodexAgents(func(context.Context) ([]codex.Agent, error) { return []codex.Agent{}, nil })

	got, err := read.ReadAgents(t.Context())

	if err != nil {
		t.Fatal(err)
	}
	if got == nil || len(got) != 0 {
		t.Errorf("got the agents %#v, want an empty set", got)
	}
}

// The Codex read happens under the caller's context, and a failed read is
// returned as it is, with no agents.
func TestReadCodexAgentsReturnsAFailedReadAsItIs(t *testing.T) {
	t.Parallel()
	ctx := context.WithValue(t.Context(), contextKey{}, "the caller's")
	failure := errors.New("codex: list thread-writer-locks: permission denied")
	read := readCodexAgents(func(ctx context.Context) ([]codex.Agent, error) {
		if ctx.Value(contextKey{}) != "the caller's" {
			t.Error("the read was not given the caller's context")
		}
		return []codex.Agent{{ID: threadWorking, State: codex.Working}}, failure
	})

	got, err := read.ReadAgents(ctx)

	if err != failure {
		t.Errorf("got the error %v, want %v", err, failure)
	}
	if got != nil {
		t.Errorf("got the agents %v, want none", got)
	}
}
