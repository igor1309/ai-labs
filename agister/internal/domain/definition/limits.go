package definition

import (
	"regexp"
	"strings"
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
	Constraints []Constraint   `json:"constraints,omitempty"`
}

// Constraint requires the agent's model family to differ from that of the
// agent that wrote a revision, as recorded by Agister's own provenance.
type Constraint struct {
	Subject        string `json:"subject"`
	CandidateInput string `json:"candidate_input"`
	// OnUnknown decides the result when no provenance exists: "fail"
	// (default) or "pass". Missing provenance is never satisfaction by itself.
	OnUnknown string `json:"on_unknown"`
}

const ModelFamilySubject = "agent.model_family"

var limitKeys = []string{"timeout", "max_cost_usd", "retry", "tools", "workspace", "isolation", "resources", "artifacts", "constraints"}

var provenanceExpression = regexp.MustCompile(`^evidence\.candidate\(input\.([a-z_][a-z0-9_]*)\)\.provenance\.writer\.model_family$`)

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
	// field Agister would silently ignore is refused (deferred item 6).
	for _, field := range []string{"resources", "artifacts"} {
		if _, ok := values[field]; ok {
			p.add(field, "not supported yet: Agister would not enforce it")
		}
	}
	for _, entry := range mapping(values["constraints"], "constraints", p) {
		if constraint, ok := parseConstraint(entry, p); ok {
			limits.Constraints = append(limits.Constraints, constraint)
		}
	}
	return limits, tools, workspace
}

func parseConstraint(entry pair, p *problems) (Constraint, bool) {
	field := "constraints." + entry.key
	if entry.key != ModelFamilySubject {
		p.add(field, "unsupported constraint subject (supported: %s)", ModelFamilySubject)
		return Constraint{}, false
	}
	rule := fields(entry.value, field, []string{"not_equal", "on_unsatisfied", "on_unknown"}, p)
	expression, _ := scalar(rule["not_equal"], field+".not_equal", p)
	match := provenanceExpression.FindStringSubmatch(strings.TrimSpace(expression))
	if match == nil {
		p.add(field+".not_equal", "supported form: evidence.candidate(input.<name>).provenance.writer.model_family")
		return Constraint{}, false
	}
	if value, _ := scalar(rule["on_unsatisfied"], field+".on_unsatisfied", p); value != "fail" {
		p.add(field+".on_unsatisfied", `must be "fail"`)
	}
	onUnknown := "fail"
	if node, ok := rule["on_unknown"]; ok {
		onUnknown, _ = scalar(node, field+".on_unknown", p)
		if onUnknown != "fail" && onUnknown != "pass" {
			p.add(field+".on_unknown", `must be "fail" or "pass"`)
		}
	}
	return Constraint{Subject: ModelFamilySubject, CandidateInput: match[1], OnUnknown: onUnknown}, true
}
