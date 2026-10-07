package definition

import (
	"sort"
	"strings"
)

// PromptSource is the input source of a prompt document (ADR-014). Its
// argument name names the document literally: it is fixed by the settings,
// not the caller, so it is not interpolated. optional, which takes only
// true, lets the call go ahead without a prompt neither layer has
// (ADR-019).
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

// Optional says the value is a prompt input the call goes ahead without
// when neither layer has its prompt (ADR-019).
func (v Value) Optional() bool {
	return v.Source == PromptSource && v.Args["optional"] == "true"
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

// OptionalPrompts lists the prompts among Prompts that only optional
// inputs name (ADR-019): the process runs without them. One that a
// required input also names is required.
func (p Process) OptionalPrompts() []string {
	var names []string
	for _, name := range p.Prompts() {
		optional := true
		for _, value := range p.Values {
			if value.Source == PromptSource && value.Args["name"] == name && !value.Optional() {
				optional = false
			}
		}
		if optional {
			names = append(names, name)
		}
	}
	return names
}

// promptArgs reports the problems of a prompt input's arguments: name, a
// literal document name, and optional, which takes only true (ADR-019).
// Any other argument is one this code does not know, as a newer Agister's
// might be (LAB-122).
func promptArgs(value Value, field string, p *problems) {
	var extra []string
	for key := range value.Args {
		if key != "name" && key != "optional" {
			extra = append(extra, key)
		}
	}
	sort.Strings(extra)
	for _, key := range extra {
		p.unknown(join(field, key), "is not an argument of source %s, which takes only name and optional", PromptSource)
	}
	if optional, ok := value.Args["optional"]; ok && optional != "true" {
		p.add(join(field, "optional"), "takes only true; leave it out for a required prompt")
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
