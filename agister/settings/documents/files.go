package documents

import (
	"crypto/sha256"
	"fmt"
	"slices"
)

// File identifies a document's source by layer, path and lowercase hex
// SHA-256 digest of its bytes.
type File struct {
	Layer, Path, Digest string
}

// Files gives the tree's own sources nearest first, then its base's
// sources in the same order; a blob gives its nearest source alone.
// Problems are those of Tree or Blob, and give no files. Returned slices
// belong to the caller.
func (d *Documents) Files(kind Kind, name string) ([]File, []Problem) {
	_, isTree, known := shapeOf(kind)
	if !known {
		return nil, []Problem{unknown(kind)}
	}
	var files []File
	var problems []Problem
	var held bool
	if isTree {
		result, ok := d.trees[kind][name]
		files, problems, held = result.files, result.problems, ok
	} else {
		result, ok := d.blobs[kind][name]
		files, problems, held = result.files, result.problems, ok
	}
	if !held {
		return nil, []Problem{noLayer(kind, name)}
	}
	if len(problems) > 0 {
		return nil, slices.Clone(problems)
	}
	return slices.Clone(files), nil
}

func sourceFiles(sources Sources) []File {
	var files []File
	for _, layer := range []struct {
		name string
		file *Source
	}{{"project", sources.Project}, {"repository", sources.Repository}, {"home", sources.Home}} {
		if layer.file != nil {
			files = append(files, File{Layer: layer.name, Path: layer.file.Path,
				Digest: fmt.Sprintf("%x", sha256.Sum256(layer.file.Bytes))})
		}
	}
	return files
}
