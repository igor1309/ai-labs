// Package definition parses and validates Agister's settings documents:
// agents, processes, workflows, policies, verifications, prompts, skills,
// brief forms, runtime permission mappings, the service, the workspace and
// a repository's blocks. It owns the definition language; callers supply
// bytes and their origin.
package definition

import (
	"bytes"
	"errors"
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
	KindPrompt   Kind = "prompts"
	KindSkill    Kind = "skills"
	// KindBrief is a brief's form: its parts and its template (ADR-026
	// rule 5).
	KindBrief Kind = "briefs"
	// KindWorkspace is a singleton, like the service, and optional: a
	// missing document means no workspace settings.
	KindWorkspace Kind = "workspace"
	// KindBlocks is a singleton too, and optional: what a repository
	// blocks of the settings it sees (ADR-018).
	KindBlocks Kind = "blocks"
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
	case KindPrompt:
		return "prompt"
	case KindSkill:
		return "skill"
	case KindBrief:
		return "brief"
	}
	return string(k)
}

// Source identifies where a definition came from, for attribution.
type Source struct {
	Kind Kind
	Name string
	// Path is the file of the nearest layer that holds the document, and
	// Layer that layer.
	Path  string
	Layer Layer
	// SHA256 is the digest of the document's text: its one file's, or the
	// composition's.
	SHA256 string
	// Layers are the layer files that hold the document, nearest first. A
	// composed kind's document is composed from all of them (ADR-028 rule
	// 4); any other is the first alone, which replaces the rest (rule 6).
	Layers []LayerFile
}

// ErrNotFound is what reading a document no settings layer has
// returns, wrapped: a document that exists but cannot be read gives any
// other error.
var ErrNotFound = errors.New("not found")

// Document is a definition's raw bytes with their origin.
type Document struct {
	Source Source
	Bytes  []byte
	// Texts are the layer files a composed kind's document is composed
	// from, nearest first, each with what it holds: what a composition
	// with one of them changed is composed from (ADR-028 rule 4). Nil on
	// a document taken whole. A process's are its own, without its base's
	// (ADR-030 rule 9).
	Texts []LayerText
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
	// source, when it has several layer files, names in each problem the
	// file that set the field at fault (ADR-028 rule 5).
	source Source
	// absent are the required fields the document does not set, each also
	// a problem.
	absent []string
}

// problemsOf collects the problems of the document read from source.
func problemsOf(source Source) *problems { return &problems{source: source} }

func (p *problems) add(field, format string, args ...any) {
	p.list = append(p.list, Problem{Message: p.source.Attribute(field, fieldMessage(field, format, args...))})
}

// missing adds the problem of a required field the document does not
// set.
func (p *problems) missing(field string) {
	p.absent = append(p.absent, field)
	p.add(field, "is required")
}

// unknown adds a problem that names something this code does not know.
func (p *problems) unknown(field, format string, args ...any) {
	p.list = append(p.list, Problem{Message: p.source.Attribute(field, fieldMessage(field, format, args...)), Unknown: true})
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
