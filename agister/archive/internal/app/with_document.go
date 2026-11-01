package app

import (
	"context"
	"sort"

	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// withDocument is a definitions source with one home document added or
// replaced. Where a nearer layer holds a document of the same name, a
// composed kind's is composed from the nearer layers' files as they are and
// the home document beneath them (ADR-028 rule 4); any other kind's is the
// nearer layer's, which replaces home's whole (rule 6).
type withDocument struct {
	definitions overlaidDefinitions
	doc         document.Document
}

// overlaidDefinitions are the settings the document is added to.
type overlaidDefinitions interface {
	Read(ctx context.Context, kind document.Kind, name string) (document.Document, error)
	ReadListed(ctx context.Context, kind document.Kind, name string) (document.Document, error)
	List(ctx context.Context, kind document.Kind) ([]string, error)
	Layers(ctx context.Context) []document.LayerDir
}

func (w withDocument) Read(ctx context.Context, kind document.Kind, name string) (document.Document, error) {
	return w.with(ctx, kind, name, w.definitions.Read)
}

func (w withDocument) ReadListed(ctx context.Context, kind document.Kind, name string) (document.Document, error) {
	return w.with(ctx, kind, name, w.definitions.ReadListed)
}

// with is the document as read reads it, with w's home document in place.
func (w withDocument) with(ctx context.Context, kind document.Kind, name string, read func(context.Context, document.Kind, string) (document.Document, error)) (document.Document, error) {
	if kind != w.doc.Source.Kind || name != w.doc.Source.Name {
		return read(ctx, kind, name)
	}
	current, err := read(ctx, kind, name)
	switch {
	case err != nil || current.Source.Layer == document.LayerHome:
		return w.doc, nil
	case !document.Composed(kind):
		return current, nil
	}
	home := document.LayerFile{Layer: document.LayerHome, Path: w.doc.Source.Path, SHA256: w.doc.Source.SHA256}
	return withHome(current, document.LayerText{File: home, Bytes: w.doc.Bytes})
}

func (w withDocument) List(ctx context.Context, kind document.Kind) ([]string, error) {
	names, err := w.definitions.List(ctx, kind)
	if err != nil || kind != w.doc.Source.Kind || contains(names, w.doc.Source.Name) {
		return names, err
	}
	names = append(append([]string(nil), names...), w.doc.Source.Name)
	sort.Strings(names)
	return names, nil
}

func (w withDocument) Layers(ctx context.Context) []document.LayerDir {
	return w.definitions.Layers(ctx)
}
