package app

import (
	"context"
	"errors"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

// documentReader reads a settings document as what it is: one method per
// kind reads the document, parses it and returns the parsed value with the
// document's source. The service settings and a runtime mapping are
// returned in the package's own types, which no other file of the package
// maps a parsed document to.
// It reads only the document it is asked for (ADR-015 rule 1), and decides
// nothing for its caller: what to read next, what a failure stops and how
// it is worded are the caller's.
//
// A document the definitions do not give fails with an *unreadError, and
// has no value: its source is what the definitions give beside the
// failure, such as where the document was looked for. One that was read
// and has problems fails with the parser's *document.InvalidError, beside
// its source and what of it parsed.
type documentReader struct {
	definitions readerDefinitions
}

// readerDefinitions supplies a document as a call reads it, with Read, and
// as the settings list it, with ReadListed: a prompt never from a folder a
// layer.yaml lists (ADR-028 rule 9).
type readerDefinitions interface {
	Read(ctx context.Context, kind document.Kind, name string) (document.Document, error)
	ReadListed(ctx context.Context, kind document.Kind, name string) (document.Document, error)
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

// Service reads the service settings as the package uses them, not as
// their file holds them.
func (r documentReader) Service(ctx context.Context) (serviceSettings, document.Source, error) {
	service, source, err := readParsed(ctx, r, document.KindService, "service", definition.ParseService)
	return serviceOf(service), source, err
}

// serviceOf is a parsed service document as the package uses it. What
// parsed of an invalid one is mapped the same, and of one that was not
// read there is nothing.
func serviceOf(service definition.Service) serviceSettings {
	return serviceSettings{
		ceilings: policy.Ceilings{
			MaxTimeout:        service.MaxTimeout,
			MaxAttempts:       service.MaxAttempts,
			MaxVerifyAttempts: service.MaxVerifyAttempts,
			MaxCostUSD:        service.MaxCostUSD,
			Permissions:       service.Permissions,
			Writing:           service.Writing,
		},
		stateReaching: service.StateReaching,
	}
}

func (r documentReader) Process(ctx context.Context, name string) (definition.Process, document.Source, error) {
	return readParsed(ctx, r, document.KindProcess, name, parseProcess)
}

func (r documentReader) Agent(ctx context.Context, name string) (definition.Agent, document.Source, error) {
	return readParsed(ctx, r, document.KindAgent, name, parseAgent)
}

// Mapping reads a runtime mapping as the package uses it, not as its file
// holds it.
func (r documentReader) Mapping(ctx context.Context, name string) (runtimeMapping, document.Source, error) {
	mapping, source, err := readParsed(ctx, r, document.KindRuntime, name, definition.ParseMapping)
	return mappingOf(mapping), source, err
}

// mappingOf is a parsed runtime document as the package uses it: its
// primitives as what it offers enforce, of which a plan takes exactly one
// where the document selects "one". What parsed of an invalid one is
// mapped the same, and of one that was not read there is nothing.
func mappingOf(mapping definition.Mapping) runtimeMapping {
	var primitives []enforce.Primitive
	for _, primitive := range mapping.Primitives {
		primitives = append(primitives, enforce.Primitive{Name: primitive.Name, Grants: primitive.Grants, Verified: primitive.Verified})
	}
	return runtimeMapping{
		name:     mapping.Name,
		adapter:  mapping.Adapter,
		contract: mapping.Contract,
		efforts:  mapping.Efforts,
		offer:    enforce.Offer{One: mapping.Select == "one", Primitives: primitives},
	}
}

func (r documentReader) Verification(ctx context.Context, name string) (definition.Verification, document.Source, error) {
	return readParsed(ctx, r, document.KindVerify, name, definition.ParseVerify)
}

func (r documentReader) Prompt(ctx context.Context, name string) (definition.Prompt, document.Source, error) {
	return readParsed(ctx, r, document.KindPrompt, name, definition.ParsePrompt)
}

// ListedPrompt reads a prompt as the settings list it, not as a call reads
// it: the one of the inventory, which no process need name.
func (r documentReader) ListedPrompt(ctx context.Context, name string) (definition.Prompt, document.Source, error) {
	doc, err := r.definitions.ReadListed(ctx, document.KindPrompt, name)
	return parsedOf(doc, err, definition.ParsePrompt)
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

func (r documentReader) Blocks(ctx context.Context, name string) (definition.Blocks, document.Source, error) {
	return readParsed(ctx, r, document.KindBlocks, name, definition.ParseBlocks)
}

// Workspace reads the workspace settings, which no call reads and nothing
// parses (ADR-025): only where they are.
func (r documentReader) Workspace(ctx context.Context, name string) (document.Source, error) {
	doc, err := r.definitions.Read(ctx, document.KindWorkspace, name)
	if err != nil {
		return doc.Source, &unreadError{err: err}
	}
	return doc.Source, nil
}

// Extending returns what says the base a process extends (ADR-030 rule 9),
// "" where it names none. A process that cannot be read or does not parse
// still names its base, in the nearest file that holds its whole document.
// What it returns reads and composes each base once for all the processes
// it is asked of, and holds them: its caller keeps it for one pass over
// the processes. The reader keeps nothing.
func (r documentReader) Extending(ctx context.Context) func(process string) string {
	read := func(name string) (document.Document, error) {
		return r.definitions.Read(ctx, document.KindProcess, name)
	}
	extender := definition.NewExtender(read)
	return func(process string) string {
		doc, _ := read(process)
		return extender.Extends(doc)
	}
}

// parseProcess parses doc, a process document already read: by the reader,
// or by whoever holds it and reads nothing more to parse it, as the
// snapshot holds what it froze. What of an invalid document parsed is
// returned beside the parser's *document.InvalidError.
func parseProcess(doc document.Document) (definition.Process, error) {
	return definition.ParseProcess(doc)
}

// parseAgent parses doc, an agent document already read, as parseProcess
// parses a process.
func parseAgent(doc document.Document) (definition.Agent, error) {
	return definition.ParseAgent(doc)
}

// parsedAgent parses data as the agent named name: what a write is about
// to store, which is read from nowhere and so has no source but its name.
func parsedAgent(name string, data []byte) (definition.Agent, error) {
	return parseAgent(document.Document{Source: document.Source{Kind: document.KindAgent, Name: name}, Bytes: data})
}

// readParsed reads the document of kind named name and parses it.
func readParsed[T any](ctx context.Context, r documentReader, kind document.Kind, name string, parse func(document.Document) (T, error)) (T, document.Source, error) {
	doc, err := r.definitions.Read(ctx, kind, name)
	return parsedOf(doc, err, parse)
}

// parsedOf parses doc, which a read gave, or fails as the read did.
func parsedOf[T any](doc document.Document, err error, parse func(document.Document) (T, error)) (T, document.Source, error) {
	if err != nil {
		var none T
		return none, doc.Source, &unreadError{err: err}
	}
	value, err := parse(doc)
	return value, doc.Source, err
}
