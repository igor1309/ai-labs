package main

import (
	"cmp"
	"slices"

	"github.com/igor1309/ai-labs/agister/runstore"
	"github.com/igor1309/ai-labs/agister/settings/documents"
)

// definitionsOf maps the documents read by a plan to the record's file
// identities. A document named more than once is kept once.
func definitionsOf(docs runDocuments, named []runstore.Definition) ([]runstore.Definition, error) {
	named = orderedDefinitions(named)
	for i := range named {
		files, problems := docs.Files(documents.Kind(named[i].Kind), named[i].Name)
		if len(problems) > 0 {
			return nil, documentProblems(problems)
		}
		named[i].Files = make([]runstore.File, len(files))
		for j, file := range files {
			named[i].Files[j] = runstore.File{Layer: file.Layer, Path: file.Path, Digest: file.Digest}
		}
	}
	return named, nil
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
