package documents

import (
	"slices"

	"github.com/igor1309/ai-labs/gokit/tree"
)

// Block is a document the repository refuses (ADR-002, rule 7), by kind
// and name, and the reason it gives. Whether a layer holds the document
// is not documents' to say.
type Block struct {
	Kind   Kind
	Name   string
	Reason string
}

// Blocks are the repository's blocks, each with the origin of its item in
// the blocks file, in the file's order; or the file's problems, which are
// problems of no document, and then none. No blocks file gives no blocks.
func (d *Documents) Blocks() ([]Field[Block], []Problem) {
	return slices.Clone(d.blocks.value), slices.Clone(d.blocks.problems)
}

// blockKinds are the kinds a block may name: each kind a document is.
func blockKinds() []Kind {
	return []Kind{Workflow, Process, Agent, Runtime, Brief, Prompt, Schema, skill}
}

// blocksOf is the blocks file decoded in YAML and typed.
func blocksOf(file Source, decode decoder) definition[[]Field[Block]] {
	root, decoded := decode(tree.YAML, file.Bytes, file.Path)
	if len(decoded) > 0 {
		problems := make([]Problem, 0, len(decoded))
		for _, p := range decoded {
			problems = append(problems, Problem{Path: p.Origin.Path, Line: p.Origin.Line, Place: p.Place, Message: p.Message})
		}
		return definition[[]Field[Block]]{problems: problems}
	}
	switch root.Kind() {
	case tree.Empty:
		return definition[[]Field[Block]]{}
	case tree.List:
	default:
		return definition[[]Field[Block]]{problems: []Problem{{Path: file.Path, Message: "it is a list"}}}
	}
	t := &typing{}
	blocks := []Field[Block]{}
	for i, item := range root.Items() {
		place := itemPlace("", i)
		if item.Kind() != tree.Map {
			t.problems = append(t.problems, at(item, place, notA(tree.Map, item.Kind())))
			continue
		}
		block := typeBlock(&fields{typing: t, node: item, place: place, known: map[string]bool{}})
		blocks = append(blocks, Field[Block]{Value: block, Origin: originOf(item, place), Given: true})
	}
	if len(t.problems) > 0 {
		return definition[[]Field[Block]]{problems: t.problems}
	}
	return definition[[]Field[Block]]{value: blocks}
}

// typeBlock is the block f: one kind's field, its document's name, and
// its reason.
func typeBlock(f *fields) Block {
	var block Block
	// A field missing in the one blocks file is at its block's line there.
	if _, given := f.node.Get("reason"); !given {
		f.known["reason"] = true
		f.problem(originOf(f.node, f.place), f.at("reason"), "it is missing")
	} else {
		block.Reason = f.text("reason", required).Value
	}
	var kinds []Kind
	for _, kind := range blockKinds() {
		if _, given := f.node.Get(string(kind)); given {
			kinds = append(kinds, kind)
			f.known[string(kind)] = true
		}
	}
	if len(kinds) == 1 {
		block.Kind = kinds[0]
		block.Name = f.text(string(kinds[0]), required).Value
	}
	f.done()
	if len(kinds) != 1 {
		f.problem(originOf(f.node, f.place), f.place, "it names one kind and a name")
	}
	return block
}
