package documents

import (
	"fmt"
	"slices"
)

// Format knows how each kind's files are written: their format, the schema
// they name and the fields they may hold. What a field means is not
// format's: a field of a type it should not have is no problem here.

// written is how the files of a kind are written.
type written struct {
	format format
	schema string
	fields *shape
}

func (k Kind) written() written {
	switch k {
	case Agent:
		return written{tomlFormat, "agister.agent/v1alpha1", agentFields}
	case Process:
		return written{yamlFormat, "agister.process/v1alpha1", processFields}
	case Workflow:
		return written{yamlFormat, "agister.workflow/v1alpha1", workflowFields}
	case Runtime:
		return written{yamlFormat, "agister.runtime/v1alpha1", runtimeFields}
	case Verify:
		return written{yamlFormat, "agister.verify/v1alpha1", verifyFields}
	case Brief:
		return written{yamlFormat, "agister.brief/v1alpha1", briefFields}
	}
	panic(fmt.Sprintf("documents: %d is not a kind", int(k)))
}

// shape is the fields a value may hold: a map's known keys, each with the
// shape of its value; or, for a map whose keys are names the settings
// choose, the shape of every value; and the shape of each item of a list.
// A nil shape holds any value, unchecked.
type shape struct {
	keys  map[string]*shape
	names *shape
	items *shape
}

// fields is a map's shape: its keys, each with nil as its value's shape,
// and then the shapes of keys holding more.
func fields(leaves []string, inner map[string]*shape) *shape {
	keys := map[string]*shape{}
	for _, key := range leaves {
		keys[key] = nil
	}
	for key, value := range inner {
		keys[key] = value
	}
	return &shape{keys: keys}
}

// check adds to problems each key of n, at path, that s does not hold, at
// every depth.
func (s *shape) check(path string, n *node, problems *[]error) {
	if s == nil {
		return
	}
	if !n.isMap {
		s.checkLeaf(path, n.value, problems)
		return
	}
	for _, entry := range n.entries {
		if inner, ok := s.child(entry.key); ok {
			inner.check(join(path, entry.key), entry.value, problems)
		} else if s.isMap() {
			*problems = append(*problems, fmt.Errorf("%s: unknown field", join(path, entry.key)))
		}
	}
}

// checkLeaf is check over a leaf's value, whose maps hold their keys in no
// order: they are checked in the order of their keys.
func (s *shape) checkLeaf(path string, value any, problems *[]error) {
	if s == nil {
		return
	}
	switch value := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(value))
		for key := range value {
			keys = append(keys, key)
		}
		slices.Sort(keys)
		for _, key := range keys {
			if inner, ok := s.child(key); ok {
				inner.checkLeaf(join(path, key), value[key], problems)
			} else if s.isMap() {
				*problems = append(*problems, fmt.Errorf("%s: unknown field", join(path, key)))
			}
		}
	case []any:
		for i, item := range value {
			s.items.checkLeaf(fmt.Sprintf("%s[%d]", path, i), item, problems)
		}
	}
}

// isMap is whether s describes a map: a map s does not describe is a field
// of the wrong type, which is not format's to say.
func (s *shape) isMap() bool { return s.keys != nil || s.names != nil }

func (s *shape) child(key string) (*shape, bool) {
	if s.names != nil {
		return s.names, true
	}
	inner, ok := s.keys[key]
	return inner, ok
}

func join(path, key string) string {
	if path == "" {
		return key
	}
	return path + "." + key
}

// header is the fields every kind holds.
var header = []string{"schema", "name", "extends"}

var agentFields = fields(slices.Concat(header, []string{"runtime", "model", "model_family", "effort", "skills"}), nil)

// input is a process's or a workflow's inputs: the params a caller gives
// and the values, each from its source.
func input(leaves ...string) *shape {
	return fields(leaves, map[string]*shape{
		"params": {names: fields([]string{"default"}, nil)},
		"values": {names: fields([]string{"source", "rev", "base", "head", "name", "path", "form"}, nil)},
	})
}

var verification = []string{"command", "timeout", "no_output", "max_attempts", "instruction"}

var processFields = fields(slices.Concat(header, []string{"type", "session", "prompt", "guidance", "skills", "timeout"}), map[string]*shape{
	"input":     input("instruction"),
	"workspace": fields([]string{"access", "scope", "revision", "clean"}, nil),
	"tools":     fields([]string{"require", "allow"}, nil),
	"retry":     fields([]string{"max_attempts"}, nil),
	"stale": fields([]string{"no_event", "tool_command", "repeated_tool_calls"}, map[string]*shape{
		"recover": fields([]string{"max_resumes", "instruction"}, nil),
	}),
	"isolation": fields([]string{"deny"}, nil),
	"output":    fields([]string{"format", "schema", "require_valid"}, nil),
	// A verification's name, or its fields inline.
	"verify": fields(verification, nil),
})

// workflowNode is a workflow's node: a process bound to an agent.
var workflowNode = fields([]string{"node", "uses", "agent"}, nil)

var workflowFields = fields(slices.Concat(header, []string{"type"}), map[string]*shape{
	"input":   input(),
	"call":    workflowNode,
	"fan_out": {items: workflowNode},
	"join":    workflowNode,
})

var runtimeFields = fields(slices.Concat(header, []string{"adapter", "contract", "efforts"}), map[string]*shape{
	"primitives": fields([]string{"select"}, map[string]*shape{
		"items": {names: fields([]string{"grants", "verified"}, nil)},
	}),
})

var verifyFields = fields(slices.Concat(header, verification), nil)

var briefFields = fields(slices.Concat(header, []string{"template"}), map[string]*shape{
	"parts": {items: fields([]string{"heading", "required", "reads", "reference"}, nil)},
})
