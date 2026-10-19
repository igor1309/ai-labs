package main

import (
	"cmp"
	"fmt"
	"slices"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/settings/documents"
)

// definitionsOf maps the documents read by a plan to the record's file
// identities and the bytes to keep beside them, by digest. A document named
// more than once is kept once.
func definitionsOf(docs runDocuments, named []runstore.Definition) ([]runstore.Definition, map[string][]byte, error) {
	named = orderedDefinitions(named)
	data := map[string][]byte{}
	for i := range named {
		files, problems := docs.Files(documents.Kind(named[i].Kind), named[i].Name)
		if len(problems) > 0 {
			return nil, nil, documentProblems(problems)
		}
		named[i].Files = make([]runstore.File, len(files))
		for j, file := range files {
			named[i].Files[j] = runstore.File{Layer: file.Layer, Path: file.Path, Digest: file.Digest}
			data[file.Digest] = file.Bytes
		}
	}
	return named, data, nil
}

// keepDefinitions tries each digest once, including failed writes. The
// caller holds r.mu so parallel calls share the run's attempts.
func (r *runRecord) keepDefinitions(definitions []runstore.Definition, data map[string][]byte) {
	for _, definition := range definitions {
		for _, file := range definition.Files {
			if r.definitionAttempts[file.Digest] {
				continue
			}
			r.definitionAttempts[file.Digest] = true
			if err := r.store.WriteDefinition(r.record.ID, file.Digest, data[file.Digest]); err != nil {
				r.warn(fmt.Sprintf("the definition %q could not be kept: %s", file.Path, err))
			}
		}
	}
}

func orderedDefinitions(named []runstore.Definition) []runstore.Definition {
	named = slices.Clone(named)
	slices.SortFunc(named, func(a, b runstore.Definition) int {
		if order := cmp.Compare(a.Kind, b.Kind); order != 0 {
			return order
		}
		return cmp.Compare(a.Name, b.Name)
	})
	return slices.CompactFunc(named, func(a, b runstore.Definition) bool {
		return a.Kind == b.Kind && a.Name == b.Name
	})
}

func sameDefinitions(earlier, planned []runstore.Definition) bool {
	return len(earlier) > 0 && slices.EqualFunc(earlier, planned, func(a, b runstore.Definition) bool {
		return a.Kind == b.Kind && a.Name == b.Name && slices.Equal(a.Files, b.Files)
	})
}
