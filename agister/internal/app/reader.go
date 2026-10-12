package app

import (
	"context"
	"errors"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// documentReader reads a settings document as what it is: one method per
// kind reads the document, parses it and returns the parsed value with the
// document's source. It reads only the document it is asked for (ADR-015
// rule 1), and decides nothing for its caller: what to read next, what a
// failure stops and how it is worded are the caller's.
//
// A document the definitions do not give fails with an *unreadError, and
// has neither value nor source. One that was read and has problems fails
// with the parser's *document.InvalidError, beside its source and what of
// it parsed.
type documentReader struct {
	definitions readerDefinitions
}

// readerDefinitions supplies a document as a call reads it.
type readerDefinitions interface {
	Read(ctx context.Context, kind document.Kind, name string) (document.Document, error)
}

// unreadError is the failure of a read: the definitions gave no document,
// so nothing was parsed. Its text is the read's own.
type unreadError struct{ err error }

func (e *unreadError) Error() string { return e.err.Error() }

func (e *unreadError) Unwrap() error { return e.err }

// unread reports whether err is a read's failure, not a parse's.
func unread(err error) bool {
	var failure *unreadError
	return errors.As(err, &failure)
}

// newDocumentReader returns the reader over definitions, which are
// required.
func newDocumentReader(definitions readerDefinitions) documentReader {
	if definitions == nil {
		panic("app.newDocumentReader: no definitions")
	}
	return documentReader{definitions: definitions}
}

func (r documentReader) Service(ctx context.Context) (definition.Service, document.Source, error) {
	return readParsed(ctx, r, document.KindService, "service", definition.ParseService)
}

func (r documentReader) Process(ctx context.Context, name string) (definition.Process, document.Source, error) {
	return readParsed(ctx, r, document.KindProcess, name, definition.ParseProcess)
}

func (r documentReader) Agent(ctx context.Context, name string) (definition.Agent, document.Source, error) {
	return readParsed(ctx, r, document.KindAgent, name, definition.ParseAgent)
}

func (r documentReader) Mapping(ctx context.Context, name string) (definition.Mapping, document.Source, error) {
	return readParsed(ctx, r, document.KindRuntime, name, definition.ParseMapping)
}

func (r documentReader) Verification(ctx context.Context, name string) (definition.Verification, document.Source, error) {
	return readParsed(ctx, r, document.KindVerify, name, definition.ParseVerify)
}

func (r documentReader) Prompt(ctx context.Context, name string) (definition.Prompt, document.Source, error) {
	return readParsed(ctx, r, document.KindPrompt, name, definition.ParsePrompt)
}

func (r documentReader) Brief(ctx context.Context, name string) (definition.Brief, document.Source, error) {
	return readParsed(ctx, r, document.KindBrief, name, definition.ParseBrief)
}

func (r documentReader) Skill(ctx context.Context, name string) (definition.Skill, document.Source, error) {
	return readParsed(ctx, r, document.KindSkill, name, definition.ParseSkill)
}

func (r documentReader) Workflow(ctx context.Context, name string) (definition.Workflow, document.Source, error) {
	return readParsed(ctx, r, document.KindWorkflow, name, definition.ParseWorkflow)
}

// Schema reads an output schema: its bytes as they are, which the caller's
// validator compiles.
func (r documentReader) Schema(ctx context.Context, name string) ([]byte, document.Source, error) {
	return readParsed(ctx, r, document.KindSchema, name, func(doc document.Document) ([]byte, error) { return doc.Bytes, nil })
}

// readParsed reads the document of kind named name and parses it.
func readParsed[T any](ctx context.Context, r documentReader, kind document.Kind, name string, parse func(document.Document) (T, error)) (T, document.Source, error) {
	doc, err := r.definitions.Read(ctx, kind, name)
	if err != nil {
		var none T
		return none, document.Source{}, &unreadError{err: err}
	}
	value, err := parse(doc)
	return value, doc.Source, err
}
