package main

import (
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/warder/internal/attempt"
	"github.com/igor1309/ai-labs/warder/internal/capture"
	"github.com/igor1309/ai-labs/warder/internal/jsonl"
)

var _ attempt.Publisher[capture.Observation] = publishJSONL(nil)

// The observation is published once, as the publisher's own: its source,
// its time and its agents, in their order, as captured.
func TestPublishJSONLTranslatesTheObservation(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 10, 9, 8, 28, 10, 0, time.UTC)
	var published []jsonl.Observation
	publish := publishJSONL(func(observation jsonl.Observation) error {
		published = append(published, observation)
		return nil
	})

	err := publish.Publish(capture.Observation{
		Source:     "claude-main",
		ObservedAt: at,
		Agents: []capture.Agent{
			{ID: "session-1", State: capture.Working},
			{ID: "session-2", State: capture.Idle},
			{ID: "session-3", State: capture.Unknown},
		},
	})

	if err != nil {
		t.Fatal(err)
	}
	if len(published) != 1 {
		t.Fatalf("published %d observations, want 1", len(published))
	}
	got := published[0]
	if got.Source != "claude-main" || !got.ObservedAt.Equal(at) {
		t.Errorf("got the source %q at %v, want %q at %v", got.Source, got.ObservedAt, "claude-main", at)
	}
	want := []jsonl.Agent{
		{ID: "session-1", State: "working"},
		{ID: "session-2", State: "idle"},
		{ID: "session-3", State: "unknown"},
	}
	if !slices.Equal(got.Agents, want) {
		t.Errorf("got the agents %v, want %v", got.Agents, want)
	}
}

// The publisher's error is returned as it is.
func TestPublishJSONLReturnsThePublishersError(t *testing.T) {
	t.Parallel()
	failure := errors.New("jsonl: write record: the pipe is closed")
	publish := publishJSONL(func(jsonl.Observation) error { return failure })

	if err := publish.Publish(capture.Observation{Source: "claude-main"}); err != failure {
		t.Errorf("got the error %v, want %v", err, failure)
	}
}
