package definition

import (
	"bytes"
	"regexp"
	"sort"
	"time"

	"github.com/BurntSushi/toml"
)

// Flat settings documents (agent, service) are TOML.

const (
	AgentSchema   = "agister.agent/v1alpha1"
	ServiceSchema = "agister.service/v1alpha1"
)

var namePattern = regexp.MustCompile(`^[a-z][a-z0-9_-]*$`)

// ValidName reports whether name is usable as a definition name.
func ValidName(name string) bool { return namePattern.MatchString(name) }

// Agent is a reusable runtime profile. It carries no task and no permissions.
type Agent struct {
	Name        string `json:"name"`
	Runtime     string `json:"runtime"` // name of a runtime permission mapping
	Model       string `json:"model,omitempty"`
	ModelFamily string `json:"model_family,omitempty"`
	Effort      string `json:"effort,omitempty"`
	Session     string `json:"session"` // SessionFresh or SessionResumable
	Command     string `json:"command,omitempty"`
	// Skills are the skill documents its calls are given (ADR-021).
	Skills []string `json:"skills,omitempty"`
	Source Source   `json:"-"`
}

// Session modes. A fresh-only agent always starts a new session; a
// resumable one may continue a finished run's session when a caller asks.
const (
	SessionFresh     = "fresh-only"
	SessionResumable = "resumable"
)

// Service holds the hard limits and the permission vocabulary.
type Service struct {
	MaxTimeout  time.Duration
	MaxAttempts int
	MaxCostUSD  *float64 // unset: no service-wide cost limit
	// The ceiling of a process's verify.max_attempts.
	MaxVerifyAttempts int
	Permissions       []string
	// Permissions that change the workspace or its history. Read-only
	// access withholds them.
	Writing []string
	// Permissions that would let an agent reach Agister's own state. They
	// are never granted, whatever a policy allows.
	StateReaching []string
	Source        Source
}

func decodeTOML(data []byte, subject string, allowed []string, p *problems) map[string]any {
	if !readable(data, p) {
		return nil
	}
	table := map[string]any{}
	if _, err := toml.Decode(string(data), &table); err != nil {
		p.add("", "%v", err)
		return nil
	}
	keys := make([]string, 0, len(table))
	for key := range table {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if !contains(allowed, key) {
			p.unknown(key, "unknown field")
		}
	}
	return table
}

func tomlString(table map[string]any, key string, needed bool, p *problems) string {
	value, ok := table[key]
	if !ok {
		if needed {
			p.add(key, "is required")
		}
		return ""
	}
	text, ok := value.(string)
	if !ok || text == "" {
		p.add(key, "must be a non-empty string")
		return ""
	}
	return text
}

func tomlStrings(table map[string]any, key string, p *problems) []string {
	value, ok := table[key]
	if !ok {
		return nil
	}
	items, ok := value.([]any)
	if !ok {
		p.add(key, "must be a list of strings")
		return nil
	}
	out := make([]string, 0, len(items))
	for i, item := range items {
		text, ok := item.(string)
		if !ok {
			p.add(fieldIndex(key, i), "must be a string")
			continue
		}
		out = append(out, text)
	}
	return out
}

// ParseAgent parses an agent profile.
func ParseAgent(doc Document) (Agent, error) {
	p := problemsOf(doc.Source)
	table := decodeTOML(doc.Bytes, doc.Source.Path, []string{"schema", "name", "runtime", "model", "model_family", "effort", "session", "command", "skills"}, p)
	if table == nil {
		return Agent{Source: doc.Source}, p.err("agent " + subjectName(doc.Source))
	}
	value, _ := table["schema"].(string)
	checkSchema(value, AgentSchema, p)
	agent := Agent{
		Name:        tomlString(table, "name", true, p),
		Runtime:     tomlString(table, "runtime", true, p),
		Model:       tomlString(table, "model", false, p),
		ModelFamily: tomlString(table, "model_family", false, p),
		Effort:      tomlString(table, "effort", false, p),
		Session:     tomlString(table, "session", false, p),
		Command:     tomlString(table, "command", false, p),
		Skills:      skillNames(tomlStrings(table, "skills", p), "skills", p),
		Source:      doc.Source,
	}
	if agent.Session == "" {
		agent.Session = SessionFresh
	}
	if agent.Session != SessionFresh && agent.Session != SessionResumable {
		p.add("session", "unsupported session mode %q (supported: %s, %s)", agent.Session, SessionFresh, SessionResumable)
	}
	checkName(agent.Name, doc.Source.Name, p)
	return agent, p.err("agent " + subjectName(doc.Source))
}

