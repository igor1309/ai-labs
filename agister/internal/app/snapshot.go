package app

import (
	"context"
	"fmt"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// allKinds is every kind of definition a snapshot covers.
var allKinds = []definition.Kind{
	definition.KindService, definition.KindRuntime, definition.KindAgent,
	definition.KindPolicy, definition.KindProcess, definition.KindSchema,
	definition.KindWorkflow, definition.KindWorkspace,
}

// SnapshotSource is what a snapshot reads and what it gives back: the
// definition documents and their origin.
type SnapshotSource interface {
	Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error)
	List(ctx context.Context, kind definition.Kind) ([]string, error)
}

type snapshotRead struct {
	doc definition.Document
	err error
}

type snapshotList struct {
	names []string
	err   error
}

// snapshot is a SnapshotSource frozen in memory: what was read, and each
// error the read gave, replayed as it was.
type snapshot struct {
	reads map[definition.Kind]map[string]snapshotRead
	lists map[definition.Kind]snapshotList
}

// Snapshot reads every kind's List and every listed document once (the
// service document for KindService, as Checker does) and returns them as an
// immutable source. Read and List errors are kept and returned again, so a
// check against the snapshot reports what a check against src would. Nothing
// that reads the snapshot touches src afterwards, so one operation can check
// settings and use exactly what it checked. A name that was not listed is
// not found.
func Snapshot(ctx context.Context, src SnapshotSource) SnapshotSource {
	s := &snapshot{
		reads: map[definition.Kind]map[string]snapshotRead{},
		lists: map[definition.Kind]snapshotList{},
	}
	for _, kind := range allKinds {
		s.reads[kind] = map[string]snapshotRead{}
		names := []string{"service"}
		if kind != definition.KindService {
			listed, err := src.List(ctx, kind)
			s.lists[kind] = snapshotList{names: append([]string(nil), listed...), err: err}
			if err != nil {
				continue
			}
			names = listed
		}
		for _, name := range names {
			doc, err := src.Read(ctx, kind, name)
			s.reads[kind][name] = snapshotRead{doc: cloneDocument(doc), err: err}
		}
	}
	return s
}

func cloneDocument(doc definition.Document) definition.Document {
	doc.Bytes = append([]byte(nil), doc.Bytes...)
	return doc
}

func (s *snapshot) Read(_ context.Context, kind definition.Kind, name string) (definition.Document, error) {
	read, ok := s.reads[kind][name]
	if !ok {
		return definition.Document{}, fmt.Errorf("not found in the settings snapshot")
	}
	return cloneDocument(read.doc), read.err
}

func (s *snapshot) List(_ context.Context, kind definition.Kind) ([]string, error) {
	list, ok := s.lists[kind]
	if !ok {
		return nil, nil
	}
	return append([]string(nil), list.names...), list.err
}
