package definition

import (
	"sort"
	"strings"
)

// PromptSource is the input source of a prompt document (ADR-014). Its one
// argument, name, names the document literally: it is fixed by the
// settings, not the caller, so it is not interpolated.
const PromptSource = "prompt"

// Prompt is a process's fixed text as a document of its own, which a
// process names as an input (ADR-014). The document is its text.
type Prompt struct {
	Name   string
	Text   string
	Source Source
}

// ParsePrompt reads a prompt: the file's contents, unchanged. It has no
// header, and must be readable text, as every document must.
func ParsePrompt(doc Document) (Prompt, error) {
	p := &problems{}
	prompt := Prompt{Name: doc.Source.Name, Source: doc.Source}
	if readable(doc.Bytes, p) {
		prompt.Text = string(doc.Bytes)
	}
	return prompt, p.err("prompt " + subjectName(doc.Source))
}

// Prompts lists the prompts the process's inputs name, each once, in
// declaration order.
func (p Process) Prompts() []string {
	var names []string
	for _, value := range p.Values {
		if name := value.Args["name"]; value.Source == PromptSource && name != "" && !contains(names, name) {
			names = append(names, name)
		}
	}
	return names
}

// promptArgs reports the problems of a prompt input's arguments: exactly
// one, name, a literal document name.
func promptArgs(value Value, field string, p *problems) {
	var extra []string
	for key := range value.Args {
		if key != "name" {
			extra = append(extra, key)
		}
	}
	sort.Strings(extra)
	for _, key := range extra {
		p.add(join(field, key), "is not an argument of source %s, which takes only name", PromptSource)
	}
	name, ok := value.Args["name"]
	switch {
	case !ok:
		p.add(join(field, "name"), "is required")
	case strings.Contains(name, "${"):
		p.add(join(field, "name"), "is not interpolated: name the prompt document literally")
	case !ValidName(name):
		p.add(join(field, "name"), "invalid prompt name %q", name)
	}
}
