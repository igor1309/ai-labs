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
	Stale       Stale          `json:"stale"`
}

// Stale are the staleness limits: what ends a call before its timeout
// because it stopped moving, not because it is slow. Each is unset unless
// declared; an unset one ends nothing.
type Stale struct {
	// NoEvent is how long an agent turn may go without a runtime event.
	NoEvent *time.Duration `json:"no_event,omitempty"`
	// NoOutput is how long a verification run may go without output.
	NoOutput *time.Duration `json:"no_output,omitempty"`
	// ToolCommand is how long one command an agent's tool runs may take.
	ToolCommand *time.Duration `json:"tool_command,omitempty"`
	// RepeatedToolCalls is how many identical tool calls in a row end the
	// turn; at least 2.
	RepeatedToolCalls *int `json:"repeated_tool_calls,omitempty"`
	// Recover is what may follow a turn that one of them ended.
	Recover Recover `json:"recover"`
}

// Recover is the recovery of a stale call (ADR-024 rule 5): the turns that
// resume its session with the evidence of what went stale. Unset, there is
// none.
type Recover struct {
	// MaxResumes is how many recovery turns a call may take; at least 0.
	MaxResumes *int `json:"max_resumes,omitempty"`
	// Instruction is what the agent is told with the evidence.
	Instruction string `json:"instruction,omitempty"`
}

var limitKeys = []string{"timeout", "max_cost_usd", "retry", "stale", "tools", "workspace", "isolation", "resources", "artifacts"}

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
	if node, ok := values["stale"]; ok {
		limits.Stale = parseStale(node, limits.Timeout, p)
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

// parseStale reads a stale block. A limit that is a span of time may not
// exceed the timeout declared beside it: it would never end anything.
func parseStale(node *yaml.Node, timeout *time.Duration, p *problems) Stale {
	var stale Stale
	values := fields(node, "stale", []string{"no_event", "no_output", "tool_command", "repeated_tool_calls", "recover"}, p)
	span := func(key string) *time.Duration {
		field := join("stale", key)
		text, ok := scalar(values[key], field, p)
		if !ok {
			return nil
		}
		value, ok := duration(text, field, p)
		if !ok {
			return nil
		}
		if timeout != nil && value > *timeout {
			p.add(field, "%s exceeds timeout %s", value, *timeout)
		}
		return &value
	}
	stale.NoEvent, stale.NoOutput, stale.ToolCommand = span("no_event"), span("no_output"), span("tool_command")
	if calls, ok := integer(values["repeated_tool_calls"], "stale.repeated_tool_calls", p); ok {
		if calls < 2 {
			p.add("stale.repeated_tool_calls", "must be at least 2")
		} else {
			stale.RepeatedToolCalls = &calls
		}
	}
	if node, ok := values["recover"]; ok {
		stale.Recover = parseRecover(node, p)
	}
	return stale
}

// parseRecover reads a stale block's recover block. Whether a budget has
// the instruction it needs is the composed limits' to say: a process may
// give the instruction for its policy's budget.
func parseRecover(node *yaml.Node, p *problems) Recover {
	var recover Recover
	values := fields(node, "stale.recover", []string{"max_resumes", "instruction"}, p)
	if resumes, ok := integer(values["max_resumes"], "stale.recover.max_resumes", p); ok {
		if resumes < 0 {
			p.add("stale.recover.max_resumes", "must be at least 0")
		} else {
			recover.MaxResumes = &resumes
		}
	}
	if node, ok := values["instruction"]; ok {
		recover.Instruction = nonEmpty(node, "stale.recover.instruction", p)
	}
	return recover
}
