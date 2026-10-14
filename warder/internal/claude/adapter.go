// Package claude is warder's Claude Code runtime adapter: it reads Claude
// Code's active sessions, interactive and background, through
// `claude agents --json` and normalizes them to agent IDs and states.
package claude

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"unicode/utf8"
)

// State is what an agent was doing when it was read.
type State string

const (
	Working State = "working"
	Idle    State = "idle"
	// Unknown is the state of a session that is neither known to work nor
	// known to be idle.
	Unknown State = "unknown"
)

// Agent is one active Claude Code session. Its ID is the session's ID, so
// a session that survives a monitor restart keeps its identity.
type Agent struct {
	ID    string
	State State
}

// CommandExecutor executes a command, ends it when ctx is done, and
// returns what the command wrote to its standard output, or an error.
type CommandExecutor interface {
	Execute(ctx context.Context, name string, args ...string) (stdout []byte, err error)
}

// Adapter reads Claude Code's sessions through the executor it is given.
// It starts no process of its own.
type Adapter struct {
	executor CommandExecutor
}

// New returns an adapter that executes through executor. A nil executor,
// or a nil pointer, map, slice, func or chan carried as one, is missing.
func New(executor CommandExecutor) (*Adapter, error) {
	if executor == nil || isNil(reflect.ValueOf(executor)) {
		return nil, errors.New("claude: no command executor")
	}
	return &Adapter{executor: executor}, nil
}

func isNil(value reflect.Value) bool {
	switch value.Kind() {
	case reflect.Pointer, reflect.Map, reflect.Slice, reflect.Func, reflect.Chan, reflect.Interface, reflect.UnsafePointer:
		return value.IsNil()
	}
	return false
}

// ReadAgents executes `claude agents --json` once, under ctx, and returns
// one agent per session it reports, in its order: the complete set, empty
// and never nil when no session is active. The read fails as a whole, with
// no agents, when the command fails, ctx's end included, or when its
// output is not valid UTF-8 or not one JSON array of sessions, each with
// its own nonempty sessionId.
func (a *Adapter) ReadAgents(ctx context.Context) ([]Agent, error) {
	// Observed on Claude Code 2.1.295: needs no TTY, exits 0 and prints one
	// JSON array.
	output, err := a.executor.Execute(ctx, "claude", "agents", "--json")
	if err != nil {
		return nil, fmt.Errorf("claude: execute claude agents --json: %w", err)
	}
	agents, err := parse(output)
	if err != nil {
		return nil, fmt.Errorf("claude: output of claude agents --json: %w", err)
	}
	return agents, nil
}

func parse(output []byte) ([]Agent, error) {
	// Before decoding: encoding/json replaces an invalid byte in a string
	// instead of failing, which would change a sessionId.
	if !utf8.Valid(output) {
		return nil, errors.New("not valid UTF-8")
	}
	var elements []json.RawMessage
	if err := json.Unmarshal(output, &elements); err != nil {
		return nil, fmt.Errorf("not one JSON array: %w", err)
	}
	if elements == nil {
		return nil, errors.New("not one JSON array: null")
	}
	// Never nil, so a read of no sessions is an empty set.
	agents := make([]Agent, 0, len(elements))
	seen := map[string]int{} // each sessionId's element
	for i, element := range elements {
		var session map[string]json.RawMessage
		if err := json.Unmarshal(element, &session); err != nil || session == nil {
			return nil, fmt.Errorf("element %d is not a JSON object", i)
		}
		value, ok := session["sessionId"]
		if !ok {
			return nil, fmt.Errorf("element %d has no sessionId", i)
		}
		id, ok := text(value)
		if !ok {
			return nil, fmt.Errorf("element %d has a sessionId that is not a string", i)
		}
		if id == "" {
			return nil, fmt.Errorf("element %d has an empty sessionId", i)
		}
		if first, ok := seen[id]; ok {
			return nil, fmt.Errorf("elements %d and %d share the sessionId %q", first, i, id)
		}
		seen[id] = i
		agents = append(agents, Agent{ID: id, State: stateOf(session)})
	}
	return agents, nil
}

// stateOf maps only the shapes observed: a session with a status, busy or
// idle, and no state. Everything else is unknown: a background session's
// state, blocked included; another status; neither. A session with both a
// state and a status is unknown too, whatever they say: that shape was not
// observed, so its status is not taken for the session's state.
func stateOf(session map[string]json.RawMessage) State {
	if _, ok := session["state"]; ok {
		return Unknown
	}
	status, _ := text(session["status"])
	switch status {
	case "busy":
		return Working
	case "idle":
		return Idle
	}
	return Unknown
}

// text is the string a JSON value is, and whether it is one: null and a
// missing value are not.
func text(value json.RawMessage) (string, bool) {
	var s *string
	if err := json.Unmarshal(value, &s); err != nil || s == nil {
		return "", false
	}
	return *s, true
}
