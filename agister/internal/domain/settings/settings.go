// Package settings checks a whole set of parsed definitions for consistency:
// references resolve, limits compose, every process can be enforced on its
// agent's runtime. It reports every problem at once.
package settings

import (
	"fmt"
	"sort"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

// Bundle is every definition that parsed.
type Bundle struct {
	Service   *definition.Service
	Agents    map[string]definition.Agent
	Processes map[string]definition.Process
	Policies  map[string]definition.Policy
	Mappings  map[string]definition.Mapping
	Schemas   map[string]bool
}

// Mechanisms are what the code provides, named by settings.
type Mechanisms struct {
	Sources  []string // input source kinds
	Adapters []string // runtime adapters
}

// Problem is one inconsistency, attributed to a definition.
type Problem struct {
	Subject string
	Message string
}

func (p Problem) String() string { return p.Subject + ": " + p.Message }

// Check returns every problem in the bundle, sorted by subject.
func Check(b Bundle, m Mechanisms) []Problem {
	var problems []Problem
	add := func(subject, format string, args ...any) {
		problems = append(problems, Problem{Subject: subject, Message: fmt.Sprintf(format, args...)})
	}
	if b.Service == nil {
		add("service", "service settings are missing")
		return problems
	}
	vocabulary := b.Service.Permissions

	for _, name := range sortedKeys(b.Mappings) {
		mapping := b.Mappings[name]
		subject := "runtime mapping " + name
		if !contains(m.Adapters, mapping.Adapter) {
			add(subject, "unknown adapter %q (available: %s)", mapping.Adapter, strings.Join(m.Adapters, ", "))
		}
		if unknown := mapping.UnknownPermissions(vocabulary); len(unknown) > 0 {
			add(subject, "grants permissions not in the vocabulary: %s", strings.Join(unknown, ", "))
		}
		if verified, _ := mapping.ForAnyVersion(); len(verified.Primitives) == 0 {
			add(subject, "verifies no primitive against any runtime version; calls on it are refused")
		}
	}

	for _, name := range sortedKeys(b.Agents) {
		agent := b.Agents[name]
		subject := "agent " + name
		mapping, ok := b.Mappings[agent.Runtime]
		if !ok {
			add(subject, "runtime mapping %q does not exist", agent.Runtime)
			continue
		}
		if agent.Effort != "" && !contains(mapping.Efforts, agent.Effort) {
			add(subject, "effort %q is not supported by %s (supported: %s)", agent.Effort, mapping.Name, strings.Join(mapping.Efforts, ", "))
		}
	}

	for _, name := range sortedKeys(b.Policies) {
		limits := b.Policies[name].Limits
		for _, permission := range append(append([]string{}, limits.Allow...), limits.Deny...) {
			if !contains(vocabulary, permission) {
				add("policy "+name, "unknown permission %q", permission)
			}
		}
	}

	for _, name := range sortedKeys(b.Processes) {
		process := b.Processes[name]
		subject := "process " + name
		for _, value := range process.Values {
			if !contains(m.Sources, value.Source) {
				add(subject, "input %s: unknown source %q (available: %s)", value.Name, value.Source, strings.Join(m.Sources, ", "))
			}
		}
		if process.Output.Format == "json" && !b.Schemas[process.Output.Schema] {
			add(subject, "output schema %q does not exist", process.Output.Schema)
		}
		var pol *definition.Policy
		if process.Policy != "" {
			found, ok := b.Policies[process.Policy]
			if !ok {
				add(subject, "policy %q does not exist", process.Policy)
				continue
			}
			pol = &found
		}
		effective, err := policy.Compose(*b.Service, pol, process, policy.Caller{})
		if err != nil {
			add(subject, "%v", strings.TrimPrefix(err.Error(), "process "+name+" is invalid:\n  "))
			continue
		}
		agent, ok := b.Agents[process.Agent]
		if !ok {
			add(subject, "agent %q does not exist", process.Agent)
			continue
		}
		if len(effective.Constraints) > 0 && agent.ModelFamily == "" {
			add(subject, "constrains the model family, but agent %s declares none", agent.Name)
		}
		mapping, ok := b.Mappings[agent.Runtime]
		if !ok {
			continue // reported on the agent
		}
		verified, unverified := mapping.ForAnyVersion()
		if _, err := enforce.Make(effective.Permissions, verified, effective.Require, b.Service.StateReaching); err != nil {
			add(subject, "cannot run on agent %s's runtime %s: %v%s", agent.Name, mapping.Name, err, unverifiedNote(unverified))
		}
	}

	sort.SliceStable(problems, func(i, j int) bool { return problems[i].Subject < problems[j].Subject })
	return problems
}

// unverifiedNote names the primitives a refused plan could not use.
func unverifiedNote(unverified []string) string {
	if len(unverified) == 0 {
		return ""
	}
	return " (verified for no runtime version: " + strings.Join(unverified, ", ") + ")"
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}
