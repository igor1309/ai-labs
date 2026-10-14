package main

import (
	"github.com/igor1309/ai-labs/warder/internal/capture"
	"github.com/igor1309/ai-labs/warder/internal/jsonl"
)

// publishJSONL is the JSONL publisher's publish, as an attempt's publisher
// of capture observations: it translates each observation into the
// publisher's own. Every source is given the one shared publisher's.
type publishJSONL func(observation jsonl.Observation) error

// Publish publishes the observation, its source, time and agents as
// captured, and returns the publisher's error as it is.
func (publish publishJSONL) Publish(observation capture.Observation) error {
	agents := make([]jsonl.Agent, 0, len(observation.Agents))
	for _, agent := range observation.Agents {
		agents = append(agents, jsonl.Agent{ID: agent.ID, State: string(agent.State)})
	}
	return publish(jsonl.Observation{
		Source:     observation.Source,
		ObservedAt: observation.ObservedAt,
		Agents:     agents,
	})
}
