package app

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// definitionsFake is the definitions a reader reads in a test: it gives
// the document or the error the test set for a kind and name, and fails
// the test on a read of any other.
type definitionsFake struct {
	t    *testing.T
	docs map[DocumentRef]document.Document
	errs map[DocumentRef]error
}

func (f definitionsFake) Read(_ context.Context, kind document.Kind, name string) (document.Document, error) {
	ref := DocumentRef{Kind: kind, Name: name}
	if err, ok := f.errs[ref]; ok {
		return document.Document{}, err
	}
	doc, ok := f.docs[ref]
	if !ok {
		f.t.Errorf("read of %s %q, which the test did not set", kind, name)
	}
	return doc, nil
}

// readerCase is one kind of document the reader reads: the document asked
// for, a valid text of it, the reader's method and the kind's parser.
type readerCase struct {
	ref   DocumentRef
	text  string
	read  func(documentReader) (any, document.Source, error)
	parse func(document.Document) (any, error)
}

// doc is the case's document holding text, with a source of its own.
func (c readerCase) doc(text string) document.Document {
	path := "mem/" + string(c.ref.Kind) + "/" + c.ref.Name
	return document.Document{
		Source: document.Source{Kind: c.ref.Kind, Name: c.ref.Name, Path: path, Layer: document.LayerHome, SHA256: "digest of " + path},
		Bytes:  []byte(text),
	}
}

// reads is the case of the document of kind named name, which read reads
// and parse parses.
func reads[T any](kind document.Kind, name, text string, read func(documentReader, context.Context, string) (T, document.Source, error), parse func(document.Document) (T, error)) readerCase {
	return readerCase{
		ref: DocumentRef{Kind: kind, Name: name}, text: text,
		read: func(r documentReader) (any, document.Source, error) {
			return read(r, context.Background(), name)
		},
		parse: func(doc document.Document) (any, error) { return parse(doc) },
	}
}

// readerCases are the kinds the reader reads, each with a valid document.
func readerCases() map[string]readerCase {
	service := reads(document.KindService, "service", "schema = \"agister.service/v1alpha1\"\nmax_timeout = \"1h\"\npermissions = [\"repository.read\"]\nwriting = []\nstate_reaching = []\n",
		func(r documentReader, ctx context.Context, _ string) (definition.Service, document.Source, error) {
			return r.Service(ctx)
		}, definition.ParseService)
	return map[string]readerCase{
		"the service": service,
		"a process": reads(document.KindProcess, "p", "schema: agister.process/v1alpha1\nname: p\ntype: process\nprompt: inspect\ninput:\n  instruction: Inspect the change.\noutput:\n  format: text\ntimeout: 20m\ntools: {allow: [repository.read]}\n",
			documentReader.Process, definition.ParseProcess),
		"an agent": reads(document.KindAgent, "a", "schema = \"agister.agent/v1alpha1\"\nname = \"a\"\nruntime = \"rt\"\nmodel = \"m1\"\nmodel_family = \"fam\"\neffort = \"high\"\ncommand = \"/bin/spy\"\n",
			documentReader.Agent, definition.ParseAgent),
		"a runtime mapping": reads(document.KindRuntime, "rt", "schema: agister.runtime/v1alpha1\nname: rt\nadapter: spy\ncontract: spy/1\nefforts: [high]\nprimitives:\n  select: any\n  items:\n    Read: {grants: [repository.read], verified: [\"1.\"]}\n",
			documentReader.Mapping, definition.ParseMapping),
		"a verification": reads(document.KindVerify, "repo", "schema: agister.verify/v1alpha1\nname: repo\ncommand: go test ./...\ntimeout: 10m\nmax_attempts: 3\ninstruction: Fix the cause, not the check.\n",
			documentReader.Verification, definition.ParseVerify),
		"a prompt": reads(document.KindPrompt, "inspect", "Inspect the change for defects.\n",
			documentReader.Prompt, definition.ParsePrompt),
		"a brief form": reads(document.KindBrief, "goal", "schema: agister.brief/v1alpha1\nname: goal\nparts:\n  - {heading: \"## Intent\", required: true}\ntemplate: |\n  ## Intent\n",
			documentReader.Brief, definition.ParseBrief),
		"a skill": reads(document.KindSkill, "review", "---\nname: review\ndescription: How to review.\n---\n\n# review\n",
			documentReader.Skill, definition.ParseSkill),
		"a workflow": reads(document.KindWorkflow, "w", "schema: agister.workflow/v1alpha1\nname: w\ntype: workflow\ncall: {node: p, uses: process:p, agent: a}\n",
			documentReader.Workflow, definition.ParseWorkflow),
		"a schema": reads(document.KindSchema, "s", `{"type":"object"}`,
			documentReader.Schema, func(doc document.Document) ([]byte, error) { return doc.Bytes, nil }),
	}
}

