package document

import "strings"

// Layer names a settings layer (ADR-028 rule 1).
type Layer string

const (
	// LayerHome is Agister's home, ~/.agister.
	LayerHome Layer = "home"
	// LayerRepository is the .agister of the worktree's root.
	LayerRepository Layer = "repository"
	// LayerProject is the .agister of the project directory a command is
	// launched in, below the root.
	LayerProject Layer = "project"
)

// LayerFile is one layer's file of a document.
type LayerFile struct {
	Layer  Layer
	Path   string
	SHA256 string
	// Fields are the fields the file gave the composition, in the file's
	// order: each the path of a leaf, its keys joined by "."; a leaf is a
	// scalar, a list or an empty map (ADR-028 rule 11). Never nil on a
	// composed document, empty when the file gave nothing; nil on a
	// document taken whole, which has no fields.
	Fields []string
	// Process is set on the files of a process that extends a base: the
	// process whose file it is, the base or the process itself, so that
	// each field names the base or the process that gave it (ADR-030 rule
	// 9). Unset on any other document's.
	Process string
}

// LayerText is one layer's file of a document, and what it holds.
type LayerText struct {
	File  LayerFile
	Bytes []byte
}

// LayerDir is one layer a command selected: its settings directory, and
// what makes the layer invalid (ADR-028 rules 1 and 7).
type LayerDir struct {
	Layer   Layer
	Dir     string
	Invalid []LayerProblem
}

// LayerProblem is one thing that makes a layer invalid: a problem of the
// layer and of no document in it, so it stops every command launched
// under it (ADR-028 rule 1).
type LayerProblem struct {
	Path   string // at fault
	Reason string
}

// Composed reports whether a document of kind is composed from the layers
// that hold it (ADR-028 rule 4). A prompt, a skill and a schema are taken
// whole from the nearest layer (rule 6), and so are the two singletons no
// call reads: a repository's blocks, which are one layer's alone (rule 7),
// and the obsolete workspace settings.
func Composed(kind Kind) bool {
	switch kind {
	case KindService, KindAgent, KindProcess, KindRuntime, KindWorkflow, KindVerify, KindBrief:
		return true
	}
	return false
}

// Attribute names, in the message of a problem of field, the layer file
// that set the field at fault; a field no layer sets names every layer
// file read (ADR-028 rule 5). A file sets the field when it gave that leaf
// or one below it: a map it gave above the field, such as an empty one,
// sets none of the fields below. The message of a document one file holds
// is unchanged: its subject names that file.
func (s Source) Attribute(field, message string) string {
	if len(s.Layers) < 2 || !Composed(s.Kind) || field == "" {
		return message
	}
	if cut := strings.IndexByte(field, '['); cut >= 0 {
		field = field[:cut] // a list is one field
	}
	var set, read []string
	for _, layer := range s.Layers {
		read = append(read, layer.Path)
		for _, leaf := range layer.Fields {
			if leaf == field || strings.HasPrefix(leaf, field+".") {
				set = append(set, layer.Path)
				break
			}
		}
	}
	if len(set) == 0 {
		return message + " (no layer sets it: " + strings.Join(read, ", ") + ")"
	}
	return message + " (set in " + strings.Join(set, ", ") + ")"
}
