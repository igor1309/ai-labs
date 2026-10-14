// Package document is the vocabulary of Agister's settings documents: which
// document one is, where it came from, the document itself and its
// problems. It knows no file and no format: callers supply bytes and their
// origin, and package definition parses them.
package document

import (
	"errors"
	"fmt"
	"strings"
)

// Kind names a kind of definition document.
type Kind string

const (
	KindService  Kind = "service"
	KindAgent    Kind = "agents"
	KindProcess  Kind = "processes"
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