// FormatAgent renders an agent profile as a settings document.
func FormatAgent(agent Agent) []byte {
	var buffer bytes.Buffer
	table := [][2]string{
		{"schema", AgentSchema},
		{"name", agent.Name},
		{"runtime", agent.Runtime},
		{"model", agent.Model},
		{"model_family", agent.ModelFamily},
		{"effort", agent.Effort},
		{"session", agent.Session},
		{"command", agent.Command},
	}
	for _, entry := range table {
		if entry[1] == "" {
			continue
		}
		key, _ := toml.Marshal(map[string]string{entry[0]: entry[1]})
		buffer.Write(key)
	}
	if len(agent.Skills) > 0 {
		key, _ := toml.Marshal(map[string][]string{"skills": agent.Skills})
		buffer.Write(key)
	}
	return buffer.Bytes()
}

// ParseService parses the service settings.
func ParseService(doc Document) (Service, error) {
	p := problemsOf(doc.Source)
	table := decodeTOML(doc.Bytes, doc.Source.Path, []string{"schema", "max_timeout", "max_attempts", "max_verify_attempts", "max_cost_usd", "permissions", "writing", "state_reaching"}, p)
	if table == nil {
		return Service{Source: doc.Source}, p.err("service settings")
	}
	value, _ := table["schema"].(string)
	checkSchema(value, ServiceSchema, p)
	service := Service{Source: doc.Source, MaxAttempts: 1, MaxVerifyAttempts: 1}
	if text := tomlString(table, "max_timeout", true, p); text != "" {
		service.MaxTimeout, _ = duration(text, "max_timeout", p)
	}
	if value, ok := table["max_attempts"]; ok {
		attempts, ok := value.(int64)
		if !ok || attempts < 1 {
			p.add("max_attempts", "must be a positive integer")
		} else {
			service.MaxAttempts = int(attempts)
		}
	}
	if value, ok := table["max_verify_attempts"]; ok {
		attempts, ok := value.(int64)
		if !ok || attempts < 1 {
			p.add("max_verify_attempts", "must be a positive integer")
		} else {
			service.MaxVerifyAttempts = int(attempts)
		}
	}
	if value, ok := table["max_cost_usd"]; ok {
		cost, isFloat := value.(float64)
		if whole, isInt := value.(int64); isInt {
			cost, isFloat = float64(whole), true
		}
		if !isFloat || cost <= 0 {
			p.add("max_cost_usd", "must be a positive number")
		} else {
			service.MaxCostUSD = &cost
		}
	}
	service.Permissions = tomlStrings(table, "permissions", p)
	if len(service.Permissions) == 0 {
		p.add("permissions", "must list the permission vocabulary")
	}
	if _, ok := table["writing"]; !ok {
		p.add("writing", "is required: list the permissions that change the workspace (may be empty)")
	}
	service.Writing = tomlStrings(table, "writing", p)
	for _, permission := range service.Writing {
		if !contains(service.Permissions, permission) {
			p.add("writing", "%q is not in permissions", permission)
		}
	}
	service.StateReaching = tomlStrings(table, "state_reaching", p)
	for _, permission := range service.StateReaching {
		if !contains(service.Permissions, permission) {
			p.add("state_reaching", "%q is not in permissions", permission)
		}
	}
	return service, p.err("service settings")
}

func checkName(declared, expected string, p *problems) {
	if declared != "" && expected != "" && declared != expected {
		p.add("name", "%q does not match its definition name %q", declared, expected)
	}
	if declared != "" && !ValidName(declared) {
		p.add("name", "invalid name %q", declared)
	}
}

func subjectName(source Source) string {
	if source.Path != "" {
		return source.Name + " (" + source.Path + ")"
	}
	return source.Name
}