// Each method reads the document of its kind, parses it with the kind's
// parser and returns the parsed value with the document's source.
func TestTheReaderGivesADocumentParsedWithItsSource(t *testing.T) {
	t.Parallel()
	for name, c := range readerCases() {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := c.doc(c.text)
			want, err := c.parse(doc)
			if err != nil {
				t.Fatalf("the case's document is invalid: %v", err)
			}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{c.ref: doc}})
			got, source, err := c.read(reader)
			if err != nil || !reflect.DeepEqual(got, want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("read = %+v, source %+v, %v; want %+v, source %+v", got, source, err, want, doc.Source)
			}
		})
	}
}

// A document the definitions do not give is a failure to read: it is told
// from a failure to parse, keeps the read's error and its text, and has no
// source.
func TestAFailureToReadIsToldFromAFailureToParse(t *testing.T) {
	t.Parallel()
	for name, c := range readerCases() {
		for failure, cause := range map[string]error{
			"not found":      document.ErrNotFound,
			"invalid layers": &document.InvalidError{Subject: "layers of " + c.ref.Name, Problems: []document.Problem{{Message: "cannot be composed"}}},
		} {
			t.Run(name+" "+failure, func(t *testing.T) {
				t.Parallel()
				reader := newDocumentReader(definitionsFake{t: t, errs: map[DocumentRef]error{c.ref: cause}})
				_, source, err := c.read(reader)
				if !unread(err) || !errors.Is(err, cause) || err.Error() != cause.Error() {
					t.Fatalf("read error = %#v, want a failure to read that is %v", err, cause)
				}
				if !reflect.DeepEqual(source, document.Source{}) {
					t.Fatalf("source of an unread document = %+v", source)
				}
			})
		}
	}
}

// A document that was read and has problems is a failure to parse: the
// parser's own *document.InvalidError, beside the document's source and
// what of the document parsed.
func TestAFailureToParseKeepsItsProblemsAndTheSource(t *testing.T) {
	t.Parallel()
	for name, c := range readerCases() {
		if c.ref.Kind == document.KindSchema {
			continue // not parsed: its bytes are compiled by the caller's validator
		}
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := c.doc("\xff")
			want, parseErr := c.parse(doc)
			if parseErr == nil {
				t.Fatal("the case's document is valid")
			}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{c.ref: doc}})
			got, source, err := c.read(reader)
			invalid, ok := err.(*document.InvalidError)
			if unread(err) || !ok || !reflect.DeepEqual(invalid, parseErr) {
				t.Fatalf("read error = %#v, want the parser's %#v", err, parseErr)
			}
			if !reflect.DeepEqual(got, want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("read = %+v, source %+v; want %+v, source %+v", got, source, want, doc.Source)
			}
		})
	}
}

func TestAReaderWithoutDefinitionsFailsAtConstruction(t *testing.T) {
	t.Parallel()
	defer func() {
		if recover() == nil {
			t.Fatal("a reader was made over no definitions")
		}
	}()
	newDocumentReader(nil)
}
