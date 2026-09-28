// Package policy composes a call's effective limits. Limits only narrow:
// service ⊇ policy ⊇ process ⊇ caller. Widening is rejected, never clamped,
// and every violation is reported at once.
package policy

import (
	"fmt"
	"strings"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// Caller holds the overrides a caller may apply. They may only narrow.
type Caller struct {
	Timeout *time.Duration
}

// Effective is a call's composed limits.
type Effective struct {
	Timeout     time.Duration           `json:"timeout"`
	MaxAttempts int                     `json:"max_attempts"`
	Allow       []string                `json:"allow"`
	Deny        []string                `json:"deny"`
	Permissions []string                `json:"permissions"` // allowed and not denied
	Require     []string                `json:"require,omitempty"`
	Access      string                  `json:"access"`
	Scope       string                  `json:"scope"`
	Resources   []string                `json:"resources,omitempty"`
	Retain      []string                `json:"retain,omitempty"`
	Constraints []definition.Constraint `json:"constraints,omitempty"`
}

// InvalidError lists every composition problem.
type InvalidError struct {
	Process  string
	Problems []string
}

func (e *InvalidError) Error() string {
	return fmt.Sprintf("process %s is invalid:\n  %s", e.Process, strings.Join(e.Problems, "\n  "))
}

// Compose narrows service, policy, process and caller into effective limits.
func Compose(service definition.Service, pol *definition.Policy, process definition.Process, caller Caller) (Effective, error) {
	var problems []string
	add := func(format string, args ...any) { problems = append(problems, fmt.Sprintf(format, args...)) }

	base := definition.Limits{}
	origin := "the service"
	if pol != nil {
		base = pol.Limits
		origin = "policy " + pol.Name
	}
	over := process.Limits

	vocabulary := func(field string, names []string) {
		for _, name := range names {
			if !contains(service.Permissions, name) {
				add("%s: unknown permission %q", field, name)
			}
		}
	}
	vocabulary("policy tools.allow", base.Allow)
	vocabulary("policy isolation.deny", base.Deny)
	vocabulary("tools.allow", over.Allow)
	vocabulary("isolation.deny", over.Deny)
	vocabulary("tools.require", process.Require)

	// The policy must lie within the service limits.
	if base.Timeout != nil && *base.Timeout > service.MaxTimeout {
		add("%s: timeout %s exceeds the service limit %s", origin, *base.Timeout, service.MaxTimeout)
	}
	if base.MaxAttempts != nil && *base.MaxAttempts > service.MaxAttempts {
		add("%s: retry.max_attempts %d exceeds the service limit %d", origin, *base.MaxAttempts, service.MaxAttempts)
	}

	timeout := narrowDuration(add, "timeout", base.Timeout, over.Timeout)
	if timeout == nil {
		add("timeout: neither the process nor its policy sets one")
		timeout = &service.MaxTimeout
	}
	if *timeout > service.MaxTimeout {
		add("timeout %s exceeds the service limit %s", *timeout, service.MaxTimeout)
	}
	if caller.Timeout != nil {
		if *caller.Timeout > *timeout {
			add("caller timeout %s widens the effective %s", *caller.Timeout, *timeout)
		} else {
			timeout = caller.Timeout
		}
	}

	attempts := 1
	if value := narrowInt(add, "retry.max_attempts", base.MaxAttempts, over.MaxAttempts); value != nil {
		attempts = *value
	}
	if attempts > service.MaxAttempts {
		add("retry.max_attempts %d exceeds the service limit %d", attempts, service.MaxAttempts)
	}

	allow := base.Allow
	if over.AllowSet {
		if pol != nil && base.AllowSet {
			for _, name := range over.Allow {
				if !contains(base.Allow, name) {
					add("tools.allow: adds %s, which %s does not allow", name, origin)
				}
			}
			allow = intersect(over.Allow, base.Allow)
		} else {
			allow = over.Allow
		}
	}

	access := base.Access
	if access == "" {
		access = "read-only"
	}
	if over.Access != "" {
		if access == "read-only" && over.Access == "read-write" {
			add("workspace.access: read-write widens %s's read-only", origin)
		} else {
			access = over.Access
		}
	}

	scope := base.Scope
	if over.Scope != "" {
		if scope != "" && scope != over.Scope {
			add("workspace.scope: %s differs from %s's %s; scope cannot be overridden", over.Scope, origin, scope)
		} else {
			scope = over.Scope
		}
	}
	if scope == "" {
		scope = "repository"
	}
	if scope == "candidate" && process.Checkout == "" {
		add("workspace.scope candidate requires workspace.checkout")
	}

	constraints := append([]definition.Constraint(nil), base.Constraints...)
	for _, constraint := range over.Constraints {
		if hasSubject(constraints, constraint.Subject) {
			add("constraints.%s: already set by %s; constraints can only be added", constraint.Subject, origin)
			continue
		}
		constraints = append(constraints, constraint)
	}
	for _, constraint := range constraints {
		if !hasValue(process.Values, constraint.CandidateInput) {
			add("constraints.%s: refers to input.%s, which process %s does not declare", constraint.Subject, constraint.CandidateInput, process.Name)
		}
	}

	deny := union(base.Deny, over.Deny)
	if access == "read-only" {
		deny = union(deny, []string{"repository.write", "repository.history.write"})
	}
	// Keep only names in the vocabulary: the read-only denials name
	// permissions a vocabulary may not define.
	deny = intersect(deny, service.Permissions)
	permissions := subtract(allow, deny)
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
		Allow:       nonNil(allow),
		Deny:        nonNil(deny),
		Permissions: nonNil(permissions),
		Require:     process.Require,
		Access:      access,
		Scope:       scope,
		Resources:   union(base.Resources, over.Resources),
		Retain:      union(base.Retain, over.Retain),
		Constraints: constraints,
	}, nil
}

func narrowDuration(add func(string, ...any), field string, base, over *time.Duration) *time.Duration {
	if over == nil {
		return base
	}
	if base != nil && *over > *base {
		add("%s: %s widens the policy's %s", field, *over, *base)
		return base
	}
	return over
}

func narrowInt(add func(string, ...any), field string, base, over *int) *int {
	if over == nil {
		return base
	}
	if base != nil && *over > *base {
		add("%s: %d widens the policy's %d", field, *over, *base)
		return base
	}
	return over
}

func hasSubject(constraints []definition.Constraint, subject string) bool {
	for _, constraint := range constraints {
		if constraint.Subject == subject {
			return true
		}
	}
	return false
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

func intersect(list, with []string) []string {
	var out []string
	for _, item := range list {
		if contains(with, item) && !contains(out, item) {
			out = append(out, item)
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
