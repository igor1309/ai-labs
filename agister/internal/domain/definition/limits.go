package definition

import (
	"time"

	"gopkg.in/yaml.v3"
)

// Limits are the execution fields shared by policies and processes. In a
// policy they are defaults; in a process, overrides that may only narrow.
type Limits struct {
	Timeout     *time.Duration `json:"timeout,omitempty"`
	MaxAttempts *int           `json:"max_attempts,omitempty"`
	MaxCostUSD  *float64       `json:"max_cost_usd,omitempty"`
	Allow       []string       `json:"allow,omitempty"`
	AllowSet    bool           `json:"-"`
	Deny        []string       `json:"deny,omitempty"`
	Access      string         `json:"access,omitempty"` // read-only | read-write
	Scope       string         `json:"scope,omitempty"`  // candidate | repository
}

var limitKeys = []string{"timeout", "max_cost_usd", "retry", "tools", "workspace", "isolation", "resources", "artifacts"}

func parseLimits(values map[string]*yaml.Node, toolKeys, workspaceKeys []string, p *problems) (Limits, map[string]*yaml.Node, map[string]*yaml.Node) {
	var limits Limits
	if node, ok := values["timeout"]; ok {
		if text, ok := scalar(node, "timeout", p); ok {
			if value, ok := duration(text, "timeout", p); ok {
				limits.Timeout = &value
			}
		}
	}
	if node, ok := values["max_cost_usd"]; ok {
		if value, ok := number(node, "max_cost_usd", p); ok {
			if value <= 0 {
				p.add("max_cost_usd", "must be positive")
			} else {
				limits.MaxCostUSD = &value
			}
		}
	}
	if node, ok := values["retry"]; ok {
		retry := fields(node, "retry", []string{"max_attempts"}, p)
		if attempts, ok := integer(retry["max_attempts"], "retry.max_attempts", p); ok {
			if attempts < 1 {
				p.add("retry.max_attempts", "must be at least 1")
			} else {
				limits.MaxAttempts = &attempts
			}
		}
	}
	tools := fields(values["tools"], "tools", toolKeys, p)
	if node, ok := tools["allow"]; ok {
		limits.Allow = stringList(node, "tools.allow", p)
		limits.AllowSet = true
	}
	if node, ok := values["isolation"]; ok {
		isolation := fields(node, "isolation", []string{"deny"}, p)
		limits.Deny = stringList(isolation["deny"], "isolation.deny", p)
	}
	workspace := fields(values["workspace"], "workspace", workspaceKeys, p)
	if node, ok := workspace["access"]; ok {
		limits.Access, _ = scalar(node, "workspace.access", p)
		if limits.Access != "read-only" && limits.Access != "read-write" {
			p.add("workspace.access", `must be "read-only" or "read-write"`)
		}
	}
	if node, ok := workspace["scope"]; ok {
		limits.Scope, _ = scalar(node, "workspace.scope", p)
		if limits.Scope != "candidate" && limits.Scope != "repository" {
			p.add("workspace.scope", `must be "candidate" or "repository"`)
		}
	}
	// Reserving resources and retaining artifacts need the service; a
	// field Agister would silently ignore is refused.
	for _, field := range []string{"resources", "artifacts"} {
		if _, ok := values[field]; ok {
			p.add(field, "not supported yet: Agister would not enforce it")
		}
	}
	return limits, tools, workspace
}
