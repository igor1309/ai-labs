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
		if process.Verify.Repairs() && agent.Session != definition.SessionResumable {
			add(subject, "verify.max_attempts %d repairs in the call's session, but agent %s is %s", process.Verify.MaxAttempts, agent.Name, agent.Session)
		}
		mapping, ok := b.Mappings[agent.Runtime]
		if !ok {
			continue // reported on the agent
		}
		if err := planOnSomeVersion(effective, mapping, b.Service.StateReaching); err != nil {
			add(subject, "cannot run on agent %s's runtime %s: %v", agent.Name, mapping.Name, err)
		}
	}

	sort.SliceStable(problems, func(i, j int) bool { return problems[i].Subject < problems[j].Subject })
	return problems
}

// planOnSomeVersion succeeds if the plan can be made for at least one
// version the mapping is verified for: a call runs on one version, so
// primitives verified for different versions cannot be combined. Otherwise
// it explains the failure on the version with the most verified primitives
// (the first, when tied).
func planOnSomeVersion(effective policy.Effective, mapping definition.Mapping, stateReaching []string) error {
	versions := mapping.Versions()
	if len(versions) == 0 {
		versions = []string{""} // nothing verified: reported on the mapping
	}
	var closest error
	most := -1
	for _, version := range versions {
		verified, unverified := mapping.ForVersion(version)
		_, err := enforce.Make(effective.Permissions, verified, effective.Require, stateReaching)
		if err == nil {
			return nil
		}
		if len(verified.Primitives) > most {
			most = len(verified.Primitives)
			closest = fmt.Errorf("%v%s", err, unverifiedNote(unverified, version))
		}
	}
	return closest
}

// PlanProblems reports the processes of the agent that cannot be planned on
// the runtime version it was found to have. Composition problems are left
// to Check.
func PlanProblems(b Bundle, agent definition.Agent, version string) []Problem {
	mapping, ok := b.Mappings[agent.Runtime]
	if !ok || b.Service == nil {
		return nil
	}
	verified, unverified := mapping.ForVersion(version)
	var problems []Problem
	for _, name := range sortedKeys(b.Processes) {
		process := b.Processes[name]
		if process.Agent != agent.Name {
			continue
		}
		var pol *definition.Policy
		if process.Policy != "" {
			found, ok := b.Policies[process.Policy]
			if !ok {
				continue
			}
			pol = &found
		}
		effective, err := policy.Compose(*b.Service, pol, process, policy.Caller{})
		if err != nil {
			continue
		}
		if _, err := enforce.Make(effective.Permissions, verified, effective.Require, b.Service.StateReaching); err != nil {
			problems = append(problems, Problem{Subject: "process " + name, Message: fmt.Sprintf("cannot run on agent %s's runtime %s version %s: %v%s", agent.Name, mapping.Name, version, err, unverifiedNote(unverified, version))})
		}
	}
	return problems
}

// unverifiedNote names the primitives a refused plan could not use.
func unverifiedNote(unverified []string, version string) string {
	if len(unverified) == 0 {
		return ""
	}
	return " (not verified for version " + version + ": " + strings.Join(unverified, ", ") + ")"
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
