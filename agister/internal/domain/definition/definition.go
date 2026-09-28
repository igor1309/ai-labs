// Package definition parses and validates Agister's settings documents:
// agents, processes, policies, runtime permission mappings and the service.
// It owns the definition language; callers supply bytes and their origin.
package definition

import (
	"fmt"
	"strings"
)

// Kind names a kind of definition document.
type Kind string

const (
	KindService Kind = "service"
	KindAgent   Kind = "agents"
	KindProcess Kind = "processes"
	KindPolicy  Kind = "policies"
	KindRuntime Kind = "runtimes"
	KindSchema  Kind = "schemas"
)

// Singular names one definition of this kind, for messages.
func (k Kind) Singular() string {
	switch k {
	case KindProcess:
		return "process"
	case KindPolicy:
		return "policy"
	case KindAgent:
		return "agent"
	case KindRuntime:
		return "runtime mapping"
	case KindSchema:
		return "schema"
	}
	return string(k)
}

// Source identifies where a definition came from, for attribution.
type Source struct {
	Kind   Kind   `json:"kind"`
	Name   string `json:"name"`
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

// Document is a definition's raw bytes with their origin.
type Document struct {
	Source Source
	Bytes  []byte
}

// InvalidError lists every problem found in one definition.
type InvalidError struct {
	Subject  string
	Problems []string
}

func (e *InvalidError) Error() string {
	return fmt.Sprintf("%s is invalid:\n  %s", e.Subject, strings.Join(e.Problems, "\n  "))
}

// problems collects field-path problems while reading one document.
type problems struct {
	list []string
}

func (p *problems) add(field, format string, args ...any) {
	message := fmt.Sprintf(format, args...)
	if field != "" {
		message = field + ": " + message
	}
	p.list = append(p.list, message)
}

func (p *problems) err(subject string) error {
	if len(p.list) == 0 {
		return nil
	}
	return &InvalidError{Subject: subject, Problems: p.list}
}

func join(parent, key string) string {
	if parent == "" {
		return key
	}
	return parent + "." + key
}
