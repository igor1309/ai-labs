package definition

import (
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// Prompt is a process's fixed text as a document of its own, which a
// process names as its prompt or its guidance (ADR-014, ADR-028). The
// document is its text.
type Prompt struct {
	Name   string
	Text   string
	Source document.Source
}

// ParsePrompt reads a prompt: the file's contents, unchanged. It has no
// header, and must be readable text, as every document must.
func ParsePrompt(doc document.Document) (Prompt, error) {
	p := &problems{}
	prompt := Prompt{Name: doc.Source.Name, Source: doc.Source}
	if readable(doc.Bytes, p) {
		prompt.Text = string(doc.Bytes)
	}
	return prompt, p.err("prompt " + subjectName(doc.Source))
}

// Prompts lists the prompts the process names: its prompt, then its
// guidance in order. A process that parsed has its prompt and no name
// twice.
func (p Process) Prompts() []string {
	var names []string
	for _, name := range append([]string{p.Prompt}, p.Guidance...) {
		if name != "" && !contains(names, name) {
			names = append(names, name)
		}
	}
	return names
}

// promptName reports the problems of a prompt name under field: a literal
// document name, which nothing is substituted in (ADR-014 rule 2).
func promptName(name, field string, p *problems) bool {
	switch {
	case strings.Contains(name, "${"):
		p.add(field, "is not interpolated: name the prompt document literally")
	case !document.ValidName(name):
		p.add(field, "invalid prompt name %q", name)
	default:
		return true
	}
	return false
}

// guidanceNames reports the problems of a guidance list: each a literal
// prompt name, named once and not the process's prompt (ADR-028 rule 8).
// It returns the names that have none.
func guidanceNames(names []string, prompt string, p *problems) []string {
	seen := map[string]string{} // name: the field that named it first
	var valid []string
	for i, name := range names {
		at := fieldIndex("guidance", i)
		if !promptName(name, at, p) {
			continue
		}
		switch first, again := seen[name]; {
		case again:
			p.add(at, "prompt %q is named twice (also %s)", name, first)
		case name == prompt:
			p.add(at, "prompt %q is the process's prompt: guidance names further prompts", name)
		default:
			seen[name] = at
			valid = append(valid, name)
		}
	}
	return valid
}

// retiredPromptSource is the problem of an input value declaring the
// source prompt, and retiredOptional of one declaring optional: the input
// source and its argument ADR-028 replaced.
const (
	retiredPromptSource = "source prompt is no longer an input source (ADR-028): a process names its prompt in prompt and further prompts in guidance"
	retiredOptional     = "is no longer read (ADR-028): no input is optional; a prompt only some layers have is guidance those layers set"
)
