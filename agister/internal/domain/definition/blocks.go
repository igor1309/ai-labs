package definition

import (
	"strings"

	"gopkg.in/yaml.v3"
)

// BlocksSchema is the schema of a repository's blocks (ADR-018).
const BlocksSchema = "agister.blocks/v1alpha1"

// blockable are the kinds a block may name, by the prefix of its reference:
// the choices a call makes (ADR-018 rule 1).
var blockable = map[string]Kind{
	"process":  KindProcess,
	"workflow": KindWorkflow,
	"agent":    KindAgent,
	"runtime":  KindRuntime,
}

// Block is one document a repository blocks, and why.
type Block struct {
	Kind   Kind
	Name   string
	Reason string // optional
}

// Ref is the block's reference, as the settings write it: "agent:<name>".
func (b Block) Ref() string {
	for prefix, kind := range blockable {
		if kind == b.Kind {
			return prefix + ":" + b.Name
		}
	}
	return string(b.Kind) + ":" + b.Name
}

// Blocks is a repository's blocks.yaml: the documents it blocks, in order.
// Whether each exists is checked across documents.
type Blocks struct {
	Blocks []Block
	Source Source
}

// ParseBlocks parses a repository's blocks.
func ParseBlocks(doc Document) (Blocks, error) {
	p := &problems{}
	blocks := Blocks{Source: doc.Source}
	root := parseOneYAML(doc.Bytes, p)
	if root == nil {
		return blocks, p.err("blocks")
	}
	unique(root, "", p)
	values := fields(root, "", []string{"schema", "blocks"}, p)
	value, _ := scalar(values["schema"], "schema", p)
	checkSchema(value, BlocksSchema, p)
	list, ok := values["blocks"]
	switch {
	case !ok:
		p.add("blocks", "is required")
		return blocks, p.err("blocks")
	case list.Kind != yaml.SequenceNode:
		p.add("blocks", "must be a list of blocks")
		return blocks, p.err("blocks")
	}
	seen := map[string]string{} // reference: the field that named it first
	for i, item := range list.Content {
		field := fieldIndex("blocks", i)
		unique(item, field, p)
		entry := fields(item, field, []string{"ref", "reason"}, p)
		ref := required(entry, "ref", field, p)
		block := Block{}
		if node, ok := entry["reason"]; ok {
			block.Reason = nonEmpty(node, field+".reason", p)
		}
		if ref == "" {
			continue
		}
		prefix, name, found := strings.Cut(ref, ":")
		kind, known := blockable[prefix]
		switch {
		case !found:
			p.add(field+".ref", `must be "<kind>:<name>", one of process, workflow, agent or runtime`)
			continue
		case !known:
			p.add(field+".ref", "%q cannot be blocked: only a process, workflow, agent or runtime is", prefix)
			continue
		case !ValidName(name):
			p.add(field+".ref", "invalid %s name %q", kind.Singular(), name)
			continue
		}
		if first, ok := seen[ref]; ok {
			p.add(field+".ref", "%s is blocked twice (also %s)", ref, first)
			continue
		}
		seen[ref] = field
		block.Kind, block.Name = kind, name
		blocks.Blocks = append(blocks.Blocks, block)
	}
	return blocks, p.err("blocks")
}
