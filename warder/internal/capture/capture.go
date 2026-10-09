// Package capture is warder's observation capture: for one source, it
// reads the normalized agent set through the reader it is given, checks it
// against the common model, timestamps it with the clock it is given and
// assembles one complete observation.
package capture

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"time"
)

// State is what an agent was doing when it was read.
type State string

const (
	Working State = "working"
	Idle    State = "idle"
	// Unknown is the state of an agent that could not be classified during
	// a successful read.
	Unknown State = "unknown"
)

// Agent is one agent a source reported. Its ID is opaque: nonempty, unique
// within its observation, and compared as given.
type Agent struct {
	ID    string
	State State
}

// Observation is one successful read of a source: the complete set of
// agents it reported, in the order read, and when the read completed, in
// UTC.
type Observation struct {
	Source     string
	ObservedAt time.Time
	Agents     []Agent
}

// AgentReader reads the complete, normalized set of a source's agents,
// ends the read when ctx is done, and returns the set or an error.
type AgentReader interface {
	ReadAgents(ctx context.Context) ([]Agent, error)
}

// Clock tells the current wall-clock time.
type Clock interface {
	Now() time.Time
}

// Capturer captures the observations of one source through the reader and
// the clock it is given. It reads no runtime and no time of its own.
type Capturer struct {
	source string
	reader AgentReader
	clock  Clock
}

// New returns a capturer of the source with the ID source, which reads
// through reader and takes the time from clock. An empty source is
// missing, and so is a nil reader or clock, or a nil pointer, map, slice,
// func or chan carried as one.
func New(source string, reader AgentReader, clock Clock) (*Capturer, error) {
	if source == "" {
		return nil, errors.New("capture: no source ID")
	}
	if reader == nil || isNil(reflect.ValueOf(reader)) {
		return nil, errors.New("capture: no agent reader")
	}
	if clock == nil || isNil(reflect.ValueOf(clock)) {
		return nil, errors.New("capture: no clock")
	}
	return &Capturer{source: source, reader: reader, clock: clock}, nil
}

func isNil(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan, reflect.Interface, reflect.UnsafePointer:
		return value.IsNil()
	}
	return false
}

// Capture reads the agents once, under ctx, and returns the observation of
// what was read: the source, the agents in the order read, in a slice of
// its own that is empty and never nil when none was read, and the clock's
// time, in UTC. The capture fails as a whole, with no observation and the
// clock not read, when the read fails, ctx's end included, or when what
// was read is outside the common model: an agent with an empty ID, two
// agents with one ID, or a state that is not working, idle or unknown.
func (c *Capturer) Capture(ctx context.Context) (Observation, error) {
	read, err := c.reader.ReadAgents(ctx)
	if err != nil {
		return Observation{}, fmt.Errorf("capture: read agents: %w", err)
	}
	agents, err := checked(read)
	if err != nil {
		return Observation{}, fmt.Errorf("capture: invalid read: %w", err)
	}
	// Only now: observedAt is when the complete read succeeded.
	observedAt := c.clock.Now().UTC()
	return Observation{Source: c.source, ObservedAt: observedAt, Agents: agents}, nil
}

// checked is a copy of the agents read, or what puts the first of them
// that is outside the common model there, by its index.
func checked(read []Agent) ([]Agent, error) {
	// Never nil, so a read of no agents is an empty set.
	agents := make([]Agent, 0, len(read))
	seen := map[string]int{} // each ID's agent
	for i, agent := range read {
		if agent.ID == "" {
			return nil, fmt.Errorf("agent %d has an empty ID", i)
		}
		if first, ok := seen[agent.ID]; ok {
			return nil, fmt.Errorf("agents %d and %d share the ID %q", first, i, agent.ID)
		}
		seen[agent.ID] = i
		switch agent.State {
		case Working, Idle, Unknown:
		default:
			return nil, fmt.Errorf("agent %d has the state %q, not working, idle or unknown", i, agent.State)
		}
		agents = append(agents, agent)
	}
	return agents, nil
}
