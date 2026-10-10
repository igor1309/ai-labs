// Package policy composes a call's effective limits. Limits only narrow:
// service ⊇ process ⊇ caller (ADR-030 rule 4). Widening is rejected, never
// clamped, and every violation is reported at once.
package policy

import (
	"fmt"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Caller holds the overrides a caller may apply. They may only narrow.
type Caller struct {
	Timeout    *time.Duration
	MaxCostUSD *float64
}

// Effective is a call's composed limits.
type Effective struct {
	Timeout     time.Duration
	MaxAttempts int
	MaxCostUSD  *float64 // unset: no cost limit
	Allow       []string
	Deny        []string
	Permissions []string // allowed and not denied
	Require     []string
	Access      string
	Scope       string
	// Stale are the staleness limits; each unset one ends nothing.
	Stale Stale
}

// Stale are a call's composed staleness limits: what ends it before its
// timeout because it stopped moving. Each is unset unless a layer declares
// it.
type Stale struct {
	// NoEvent is how long an agent turn may go without a runtime event.
	NoEvent *time.Duration
	// NoOutput is how long a verification run may go without output.
	NoOutput *time.Duration
	// ToolCommand is how long one command an agent's tool runs may take.
	ToolCommand *time.Duration
	// RepeatedToolCalls is how many identical tool calls in a row end the
	// turn.
	RepeatedToolCalls *int
	// Recover is what may follow a turn that one of them ended.
	Recover Recover
}

// Recover is a call's composed recovery of a stale turn (ADR-024 rule 5).
// It is zero unless the call has a budget: without one nothing is told.
type Recover struct {
	// MaxResumes is how many recovery turns the call may take; 0: none.
	MaxResumes int
	// Instruction is what the agent is told with the evidence; set
	// whenever MaxResumes is above 0.
	Instruction string
}

// InvalidError lists every composition problem.
type InvalidError struct {
	Process  string
	Problems []string
}

func (e *InvalidError) Error() string {
	return fmt.Sprintf("process %s is invalid:\n  %s", e.Process, strings.Join(e.Problems, "\n  "))
}

// Compose composes the effective limits of a call of process: its own,
// within the service's ceilings, narrowed by the caller (ADR-030 rule 4).
func Compose(service definition.Service, process definition.Process, caller Caller) (Effective, error) {
	var problems []string
	add := func(format string, args ...any) { problems = append(problems, fmt.Sprintf(format, args...)) }

	own := process.Limits

	vocabulary := func(field string, names []string) {
		for _, name := range names {
			if !contains(service.Permissions, name) {
				add("%s: unknown permission %q", field, name)
			}
		}
	}
	vocabulary("tools.allow", own.Allow)
	vocabulary("isolation.deny", own.Deny)
	vocabulary("tools.require", process.Require)

	timeout := own.Timeout
	if timeout == nil {
		add("timeout: the process sets none")
		timeout = &service.MaxTimeout
	}
	if *timeout > service.MaxTimeout {
		add("timeout %s exceeds the service limit %s", *timeout, service.MaxTimeout)
	}
	// A staleness limit ends a call before its timeout, so one above the
	// timeout the process declares is invalid. A caller's shorter timeout
	// only leaves it without effect.
	stale := ownStale(add, own.Stale)
	for _, limit := range []struct {
		field string
		value *time.Duration
	}{{"stale.no_event", stale.NoEvent}, {"stale.no_output", stale.NoOutput}, {"stale.tool_command", stale.ToolCommand}} {
		if limit.value != nil && *limit.value > *timeout {
			add("%s %s exceeds the timeout %s", limit.field, *limit.value, *timeout)
		}
	}
	if caller.Timeout != nil {
		if *caller.Timeout > *timeout {
			add("caller timeout %s widens the effective %s", *caller.Timeout, *timeout)
		} else {
			timeout = caller.Timeout
		}
	}

	// A verification run is bounded by its own timeout inside the call's,
	// so the call's may not be the shorter; its attempts, by the service's
	// ceiling. Either is invalid, never clamped.
	if verify := process.Verify; verify != nil {
		if verify.Timeout > *timeout {
			add("verify.timeout %s exceeds the effective timeout %s", verify.Timeout, *timeout)
		}
		if verify.MaxAttempts > service.MaxVerifyAttempts {
			add("verify.max_attempts %d exceeds the service limit max_verify_attempts %d", verify.MaxAttempts, service.MaxVerifyAttempts)
		}
	}

	cost := narrowCost(add, service, own.MaxCostUSD, caller.MaxCostUSD)

	attempts := 1
	if own.MaxAttempts != nil {
		attempts = *own.MaxAttempts
	}
	if attempts > service.MaxAttempts {
		add("retry.max_attempts %d exceeds the service limit %d", attempts, service.MaxAttempts)
	}

	// A process holds its own access, read-only when it sets none.
	access := own.Access
	if access == "" {
		access = "read-only"
	}

	// The scope is what the agent works on: the candidate, the revision the
	// process pins, or the repository as it is. workspace.revision decides
	// it; a declared scope must agree.
	scope := own.Scope
	switch {
	case scope == "" && process.Revision != "":
		scope = "candidate"
	case scope == "":
		scope = "repository"
	case scope == "candidate" && process.Revision == "":
		add("workspace.scope candidate requires workspace.revision")
	case scope == "repository" && process.Revision != "":
		add("workspace.scope repository conflicts with workspace.revision, which pins a revision")
	}

	deny := union(own.Deny)
	if access == "read-only" {
		deny = union(deny, service.Writing)
	}
	permissions := subtract(own.Allow, deny)
	for _, name := range process.Require {
		if !contains(permissions, name) {
			add("tools.require: %s is not an effective permission", name)
		}
	}

	if len(problems) > 0 {
		return Effective{}, &InvalidError{Process: process.Name, Problems: problems}
	}
	return Effective{
		Timeout:     *timeout,
		MaxAttempts: attempts,
		MaxCostUSD:  cost,
		Allow:       nonNil(own.Allow),
		Deny:        nonNil(deny),
		Permissions: nonNil(permissions),
		Require:     process.Require,
		Access:      access,
		Scope:       scope,
		Stale:       stale,
	}, nil
}

// ownStale are the staleness limits the process declares, each unset
// unless it sets it.
func ownStale(add func(string, ...any), own definition.Stale) Stale {
	return Stale{
		NoEvent:           own.NoEvent,
		NoOutput:          own.NoOutput,
		ToolCommand:       own.ToolCommand,
		RepeatedToolCalls: own.RepeatedToolCalls,
		Recover:           ownRecover(add, own.Recover),
	}
}

// ownRecover is the recovery of a stale call the process declares (ADR-024
// rule 5, as ADR-030 rule 4 amends it): unset is 0, and a budget above 0
// needs an instruction.
func ownRecover(add func(string, ...any), own definition.Recover) Recover {
	if own.MaxResumes == nil || *own.MaxResumes == 0 {
		return Recover{}
	}
	resumes := *own.MaxResumes
	if own.Instruction == "" {
		add("stale.recover.max_resumes %d needs stale.recover.instruction: the process gives none", resumes)
	}
	return Recover{MaxResumes: resumes, Instruction: own.Instruction}
}

// narrowCost composes the cost limit. Unlike timeout it may stay unset,
// but once the service or the process sets it, those after may only lower
// it.
func narrowCost(add func(string, ...any), service definition.Service, own, caller *float64) *float64 {
	limit := service.MaxCostUSD
	for _, layer := range []struct {
		name  string
		value *float64
	}{{"the process", own}, {"the caller", caller}} {
		if layer.value == nil {
			continue
		}
		if limit != nil && *layer.value > *limit {
			add("max_cost_usd: %s sets %g, which widens %g", layer.name, *layer.value, *limit)
			continue
		}
		limit = layer.value
	}
	return limit
}

func hasValue(values []definition.Value, name string) bool {
	for _, value := range values {
		if value.Name == name {
			return true
		}
	}
	return false
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

func union(lists ...[]string) []string {
	var out []string
	for _, list := range lists {
		for _, item := range list {
			if !contains(out, item) {
				out = append(out, item)
			}
		}
	}
	return out
}

func subtract(list, remove []string) []string {
	var out []string
	for _, item := range list {
		if !contains(remove, item) {
			out = append(out, item)
		}
	}
	return out
}

func nonNil(list []string) []string {
	if list == nil {
		return []string{}
	}
	return list
}
