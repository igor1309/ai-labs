// Package definition parses and validates Agister's settings documents:
// agents, processes, workflows, policies, verifications, runtime permission
// mappings, the service and the workspace.
// It owns the definition language; callers supply bytes and their origin.
package definition

import (
	"bytes"
	"fmt"
	"strings"
	"unicode/utf8"
)

// Kind names a kind of definition document.
type Kind string

const (
	KindService  Kind = "service"
	KindAgent    Kind = "agents"
	KindProcess  Kind = "processes"
	KindPolicy   Kind = "policies"
	KindRuntime  Kind = "runtimes"
	KindSchema   Kind = "schemas"
	KindWorkflow Kind = "workflows"
	KindVerify   Kind = "verifies"
	// KindWorkspace is a singleton, like the service, and optional: a
	// missing document means no workspace settings.
	KindWorkspace Kind = "workspace"
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
	case KindWorkflow:
		return "workflow"
	case KindVerify:
		return "verification"
	}
	return string(k)
}

// Source identifies where a definition came from, for attribution.
type Source struct {
	Kind   Kind
	Name   string
	Path   string
	SHA256 string
	// From a project's own settings rather than the global ones.
	Project bool
	// The global definition this project one takes priority over.
	Overrides string
}

// Document is a definition's raw bytes with their origin.
type Document struct {
	Source Source
	Bytes  []byte
}

// InvalidError lists every problem found in one definition.
type InvalidError struct {
	Subject  string
	Problems []Problem
}

func (e *InvalidError) Error() string {
	return fmt.Sprintf("%s is invalid:\n  %s", e.Subject, strings.Join(e.Messages(), "\n  "))
}

// Messages are the problems' messages, in order.
func (e *InvalidError) Messages() []string {
	messages := make([]string, len(e.Problems))
	for i, problem := range e.Problems {
		messages[i] = problem.Message
	}
	return messages
}

// Problem is one problem found in a definition.
type Problem struct {
	Message string
	// Unknown: the problem names something this code does not know, as
	// settings written for a newer Agister would.
	Unknown bool
}

// readable reports whether data can be a settings document at all. Binary
// content (a stray .DS_Store, a UTF-16 file) gets one plain problem instead
// of whatever the parser makes of it.
func readable(data []byte, p *problems) bool {
	if bytes.IndexByte(data, 0) >= 0 || !utf8.Valid(data) {
		p.add("", "not a UTF-8 text file")
		return false
	}
	return true
}

// problems collects field-path problems while reading one document.
type problems struct {
	list []Problem
}

func (p *problems) add(field, format string, args ...any) {
	p.list = append(p.list, Problem{Message: fieldMessage(field, format, args...)})
}

// unknown adds a problem that names something this code does not know.
func (p *problems) unknown(field, format string, args ...any) {
	p.list = append(p.list, Problem{Message: fieldMessage(field, format, args...), Unknown: true})
}

func fieldMessage(field, format string, args ...any) string {
	message := fmt.Sprintf(format, args...)
	if field != "" {
		message = field + ": " + message
	}
	return message
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
