package app

import (
	"context"
	"errors"
	"maps"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
	"github.com/igor1309/ai-labs/agister/internal/domain/enforce"
	"github.com/igor1309/ai-labs/agister/internal/domain/policy"
)

// definitionsFake is the definitions a reader reads in a test: it gives
// the document or the error the test set for a kind and name, and fails
// the test on a read of any other. A document set beside an error is given
// with it, as definitions give what they know of a document they cannot
// read. What ReadListed gives is set apart from what Read gives, and each
// Read is counted in reads where the test set it.
type definitionsFake struct {
	t          *testing.T
	docs       map[DocumentRef]document.Document
	errs       map[DocumentRef]error
	listed     map[DocumentRef]document.Document
	listedErrs map[DocumentRef]error
	reads      map[DocumentRef]int
}

func (f definitionsFake) Read(_ context.Context, kind document.Kind, name string) (document.Document, error) {
	ref := DocumentRef{Kind: kind, Name: name}
	if f.reads != nil {
		f.reads[ref]++
	}
	return f.give(f.docs, f.errs, ref)
}

func (f definitionsFake) ReadListed(_ context.Context, kind document.Kind, name string) (document.Document, error) {
	return f.give(f.listed, f.listedErrs, DocumentRef{Kind: kind, Name: name})
}

// give is what the test set for ref in docs and errs.
func (f definitionsFake) give(docs map[DocumentRef]document.Document, errs map[DocumentRef]error, ref DocumentRef) (document.Document, error) {
	doc, ok := docs[ref]
	if err, failed := errs[ref]; failed {
		return doc, err
	}
	if !ok {
		f.t.Errorf("read of %s %q, which the test did not set", ref.Kind, ref.Name)
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
		func(r documentReader, ctx context.Context, _ string) (serviceSettings, document.Source, error) {
			return r.Service(ctx)
		},
		// The service is read in the package's own type: what its parser
		// gives, mapped as the reader maps it.
		func(doc document.Document) (serviceSettings, error) {
			service, err := definition.ParseService(doc)
			return serviceOf(service), err
		})
	return map[string]readerCase{
		"the service": service,
		"a process": reads(document.KindProcess, "p", "schema: agister.process/v1alpha1\nname: p\ntype: process\nprompt: inspect\ninput:\n  instruction: Inspect the change.\noutput:\n  format: text\ntimeout: 20m\ntools: {allow: [repository.read]}\n",
			documentReader.Process,
			// A process is read in the package's own type, as the service
			// is.
			func(doc document.Document) (declaredProcess, error) {
				process, err := definition.ParseProcess(doc)
				return processOf(process), err
			}),
		"an agent": reads(document.KindAgent, "a", "schema = \"agister.agent/v1alpha1\"\nname = \"a\"\nruntime = \"rt\"\nmodel = \"m1\"\nmodel_family = \"fam\"\neffort = \"high\"\ncommand = \"/bin/spy\"\n",
			documentReader.Agent,
			// An agent is read in the package's own type, as the service
			// is.
			func(doc document.Document) (agentProfile, error) {
				agent, err := definition.ParseAgent(doc)
				return agentOf(agent), err
			}),
		"a runtime mapping": reads(document.KindRuntime, "rt", "schema: agister.runtime/v1alpha1\nname: rt\nadapter: spy\ncontract: spy/1\nefforts: [high]\nprimitives:\n  select: any\n  items:\n    Read: {grants: [repository.read], verified: [\"1.\"]}\n",
			documentReader.Mapping,
			// A runtime mapping is read in the package's own type, as the
			// service is.
			func(doc document.Document) (runtimeMapping, error) {
				mapping, err := definition.ParseMapping(doc)
				return mappingOf(mapping), err
			}),
		"a verification": reads(document.KindVerify, "repo", "schema: agister.verify/v1alpha1\nname: repo\ncommand: go test ./...\ntimeout: 10m\nmax_attempts: 3\ninstruction: Fix the cause, not the check.\n",
			documentReader.Verification,
			// A verification is read in the package's own type, as the
			// service is.
			func(doc document.Document) (declaredVerification, error) {
				verification, err := definition.ParseVerify(doc)
				return verificationOf(verification), err
			}),
		"a prompt": reads(document.KindPrompt, "inspect", "Inspect the change for defects.\n",
			documentReader.Prompt,
			// A prompt is read in the package's own type, as the service is.
			func(doc document.Document) (promptText, error) {
				prompt, err := definition.ParsePrompt(doc)
				return promptOf(prompt), err
			}),
		"a brief form": reads(document.KindBrief, "goal", "schema: agister.brief/v1alpha1\nname: goal\nparts:\n  - {heading: \"## Intent\", required: true}\ntemplate: |\n  ## Intent\n",
			documentReader.Brief,
			// A brief form is read in the package's own type, as the
			// service is.
			func(doc document.Document) (briefForm, error) {
				brief, err := definition.ParseBrief(doc)
				return briefOf(brief), err
			}),
		"a skill": reads(document.KindSkill, "review", "---\nname: review\ndescription: How to review.\n---\n\n# review\n",
			documentReader.Skill,
			// A skill is read in the package's own type, as the service is.
			func(doc document.Document) (givenSkill, error) {
				skill, err := definition.ParseSkill(doc)
				return skillOf(skill), err
			}),
		"a workflow": reads(document.KindWorkflow, "w", "schema: agister.workflow/v1alpha1\nname: w\ntype: workflow\ncall: {node: p, uses: process:p, agent: a}\n",
			documentReader.Workflow,
			// A workflow is read in the package's own type, as the service
			// is.
			func(doc document.Document) (declaredWorkflow, error) {
				workflow, err := definition.ParseWorkflow(doc)
				return workflowOf(workflow), err
			}),
		"a schema": reads(document.KindSchema, "s", `{"type":"object"}`,
			documentReader.Schema, func(doc document.Document) ([]byte, error) { return doc.Bytes, nil }),
		"the blocks": reads(document.KindBlocks, "blocks", "schema: agister.blocks/v1alpha1\nblocks:\n  - {ref: \"process:p\", reason: Not here.}\n",
			documentReader.Blocks,
			// The blocks are read in the package's own type, as the service
			// is.
			func(doc document.Document) ([]declaredBlock, error) {
				blocks, err := definition.ParseBlocks(doc)
				return blocksOf(blocks), err
			}),
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

// What the definitions give of a document beside the failure to read it,
// such as where it was looked for, is its source: the failure keeps it.
func TestAFailureToReadKeepsTheSourceGivenBesideIt(t *testing.T) {
	t.Parallel()
	for name, c := range readerCases() {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			looked := document.Document{Source: c.doc("").Source}
			cause := errors.New("cannot be resolved")
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{c.ref: looked}, errs: map[DocumentRef]error{c.ref: cause}})
			_, source, err := c.read(reader)
			if !unread(err) || !errors.Is(err, cause) || !reflect.DeepEqual(source, looked.Source) {
				t.Fatalf("read = source %+v, %#v; want source %+v and a failure to read that is %v", source, err, looked.Source, cause)
			}
		})
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

// serviceDocument is the service document holding text, composed from the
// layer files given, nearest first.
func serviceDocument(text string, layers ...document.LayerFile) document.Document {
	return document.Document{
		Source: document.Source{Kind: document.KindService, Name: "service", Path: layers[0].Path, Layer: layers[0].Layer, SHA256: "digest of the service", Layers: layers},
		Bytes:  []byte(text),
	}
}

// The service settings are read as the package uses them: every ceiling,
// the permission lists and the permissions never granted, each as the
// document says it or as its default, beside the document's source.
func TestTheReaderGivesTheServiceSettingsAsThePackageUsesThem(t *testing.T) {
	t.Parallel()
	cost := 2.5
	for name, c := range map[string]struct {
		text string
		want serviceSettings
	}{
		"every field": {
			text: "schema = \"agister.service/v1alpha1\"\nmax_timeout = \"90m\"\nmax_attempts = 3\nmax_verify_attempts = 4\nmax_cost_usd = 2.5\n" +
				"permissions = [\"repository.read\", \"repository.write\", \"history.write\", \"state.write\"]\n" +
				"writing = [\"repository.write\", \"history.write\"]\nstate_reaching = [\"state.write\"]\n",
			want: serviceSettings{
				ceilings: policy.Ceilings{
					MaxTimeout:        90 * time.Minute,
					MaxAttempts:       3,
					MaxVerifyAttempts: 4,
					MaxCostUSD:        &cost,
					Permissions:       []string{"repository.read", "repository.write", "history.write", "state.write"},
					Writing:           []string{"repository.write", "history.write"},
				},
				stateReaching: []string{"state.write"},
			},
		},
		// One attempt and one verify attempt where the document sets
		// none, and no cost limit.
		"only what is required": {
			text: "schema = \"agister.service/v1alpha1\"\nmax_timeout = \"1h\"\npermissions = [\"repository.read\"]\nwriting = []\n",
			want: serviceSettings{
				ceilings: policy.Ceilings{
					MaxTimeout:        time.Hour,
					MaxAttempts:       1,
					MaxVerifyAttempts: 1,
					Permissions:       []string{"repository.read"},
					Writing:           []string{},
				},
			},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := serviceDocument(c.text, document.LayerFile{Layer: document.LayerHome, Path: "/home/service.toml"})
			ref := DocumentRef{Kind: document.KindService, Name: "service"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Service(context.Background())
			if err != nil || !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("service = %+v, source %+v, %v; want %+v, source %+v", got, source, err, c.want, doc.Source)
			}
		})
	}
}

// A service document with problems fails with the parser's
// *document.InvalidError: its problems in the parser's order, each
// attributed to the layer file that set the field at fault or, for a field
// none sets, to every file read, and the unknown ones flagged. What of the
// document parsed is given beside it, with the document's source.
func TestAServiceWithProblemsKeepsWhatParsedAndWhereEachProblemIs(t *testing.T) {
	t.Parallel()
	const repository, home = "/repo/.agister/service.toml", "/home/service.toml"
	layers := []document.LayerFile{
		{Layer: document.LayerRepository, Path: repository, Fields: []string{"max_attempts", "colour", "writing"}},
		{Layer: document.LayerHome, Path: home, Fields: []string{"schema", "max_verify_attempts", "max_cost_usd", "permissions", "writing", "state_reaching"}},
	}
	cost := 2.5
	for name, c := range map[string]struct {
		text     string
		want     serviceSettings
		problems []document.Problem
	}{
		"problems in two layers": {
			text: "schema = \"agister.service/v1alpha1\"\nmax_attempts = 0\nmax_verify_attempts = 4\nmax_cost_usd = 2.5\ncolour = \"red\"\n" +
				"permissions = [\"repository.read\", \"repository.write\", \"state.write\"]\n" +
				"writing = [\"repository.write\", \"history.write\"]\nstate_reaching = [\"state.write\"]\n",
			want: serviceSettings{
				ceilings: policy.Ceilings{
					MaxAttempts:       1,
					MaxVerifyAttempts: 4,
					MaxCostUSD:        &cost,
					Permissions:       []string{"repository.read", "repository.write", "state.write"},
					Writing:           []string{"repository.write", "history.write"},
				},
				stateReaching: []string{"state.write"},
			},
			problems: []document.Problem{
				{Message: "colour: unknown field (set in " + repository + ")", Unknown: true},
				{Message: "max_timeout: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "max_attempts: must be a positive integer (set in " + repository + ")"},
				{Message: "writing: \"history.write\" is not in permissions (set in " + repository + ", " + home + ")"},
			},
		},
		"a schema of a newer version": {
			text: "schema = \"agister.service/v2\"\nmax_timeout = \"1h\"\nmax_verify_attempts = 4\npermissions = [\"repository.read\"]\nwriting = []\n",
			want: serviceSettings{
				ceilings: policy.Ceilings{
					MaxTimeout:        time.Hour,
					MaxAttempts:       1,
					MaxVerifyAttempts: 4,
					Permissions:       []string{"repository.read"},
					Writing:           []string{},
				},
			},
			problems: []document.Problem{
				{Message: "schema: must be \"agister.service/v1alpha1\" (set in " + home + ")", Unknown: true},
			},
		},
		"no text": {
			text:     "\xff",
			problems: []document.Problem{{Message: "not a UTF-8 text file"}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := serviceDocument(c.text, layers...)
			ref := DocumentRef{Kind: document.KindService, Name: "service"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Service(context.Background())
			invalid, ok := err.(*document.InvalidError)
			if want := (&document.InvalidError{Subject: "service settings", Problems: c.problems}); unread(err) || !ok || !reflect.DeepEqual(invalid, want) {
				t.Fatalf("service error = %#v, want %#v", err, want)
			}
			if !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("service = %+v, source %+v; want %+v, source %+v", got, source, c.want, doc.Source)
			}
		})
	}
}

// mappingDocument is the document of the runtime mapping rt holding text,
// composed from the layer files given, nearest first.
func mappingDocument(text string, layers ...document.LayerFile) document.Document {
	return document.Document{
		Source: document.Source{Kind: document.KindRuntime, Name: "rt", Path: layers[0].Path, Layer: layers[0].Layer, SHA256: "digest of rt", Layers: layers},
		Bytes:  []byte(text),
	}
}

// A runtime mapping is read as the package uses it: its name, its adapter
// and the contract it describes, the efforts it supports, and what it
// offers a plan, exactly one primitive or any of them, each primitive with
// its grants and the versions it was verified for, beside the document's
// source.
func TestTheReaderGivesARuntimeMappingAsThePackageUsesIt(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		text string
		want runtimeMapping
	}{
		"exactly one primitive": {
			text: "schema: agister.runtime/v1alpha1\nname: rt\nadapter: spy\ncontract: spy/1\nefforts: [low, high]\nprimitives:\n  select: one\n  items:\n" +
				"    read-only: {grants: [repository.read], verified: [\"1.\", \"2.0.\"]}\n" +
				"    workspace-write: {grants: [repository.read, repository.write]}\n",
			want: runtimeMapping{
				name:     "rt",
				adapter:  "spy",
				contract: "spy/1",
				efforts:  []string{"low", "high"},
				offer: enforce.Offer{One: true, Primitives: []enforce.Primitive{
					{Name: "read-only", Grants: []string{"repository.read"}, Verified: []string{"1.", "2.0."}},
					{Name: "workspace-write", Grants: []string{"repository.read", "repository.write"}},
				}},
			},
		},
		// No efforts where the document lists none.
		"any of its primitives": {
			text: "schema: agister.runtime/v1alpha1\nname: rt\nadapter: other\ncontract: other/2\nprimitives:\n  select: any\n  items:\n" +
				"    Read: {grants: [repository.read], verified: [\"1.\"]}\n" +
				"    Shell: {grants: [process.execute, network], verified: [\"1.\"]}\n",
			want: runtimeMapping{
				name:     "rt",
				adapter:  "other",
				contract: "other/2",
				offer: enforce.Offer{Primitives: []enforce.Primitive{
					{Name: "Read", Grants: []string{"repository.read"}, Verified: []string{"1."}},
					{Name: "Shell", Grants: []string{"process.execute", "network"}, Verified: []string{"1."}},
				}},
			},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := mappingDocument(c.text,
				document.LayerFile{Layer: document.LayerRepository, Path: "/repo/.agister/runtimes/rt.yaml", Fields: []string{"efforts"}},
				document.LayerFile{Layer: document.LayerHome, Path: "/home/runtimes/rt.yaml", Fields: []string{"schema", "name", "adapter", "contract", "primitives.select"}})
			ref := DocumentRef{Kind: document.KindRuntime, Name: "rt"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Mapping(context.Background(), "rt")
			if err != nil || !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("mapping = %+v, source %+v, %v; want %+v, source %+v", got, source, err, c.want, doc.Source)
			}
		})
	}
}

// A runtime mapping with problems fails with the parser's
// *document.InvalidError: its problems in the parser's order, each
// attributed to the layer file that set the field at fault or, for a field
// none sets, to every file read, and the unknown ones flagged. What of the
// document parsed is given beside it, with the document's source.
func TestAMappingWithProblemsKeepsWhatParsedAndWhereEachProblemIs(t *testing.T) {
	t.Parallel()
	const repository, home = "/repo/.agister/runtimes/rt.yaml", "/home/runtimes/rt.yaml"
	layers := []document.LayerFile{
		{Layer: document.LayerRepository, Path: repository, Fields: []string{"colour", "primitives.items.Idle.grants"}},
		{Layer: document.LayerHome, Path: home, Fields: []string{"schema", "name", "adapter", "efforts", "primitives.select", "primitives.items.Read.grants", "primitives.items.Read.verified"}},
	}
	for name, c := range map[string]struct {
		text     string
		want     runtimeMapping
		problems []document.Problem
	}{
		"problems in two layers": {
			text: "schema: agister.runtime/v1alpha1\nname: rt\nadapter: spy\ncolour: red\nefforts: [high]\nprimitives:\n  select: some\n  items:\n" +
				"    Read: {grants: [repository.read], verified: [\"1.\"]}\n" +
				"    Idle: {grants: []}\n",
			want: runtimeMapping{
				name:    "rt",
				adapter: "spy",
				efforts: []string{"high"},
				offer: enforce.Offer{Primitives: []enforce.Primitive{
					{Name: "Read", Grants: []string{"repository.read"}, Verified: []string{"1."}},
					{Name: "Idle", Grants: []string{}},
				}},
			},
			problems: []document.Problem{
				{Message: "colour: unknown field (set in " + repository + ")", Unknown: true},
				{Message: "contract: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "primitives.select: must be \"any\" or \"one\" (set in " + home + ")"},
				{Message: "primitives.items.Idle.grants: must grant at least one permission (set in " + repository + ")"},
			},
		},
		"a schema of a newer version": {
			text: "schema: agister.runtime/v2\nname: rt\nadapter: spy\ncontract: spy/1\nefforts: [high]\nprimitives:\n  select: one\n  items:\n" +
				"    Read: {grants: [repository.read], verified: [\"1.\"]}\n",
			want: runtimeMapping{
				name:     "rt",
				adapter:  "spy",
				contract: "spy/1",
				efforts:  []string{"high"},
				offer: enforce.Offer{One: true, Primitives: []enforce.Primitive{
					{Name: "Read", Grants: []string{"repository.read"}, Verified: []string{"1."}},
				}},
			},
			problems: []document.Problem{
				{Message: "schema: must be \"agister.runtime/v1alpha1\" (set in " + home + ")", Unknown: true},
			},
		},
		// Only the name it was asked by, which no text gives.
		"no text": {
			text:     "\xff",
			want:     runtimeMapping{name: "rt"},
			problems: []document.Problem{{Message: "not a UTF-8 text file"}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := mappingDocument(c.text, layers...)
			ref := DocumentRef{Kind: document.KindRuntime, Name: "rt"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Mapping(context.Background(), "rt")
			invalid, ok := err.(*document.InvalidError)
			if want := (&document.InvalidError{Subject: "runtime mapping rt (" + repository + ")", Problems: c.problems}); unread(err) || !ok || !reflect.DeepEqual(invalid, want) {
				t.Fatalf("mapping error = %#v, want %#v", err, want)
			}
			if !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("mapping = %+v, source %+v; want %+v, source %+v", got, source, c.want, doc.Source)
			}
		})
	}
}

// A runtime mapping that was not read has no value: the reader maps
// nothing of it.
func TestAMappingThatWasNotReadHasNoValue(t *testing.T) {
	t.Parallel()
	ref := DocumentRef{Kind: document.KindRuntime, Name: "rt"}
	reader := newDocumentReader(definitionsFake{t: t, errs: map[DocumentRef]error{ref: document.ErrNotFound}})
	got, _, err := reader.Mapping(context.Background(), "rt")
	if !unread(err) || !reflect.DeepEqual(got, runtimeMapping{}) {
		t.Fatalf("mapping = %+v, %#v; want none and a failure to read", got, err)
	}
}

// agentDocument is the document of the agent a holding text, composed from
// the layer files given, nearest first.
func agentDocument(text string, layers ...document.LayerFile) document.Document {
	return document.Document{
		Source: document.Source{Kind: document.KindAgent, Name: "a", Path: layers[0].Path, Layer: layers[0].Layer, SHA256: "digest of a", Layers: layers},
		Bytes:  []byte(text),
	}
}

// An agent is read as the package uses it: its name, the runtime it runs
// on, its model and the model's family, its effort, its command and the
// skills its calls are given, each as the document says it, beside the
// document's source.
func TestTheReaderGivesAnAgentAsThePackageUsesIt(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		text string
		want agentProfile
	}{
		"every field": {
			text: "schema = \"agister.agent/v1alpha1\"\nname = \"a\"\nruntime = \"rt\"\nmodel = \"m1\"\nmodel_family = \"fam\"\n" +
				"effort = \"high\"\ncommand = \"/bin/spy\"\nskills = [\"review\", \"style\"]\n",
			want: agentProfile{
				name:        "a",
				runtime:     "rt",
				model:       "m1",
				modelFamily: "fam",
				effort:      "high",
				command:     "/bin/spy",
				skills:      []string{"review", "style"},
			},
		},
		// Nothing but its name and runtime where the document sets no
		// more, and no skills.
		"only what is required": {
			text: "schema = \"agister.agent/v1alpha1\"\nname = \"a\"\nruntime = \"other\"\n",
			want: agentProfile{name: "a", runtime: "other"},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := agentDocument(c.text,
				document.LayerFile{Layer: document.LayerRepository, Path: "/repo/.agister/agents/a.toml", Fields: []string{"effort"}},
				document.LayerFile{Layer: document.LayerHome, Path: "/home/agents/a.toml", Fields: []string{"schema", "name", "runtime"}})
			ref := DocumentRef{Kind: document.KindAgent, Name: "a"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Agent(context.Background(), "a")
			if err != nil || !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("agent = %+v, source %+v, %v; want %+v, source %+v", got, source, err, c.want, doc.Source)
			}
		})
	}
}

// An agent with problems fails with the parser's *document.InvalidError:
// its problems in the parser's order, each attributed to the layer file
// that set the field at fault or, for a field none sets, to every file
// read, and the unknown ones flagged. What of the document parsed is given
// beside it, with the document's source.
func TestAnAgentWithProblemsKeepsWhatParsedAndWhereEachProblemIs(t *testing.T) {
	t.Parallel()
	const repository, home = "/repo/.agister/agents/a.toml", "/home/agents/a.toml"
	layers := []document.LayerFile{
		{Layer: document.LayerRepository, Path: repository, Fields: []string{"colour", "effort", "skills"}},
		{Layer: document.LayerHome, Path: home, Fields: []string{"schema", "name", "model", "model_family", "command", "session", "skills"}},
	}
	for name, c := range map[string]struct {
		text     string
		want     agentProfile
		problems []document.Problem
	}{
		"problems in two layers": {
			text: "schema = \"agister.agent/v1alpha1\"\nname = \"a\"\nmodel = \"m1\"\nmodel_family = \"fam\"\neffort = \"\"\ncolour = \"red\"\n" +
				"command = \"/bin/spy\"\nsession = \"resumable\"\nskills = [\"review\", \"Bad Name\", \"review\", \"style\"]\n",
			want: agentProfile{
				name:        "a",
				model:       "m1",
				modelFamily: "fam",
				command:     "/bin/spy",
				skills:      []string{"review", "style"},
			},
			problems: []document.Problem{
				{Message: "colour: unknown field (set in " + repository + ")", Unknown: true},
				{Message: "runtime: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "effort: must be a non-empty string (set in " + repository + ")"},
				{Message: "skills[1]: invalid skill name \"Bad Name\" (set in " + repository + ", " + home + ")"},
				{Message: "skills[2]: skill \"review\" is named twice (also skills[0]) (set in " + repository + ", " + home + ")"},
				{Message: "session: an agent holds no session (ADR-030 rule 1): set session on each process whose calls resume theirs, and remove it here (set in " + home + ")"},
			},
		},
		"a schema of a newer version": {
			text: "schema = \"agister.agent/v2\"\nname = \"a\"\nruntime = \"rt\"\nmodel = \"m1\"\nmodel_family = \"fam\"\n" +
				"effort = \"high\"\ncommand = \"/bin/spy\"\nskills = [\"review\"]\n",
			want: agentProfile{
				name:        "a",
				runtime:     "rt",
				model:       "m1",
				modelFamily: "fam",
				effort:      "high",
				command:     "/bin/spy",
				skills:      []string{"review"},
			},
			problems: []document.Problem{
				{Message: "schema: must be \"agister.agent/v1alpha1\" (set in " + home + ")", Unknown: true},
			},
		},
		// The name it declares, not the one it was asked by.
		"another agent's name": {
			text: "schema = \"agister.agent/v1alpha1\"\nname = \"b\"\nruntime = \"rt\"\n",
			want: agentProfile{name: "b", runtime: "rt"},
			problems: []document.Problem{
				{Message: "name: \"b\" does not match its definition name \"a\" (set in " + home + ")"},
			},
		},
		"no text": {
			text:     "\xff",
			problems: []document.Problem{{Message: "not a UTF-8 text file"}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := agentDocument(c.text, layers...)
			ref := DocumentRef{Kind: document.KindAgent, Name: "a"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Agent(context.Background(), "a")
			invalid, ok := err.(*document.InvalidError)
			if want := (&document.InvalidError{Subject: "agent a (" + repository + ")", Problems: c.problems}); unread(err) || !ok || !reflect.DeepEqual(invalid, want) {
				t.Fatalf("agent error = %#v, want %#v", err, want)
			}
			if !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("agent = %+v, source %+v; want %+v, source %+v", got, source, c.want, doc.Source)
			}
		})
	}
}

// An agent that was not read has no value: the reader maps nothing of it.
func TestAnAgentThatWasNotReadHasNoValue(t *testing.T) {
	t.Parallel()
	ref := DocumentRef{Kind: document.KindAgent, Name: "a"}
	reader := newDocumentReader(definitionsFake{t: t, errs: map[DocumentRef]error{ref: document.ErrNotFound}})
	got, _, err := reader.Agent(context.Background(), "a")
	if !unread(err) || !reflect.DeepEqual(got, agentProfile{}) {
		t.Fatalf("agent = %+v, %#v; want none and a failure to read", got, err)
	}
}

// An agent is formatted as its settings document: the schema, then each
// value it has, in the document's order, and no key for one it lacks.
func TestAnAgentIsFormattedAsItsSettingsDocument(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		agent agentProfile
		want  string
	}{
		"every value": {
			agent: agentProfile{name: "a", runtime: "rt", model: "m1", modelFamily: "fam", effort: "high", command: "/bin/spy", skills: []string{"review", "style"}},
			want: "schema = \"agister.agent/v1alpha1\"\nname = \"a\"\nruntime = \"rt\"\nmodel = \"m1\"\nmodel_family = \"fam\"\n" +
				"effort = \"high\"\ncommand = \"/bin/spy\"\nskills = [\"review\", \"style\"]\n",
		},
		"only what is required": {
			agent: agentProfile{name: "a", runtime: "rt"},
			want:  "schema = \"agister.agent/v1alpha1\"\nname = \"a\"\nruntime = \"rt\"\n",
		},
		"no skills": {
			agent: agentProfile{name: "a", runtime: "rt", effort: "high", skills: []string{}},
			want:  "schema = \"agister.agent/v1alpha1\"\nname = \"a\"\nruntime = \"rt\"\neffort = \"high\"\n",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := string(formatAgent(c.agent)); got != c.want {
				t.Fatalf("formatted agent =\n%s\nwant\n%s", got, c.want)
			}
		})
	}
}

// The skills of a call are the process's, then its agent's that the
// process does not name, each once (ADR-021 rule 2).
func TestTheSkillsOfACallAreTheProcessThenItsAgents(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		process, agent, want []string
	}{
		"both name some":    {process: []string{"review", "tests"}, agent: []string{"style", "review", "git"}, want: []string{"review", "tests", "style", "git"}},
		"only the process":  {process: []string{"review", "tests"}, want: []string{"review", "tests"}},
		"only the agent":    {agent: []string{"style", "git"}, want: []string{"style", "git"}},
		"neither names any": {},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			got := callSkills(declaredProcess{name: "p", skills: c.process}, agentProfile{name: "a", runtime: "rt", skills: c.agent})
			if !slices.Equal(got, c.want) {
				t.Fatalf("skills of the call = %q, want %q", got, c.want)
			}
		})
	}
}

// promptDocument is the document of the prompt inspect holding text, held
// by the layer files given, nearest first.
func promptDocument(text string, layers ...document.LayerFile) document.Document {
	return document.Document{
		Source: document.Source{Kind: document.KindPrompt, Name: "inspect", Path: layers[0].Path, Layer: layers[0].Layer, SHA256: "digest of inspect", Layers: layers},
		Bytes:  []byte(text),
	}
}

// A prompt is read as the package uses it: its name, its text as the
// document holds it and the digest that identifies the text, beside the
// document's source.
func TestTheReaderGivesAPromptAsThePackageUsesIt(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		text string
		want promptText
	}{
		// The text unchanged, its blank lines and its last newline too.
		"a text": {
			text: "\nInspect the change for defects.\n\nReport each with its line.\n",
			want: promptText{name: "inspect", text: "\nInspect the change for defects.\n\nReport each with its line.\n", sha256: "digest of inspect"},
		},
		"an empty text": {
			want: promptText{name: "inspect", sha256: "digest of inspect"},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := promptDocument(c.text,
				document.LayerFile{Layer: document.LayerRepository, Path: "/repo/.agister/prompts/inspect.md"},
				document.LayerFile{Layer: document.LayerHome, Path: "/home/prompts/inspect.md"})
			ref := DocumentRef{Kind: document.KindPrompt, Name: "inspect"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Prompt(context.Background(), "inspect")
			if err != nil || !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("prompt = %+v, source %+v, %v; want %+v, source %+v", got, source, err, c.want, doc.Source)
			}
		})
	}
}

// A prompt that is no text fails with the parser's *document.InvalidError,
// as a call reads it and as the settings list it. What of the document
// parsed is given beside it, its name and its digest, with the document's
// source.
func TestAPromptWithProblemsKeepsWhatParsed(t *testing.T) {
	t.Parallel()
	const repository = "/repo/.agister/prompts/inspect.md"
	ref := DocumentRef{Kind: document.KindPrompt, Name: "inspect"}
	for name, text := range map[string]string{
		"not UTF-8":   "Inspect the change.\xff\n",
		"a NUL in it": "Inspect the change.\x00\n",
	} {
		for read, c := range map[string]struct {
			definitions func(*testing.T, document.Document) definitionsFake
			read        func(documentReader) (promptText, document.Source, error)
		}{
			"as a call reads it": {
				definitions: func(t *testing.T, doc document.Document) definitionsFake {
					return definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}}
				},
				read: func(r documentReader) (promptText, document.Source, error) {
					return r.Prompt(context.Background(), "inspect")
				},
			},
			"as the settings list it": {
				definitions: func(t *testing.T, doc document.Document) definitionsFake {
					return definitionsFake{t: t, listed: map[DocumentRef]document.Document{ref: doc}}
				},
				read: func(r documentReader) (promptText, document.Source, error) {
					return r.ListedPrompt(context.Background(), "inspect")
				},
			},
		} {
			t.Run(name+" "+read, func(t *testing.T) {
				t.Parallel()
				doc := promptDocument(text,
					document.LayerFile{Layer: document.LayerRepository, Path: repository},
					document.LayerFile{Layer: document.LayerHome, Path: "/home/prompts/inspect.md"})
				got, source, err := c.read(newDocumentReader(c.definitions(t, doc)))
				invalid, ok := err.(*document.InvalidError)
				want := &document.InvalidError{Subject: "prompt inspect (" + repository + ")", Problems: []document.Problem{{Message: "not a UTF-8 text file"}}}
				if unread(err) || !ok || !reflect.DeepEqual(invalid, want) {
					t.Fatalf("prompt error = %#v, want %#v", err, want)
				}
				if want := (promptText{name: "inspect", sha256: "digest of inspect"}); !reflect.DeepEqual(got, want) || !reflect.DeepEqual(source, doc.Source) {
					t.Fatalf("prompt = %+v, source %+v; want %+v, source %+v", got, source, want, doc.Source)
				}
			})
		}
	}
}

// A prompt that was not read has no value: the reader maps nothing of it.
func TestAPromptThatWasNotReadHasNoValue(t *testing.T) {
	t.Parallel()
	ref := DocumentRef{Kind: document.KindPrompt, Name: "inspect"}
	reader := newDocumentReader(definitionsFake{t: t, errs: map[DocumentRef]error{ref: document.ErrNotFound}})
	got, _, err := reader.Prompt(context.Background(), "inspect")
	if !unread(err) || !reflect.DeepEqual(got, promptText{}) {
		t.Fatalf("prompt = %+v, %#v; want none and a failure to read", got, err)
	}
}

// briefDocument is the document of the brief form goal holding text,
// composed from the layer files given, nearest first.
func briefDocument(text string, layers ...document.LayerFile) document.Document {
	return document.Document{
		Source: document.Source{Kind: document.KindBrief, Name: "goal", Path: layers[0].Path, Layer: layers[0].Layer, SHA256: "digest of goal", Layers: layers},
		Bytes:  []byte(text),
	}
}

// A brief form is read as the package uses it: its parts in the order the
// document declares them, each with its heading, whether it is required,
// the text it must read and what it refers to, beside the document's
// source.
func TestTheReaderGivesABriefFormAsThePackageUsesIt(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		text string
		want briefForm
	}{
		"every field of a part": {
			text: "schema: agister.brief/v1alpha1\nname: goal\nstatus: active\nparts:\n" +
				"  - {heading: \"# Goal\", required: true, reference: file}\n" +
				"  - {heading: \"## Intent\", required: true}\n" +
				"  - {heading: \"## Notes\", required: false}\n" +
				"  - {heading: \"## Open\", required: true, reads: None.}\n" +
				"template: |\n  # Goal\n\n  `goals/<name>.md`\n\n  ## Intent\n\n  ## Notes\n\n  ## Open\n\n  None.\n",
			want: briefForm{parts: []briefPart{
				{heading: "# Goal", required: true, reference: "file"},
				{heading: "## Intent", required: true},
				{heading: "## Notes"},
				{heading: "## Open", required: true, reads: "None."},
			}},
		},
		"one part": {
			text: "schema: agister.brief/v1alpha1\nname: goal\nparts:\n  - {heading: \"## Intent\", required: false}\ntemplate: |\n  ## Intent\n",
			want: briefForm{parts: []briefPart{{heading: "## Intent"}}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := briefDocument(c.text,
				document.LayerFile{Layer: document.LayerRepository, Path: "/repo/.agister/briefs/goal.yaml", Fields: []string{"template"}},
				document.LayerFile{Layer: document.LayerHome, Path: "/home/briefs/goal.yaml", Fields: []string{"schema", "name", "parts", "template"}})
			ref := DocumentRef{Kind: document.KindBrief, Name: "goal"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Brief(context.Background(), "goal")
			if err != nil || !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("brief form = %+v, source %+v, %v; want %+v, source %+v", got, source, err, c.want, doc.Source)
			}
		})
	}
}

// A brief form with problems fails with the parser's
// *document.InvalidError: its problems in the parser's order, each
// attributed to the layer file that set the field at fault or, for a field
// none sets, to every file read, and the unknown ones flagged. What of the
// document parsed is given beside it, with the document's source.
func TestABriefFormWithProblemsKeepsWhatParsedAndWhereEachProblemIs(t *testing.T) {
	t.Parallel()
	const repository, home = "/repo/.agister/briefs/goal.yaml", "/home/briefs/goal.yaml"
	layers := []document.LayerFile{
		{Layer: document.LayerRepository, Path: repository, Fields: []string{"colour", "parts"}},
		{Layer: document.LayerHome, Path: home, Fields: []string{"schema", "parts", "template"}},
	}
	for name, c := range map[string]struct {
		text     string
		want     briefForm
		problems []document.Problem
	}{
		// Each part as far as it parsed: a heading that is none, a part
		// that does not say whether it is required, and a reference to
		// what is no file.
		"problems in two layers": {
			text: "schema: agister.brief/v1alpha1\ncolour: red\nparts:\n" +
				"  - {heading: \"## Intent\", required: true}\n" +
				"  - {heading: Notes, required: false}\n" +
				"  - {heading: \"## Goal\", reference: url}\n" +
				"  - {heading: \"## Intent\", required: true, reads: None.}\n" +
				"template: |\n  ## Intent\n",
			want: briefForm{parts: []briefPart{
				{heading: "## Intent", required: true},
				{heading: "Notes"},
				{heading: "## Goal", reference: "url"},
				{heading: "## Intent", required: true, reads: "None."},
			}},
			problems: []document.Problem{
				{Message: "colour: unknown field (set in " + repository + ")", Unknown: true},
				{Message: "name: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "parts[1].heading: \"Notes\" is not a Markdown heading line, such as \"## Intent\" (set in " + repository + ", " + home + ")"},
				{Message: "parts[2].required: is required (set in " + repository + ", " + home + ")"},
				{Message: "parts[2].reference: must be \"file\" (set in " + repository + ", " + home + ")"},
				{Message: "parts[3].heading: \"## Intent\" is also the heading of parts[0] (set in " + repository + ", " + home + ")"},
			},
		},
		"a schema of a newer version": {
			text: "schema: agister.brief/v2\nname: goal\nparts:\n  - {heading: \"## Intent\", required: true}\ntemplate: |\n  ## Intent\n",
			want: briefForm{parts: []briefPart{{heading: "## Intent", required: true}}},
			problems: []document.Problem{
				{Message: "schema: must be \"agister.brief/v1alpha1\" (set in " + home + ")", Unknown: true},
			},
		},
		// Its parts, whose headings its template does not have in their
		// order.
		"a template that is not its parts'": {
			text: "schema: agister.brief/v1alpha1\nname: goal\nparts:\n" +
				"  - {heading: \"## Intent\", required: true}\n" +
				"  - {heading: \"## Open\", required: true, reads: None.}\n" +
				"  - {heading: \"## Notes\", required: false}\n" +
				"template: |\n  ## Open\n\n  None.\n\n  ## Intent\n\n  ## Open\n",
			want: briefForm{parts: []briefPart{
				{heading: "## Intent", required: true},
				{heading: "## Open", required: true, reads: "None."},
				{heading: "## Notes"},
			}},
			problems: []document.Problem{
				{Message: "template: has heading \"## Open\" more than once (set in " + home + ")"},
				{Message: "template: has no heading \"## Notes\" (set in " + home + ")"},
			},
		},
		"no parts": {
			text: "schema: agister.brief/v1alpha1\nname: goal\nparts: []\ntemplate: |\n  ## Intent\n",
			problems: []document.Problem{
				{Message: "parts: must list at least one part (set in " + repository + ", " + home + ")"},
			},
		},
		"no text": {
			text:     "\xff",
			problems: []document.Problem{{Message: "not a UTF-8 text file"}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := briefDocument(c.text, layers...)
			ref := DocumentRef{Kind: document.KindBrief, Name: "goal"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Brief(context.Background(), "goal")
			invalid, ok := err.(*document.InvalidError)
			if want := (&document.InvalidError{Subject: "brief goal (" + repository + ")", Problems: c.problems}); unread(err) || !ok || !reflect.DeepEqual(invalid, want) {
				t.Fatalf("brief form error = %#v, want %#v", err, want)
			}
			if !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("brief form = %+v, source %+v; want %+v, source %+v", got, source, c.want, doc.Source)
			}
		})
	}
}

// A brief form that was not read has no value: the reader maps nothing of
// it.
func TestABriefFormThatWasNotReadHasNoValue(t *testing.T) {
	t.Parallel()
	ref := DocumentRef{Kind: document.KindBrief, Name: "goal"}
	reader := newDocumentReader(definitionsFake{t: t, errs: map[DocumentRef]error{ref: document.ErrNotFound}})
	got, _, err := reader.Brief(context.Background(), "goal")
	if !unread(err) || !reflect.DeepEqual(got, briefForm{}) {
		t.Fatalf("brief form = %+v, %#v; want none and a failure to read", got, err)
	}
}

// A text is checked against a brief form by its parts (ADR-026 rule 8):
// each part that appears more than once, each required part that is missing
// or empty, each part that does not read as the form says, and each part
// that refers to a file and names none in back quotes, or one that resolve
// refuses, asked with the path as written. A part that is not required may
// be missing, or empty.
func TestATextIsCheckedAgainstABriefFormByItsParts(t *testing.T) {
	t.Parallel()
	form := briefForm{parts: []briefPart{
		{heading: "# Goal", required: true, reference: "file"},
		{heading: "## Intent", required: true},
		{heading: "## Notes"},
		{heading: "## Open", required: true, reads: "None."},
	}}
	for name, c := range map[string]struct {
		form     briefForm
		text     string
		want     []string
		resolved []string // the paths resolve was asked, in order
	}{
		"the form": {
			form:     form,
			text:     "# Goal\n\nSee `goals/g.md`, not `other.md`.\n\n## Intent\n\nWhy.\n\n## Notes\n\n## Open\n\nNone.\n",
			resolved: []string{"goals/g.md"},
		},
		"without the part that is not required": {
			form:     form,
			text:     "# Goal\n\n`goals/g.md`\n\n## Intent\n\nWhy.\n\n## Open\n\nNone.\n",
			resolved: []string{"goals/g.md"},
		},
		"a file that is refused": {
			form:     form,
			text:     "# Goal\n\n`goals/missing.md`\n\n## Intent\n\nWhy.\n\n## Open\n\nNone.\n",
			want:     []string{`part "# Goal": file goals/missing.md does not exist`},
			resolved: []string{"goals/missing.md"},
		},
		"parts that are not as the form says": {
			form: form,
			text: "# Goal\n\nSee the goal.\n\n## Intent\n\n## Notes\n\nOne.\n\n## Notes\n\nTwo.\n\n## Open\n\nSome.\n",
			want: []string{
				`part "# Goal" names no file in back quotes`,
				`part "## Intent" is empty`,
				`part "## Notes" appears 2 times`,
				`part "## Open" must read "None."`,
			},
		},
		"no part": {
			form: form,
			text: "Inspect the change.\n",
			want: []string{
				`part "# Goal" is missing`,
				`part "## Intent" is missing`,
				`part "## Open" is missing`,
			},
		},
		"a form of no parts": {
			text: "## Intent\n",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			var resolved []string
			got := formCheck(c.form)(c.text, func(path string) error {
				resolved = append(resolved, path)
				if path == "goals/missing.md" {
					return errors.New("file " + path + " does not exist")
				}
				return nil
			})
			if !slices.Equal(got, c.want) || !slices.Equal(resolved, c.resolved) {
				t.Fatalf("check = %q, resolving %q; want %q, resolving %q", got, resolved, c.want, c.resolved)
			}
		})
	}
}

// skillDocument is the document of the skill review holding text, held by
// the layer files given, nearest first.
func skillDocument(text string, layers ...document.LayerFile) document.Document {
	return document.Document{
		Source: document.Source{Kind: document.KindSkill, Name: "review", Path: layers[0].Path, Layer: layers[0].Layer, SHA256: "digest of review", Layers: layers},
		Bytes:  []byte(text),
	}
}

// A skill is read as the package uses it: its name, its whole document
// unchanged, front matter included, and the digest that identifies it,
// beside the document's source.
func TestTheReaderGivesASkillAsThePackageUsesIt(t *testing.T) {
	t.Parallel()
	for name, text := range map[string]string{
		"a skill": "---\nname: review\ndescription: How to review a change.\n---\n\n# review\n\nRead the diff first.\n",
		// What else its front matter holds is its runtime's to read.
		"more in its front matter": "---\nname: review\ndescription: How to review a change.\nallowed-tools: Read, Grep\n---\n",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := skillDocument(text,
				document.LayerFile{Layer: document.LayerRepository, Path: "/repo/.agister/skills/review/SKILL.md"},
				document.LayerFile{Layer: document.LayerHome, Path: "/home/skills/review/SKILL.md"})
			ref := DocumentRef{Kind: document.KindSkill, Name: "review"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Skill(context.Background(), "review")
			want := givenSkill{name: "review", bytes: []byte(text), sha256: "digest of review"}
			if err != nil || !reflect.DeepEqual(got, want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("skill = %+v, source %+v, %v; want %+v, source %+v", got, source, err, want, doc.Source)
			}
		})
	}
}

// A skill with problems fails with the parser's *document.InvalidError,
// its problems in the parser's order. What of the document parsed is given
// beside it, with the document's source: the name it was asked by, its
// digest, and its bytes where it is a text.
func TestASkillWithProblemsKeepsWhatParsed(t *testing.T) {
	t.Parallel()
	const repository = "/repo/.agister/skills/review/SKILL.md"
	for name, c := range map[string]struct {
		text     string
		problems []document.Problem
		noBytes  bool
	}{
		"another skill's name and no description": {
			text: "---\nname: style\n---\n\n# review\n",
			problems: []document.Problem{
				{Message: "name: \"style\" does not match its definition name \"review\""},
				{Message: "description: is required"},
			},
		},
		"an empty description": {
			text:     "---\nname: review\ndescription: \" \"\n---\n",
			problems: []document.Problem{{Message: "description: must not be empty"}},
		},
		"no front matter": {
			text:     "# review\n\nRead the diff first.\n",
			problems: []document.Problem{{Message: "has no front matter: it starts with a line ---, then name and description, then a line ---"}},
		},
		"front matter that is not closed": {
			text:     "---\nname: review\ndescription: How to review a change.\n",
			problems: []document.Problem{{Message: "front matter is not closed by a line ---"}},
		},
		"front matter that is no mapping": {
			text:     "---\n- review\n---\n",
			problems: []document.Problem{{Message: "front matter: must be a mapping with name and description"}},
		},
		"no text": {
			text:     "\xff",
			problems: []document.Problem{{Message: "not a UTF-8 text file"}},
			noBytes:  true,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := skillDocument(c.text,
				document.LayerFile{Layer: document.LayerRepository, Path: repository},
				document.LayerFile{Layer: document.LayerHome, Path: "/home/skills/review/SKILL.md"})
			ref := DocumentRef{Kind: document.KindSkill, Name: "review"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Skill(context.Background(), "review")
			invalid, ok := err.(*document.InvalidError)
			if want := (&document.InvalidError{Subject: "skill review (" + repository + ")", Problems: c.problems}); unread(err) || !ok || !reflect.DeepEqual(invalid, want) {
				t.Fatalf("skill error = %#v, want %#v", err, want)
			}
			want := givenSkill{name: "review", bytes: []byte(c.text), sha256: "digest of review"}
			if c.noBytes {
				want.bytes = nil
			}
			if !reflect.DeepEqual(got, want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("skill = %+v, source %+v; want %+v, source %+v", got, source, want, doc.Source)
			}
		})
	}
}

// A skill that was not read has no value: the reader maps nothing of it.
func TestASkillThatWasNotReadHasNoValue(t *testing.T) {
	t.Parallel()
	ref := DocumentRef{Kind: document.KindSkill, Name: "review"}
	reader := newDocumentReader(definitionsFake{t: t, errs: map[DocumentRef]error{ref: document.ErrNotFound}})
	got, _, err := reader.Skill(context.Background(), "review")
	if !unread(err) || !reflect.DeepEqual(got, givenSkill{}) {
		t.Fatalf("skill = %+v, %#v; want none and a failure to read", got, err)
	}
}

// workflowDocument is the document of the workflow review holding text,
// composed from the layer files given, nearest first.
func workflowDocument(text string, layers ...document.LayerFile) document.Document {
	return document.Document{
		Source: document.Source{Kind: document.KindWorkflow, Name: "review", Path: layers[0].Path, Layer: layers[0].Layer, SHA256: "digest of review", Layers: layers},
		Bytes:  []byte(text),
	}
}

// A workflow is read as the package uses it, beside the document's source:
// its params, each with its default where it has one, its input values in
// the order the document declares them, each with its source, its
// arguments as written and the forms it names, and its nodes, each with
// its process and its agent: the fan-out nodes in the document's order and
// the join, or the one call.
func TestTheReaderGivesAWorkflowAsThePackageUsesIt(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		text string
		want declaredWorkflow
	}{
		"a workflow that fans out and joins": {
			text: "schema: agister.workflow/v1alpha1\nname: review\nstatus: active\ntype: workflow\ninput:\n" +
				"  params:\n" +
				"    candidate: {default: HEAD}\n" +
				"    brief: {}\n" +
				"    note: {default: \"\"}\n" +
				"  values:\n" +
				"    candidate: {source: git.revision, rev: \"${param.candidate}\"}\n" +
				"    diff: {source: git.diff, base: main, head: \"${value.candidate}\"}\n" +
				"    brief: {source: file, path: \"${param.brief}\", form: [goal, step]}\n" +
				"    status: {source: git.status}\n" +
				"fan_out:\n" +
				"  - {node: zeta, uses: process:inspect, agent: codex}\n" +
				"  - {node: alpha, uses: process:inspect, agent: pi}\n" +
				"  - {node: mid, uses: process:audit, agent: codex}\n" +
				"join: {node: merge, uses: process:consolidate, agent: claude}\n",
			want: declaredWorkflow{
				name: "review",
				params: []declaredParam{
					{name: "candidate", defaultValue: "HEAD", hasDefault: true},
					{name: "brief"},
					{name: "note", hasDefault: true},
				},
				values: []declaredValue{
					{name: "candidate", source: "git.revision", args: map[string]string{"rev": "${param.candidate}"}},
					{name: "diff", source: "git.diff", args: map[string]string{"base": "main", "head": "${value.candidate}"}},
					{name: "brief", source: "file", args: map[string]string{"path": "${param.brief}"}, forms: []string{"goal", "step"}},
					{name: "status", source: "git.status", args: map[string]string{}},
				},
				fanOut: []workflowNode{
					{name: "zeta", process: "inspect", agent: "codex"},
					{name: "alpha", process: "inspect", agent: "pi"},
					{name: "mid", process: "audit", agent: "codex"},
				},
				join: workflowNode{name: "merge", process: "consolidate", agent: "claude"},
			},
		},
		// Its process's params and inputs are the workflow's: it declares
		// none.
		"a workflow of one call": {
			text: "schema: agister.workflow/v1alpha1\nname: review\ntype: workflow\ncall: {node: implement, uses: process:build, agent: codex}\n",
			want: declaredWorkflow{name: "review", call: &workflowNode{name: "implement", process: "build", agent: "codex"}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := workflowDocument(c.text,
				document.LayerFile{Layer: document.LayerRepository, Path: "/repo/.agister/workflows/review.yaml", Fields: []string{"join.agent"}},
				document.LayerFile{Layer: document.LayerHome, Path: "/home/workflows/review.yaml", Fields: []string{"schema", "name", "type", "fan_out", "join.node", "join.uses"}})
			ref := DocumentRef{Kind: document.KindWorkflow, Name: "review"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Workflow(context.Background(), "review")
			if err != nil || !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("workflow = %+v, source %+v, %v; want %+v, source %+v", got, source, err, c.want, doc.Source)
			}
		})
	}
}

// A workflow with problems fails with the parser's *document.InvalidError:
// its problems in the parser's order, each attributed to the layer file
// that set the field at fault or, for a field none sets, to every file
// read, and the unknown ones flagged. What of the document parsed is given
// beside it, with the document's source.
func TestAWorkflowWithProblemsKeepsWhatParsedAndWhereEachProblemIs(t *testing.T) {
	t.Parallel()
	const repository, home = "/repo/.agister/workflows/review.yaml", "/home/workflows/review.yaml"
	layers := []document.LayerFile{
		{Layer: document.LayerRepository, Path: repository, Fields: []string{"colour", "join.agent"}},
		{Layer: document.LayerHome, Path: home, Fields: []string{
			"schema", "type", "input.params.candidate.default", "input.values.candidate.source", "input.values.candidate.rev", "input.values.brief.path",
			"fan_out", "join.node", "join.uses", "call.node", "call.uses", "call.agent",
		}},
	}
	for name, c := range map[string]struct {
		text     string
		want     declaredWorkflow
		problems []document.Problem
	}{
		// Each param, value and node as far as it parsed: a value that
		// refers to a param nothing declares and one that names no source,
		// a node that uses no process, one named as an earlier one is and
		// a join bound to what is no agent's name.
		"problems in two layers": {
			text: "schema: agister.workflow/v1alpha1\ncolour: red\ntype: workflow\ninput:\n" +
				"  params:\n" +
				"    candidate: {default: HEAD}\n" +
				"  values:\n" +
				"    candidate: {source: git.revision, rev: \"${param.revision}\"}\n" +
				"    brief: {path: goal.md}\n" +
				"fan_out:\n" +
				"  - {node: zeta, uses: inspect, agent: codex}\n" +
				"  - {node: zeta, uses: process:inspect, agent: pi}\n" +
				"join: {node: merge, uses: process:consolidate, agent: Claude}\n",
			want: declaredWorkflow{
				name:   "review",
				params: []declaredParam{{name: "candidate", defaultValue: "HEAD", hasDefault: true}},
				values: []declaredValue{
					{name: "candidate", source: "git.revision", args: map[string]string{"rev": "${param.revision}"}},
					{name: "brief", args: map[string]string{"path": "goal.md"}},
				},
				fanOut: []workflowNode{
					{name: "zeta", agent: "codex"},
					{name: "zeta", process: "inspect", agent: "pi"},
				},
				join: workflowNode{name: "merge", process: "consolidate"},
			},
			problems: []document.Problem{
				{Message: "colour: unknown field (set in " + repository + ")", Unknown: true},
				{Message: "name: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "input.values.candidate: refers to ${param.revision}, which is not declared in input.params (set in " + home + ")"},
				{Message: "input.values.brief.source: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "fan_out[0].uses: must be \"process:<name>\" (set in " + home + ")"},
				{Message: "fan_out[1].node: duplicate node name \"zeta\" (also fan_out[0]) (set in " + home + ")"},
				{Message: "join.agent: must be an agent's name, not \"Claude\" (set in " + repository + ")"},
			},
		},
		"a schema of a newer version": {
			text: "schema: agister.workflow/v2\nname: review\ntype: workflow\ncall: {node: implement, uses: process:build, agent: codex}\n",
			want: declaredWorkflow{name: "review", call: &workflowNode{name: "implement", process: "build", agent: "codex"}},
			problems: []document.Problem{
				{Message: "schema: must be \"agister.workflow/v1alpha1\" (set in " + home + ")", Unknown: true},
			},
		},
		// One call is the whole workflow: what is declared beside it is not
		// read.
		"a call beside inputs and nodes": {
			text: "schema: agister.workflow/v1alpha1\nname: review\ntype: workflow\ninput:\n" +
				"  params:\n" +
				"    candidate: {default: HEAD}\n" +
				"fan_out:\n" +
				"  - {node: zeta, uses: process:inspect, agent: codex}\n" +
				"join: {node: merge, uses: process:consolidate, agent: claude}\n" +
				"call: {node: implement, uses: process:build, agent: codex}\n",
			want: declaredWorkflow{name: "review", call: &workflowNode{name: "implement", process: "build", agent: "codex"}},
			problems: []document.Problem{
				{Message: "input: a workflow with call has no input (ADR-030 rule 6) (set in " + home + ")"},
				{Message: "fan_out: a workflow with call has no fan_out (ADR-030 rule 6) (set in " + home + ")"},
				{Message: "join: a workflow with call has no join (ADR-030 rule 6) (set in " + repository + ", " + home + ")"},
			},
		},
		"no node": {
			text: "schema: agister.workflow/v1alpha1\nname: review\ntype: workflow\ninput:\n" +
				"  params:\n" +
				"    brief: {}\n" +
				"  values:\n" +
				"    brief: {source: file, path: \"${param.brief}\", form: [goal]}\n",
			want: declaredWorkflow{
				name:   "review",
				params: []declaredParam{{name: "brief"}},
				values: []declaredValue{{name: "brief", source: "file", args: map[string]string{"path": "${param.brief}"}, forms: []string{"goal"}}},
			},
			problems: []document.Problem{
				{Message: "fan_out: is required: a workflow needs at least one fan-out node (set in " + home + ")"},
				{Message: "join: is required (set in " + repository + ", " + home + ")"},
			},
		},
		"no text": {
			text:     "\xff",
			want:     declaredWorkflow{name: "review"},
			problems: []document.Problem{{Message: "not a UTF-8 text file"}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := workflowDocument(c.text, layers...)
			ref := DocumentRef{Kind: document.KindWorkflow, Name: "review"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Workflow(context.Background(), "review")
			invalid, ok := err.(*document.InvalidError)
			if want := (&document.InvalidError{Subject: "workflow review (" + repository + ")", Problems: c.problems}); unread(err) || !ok || !reflect.DeepEqual(invalid, want) {
				t.Fatalf("workflow error = %#v, want %#v", err, want)
			}
			if !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("workflow = %+v, source %+v; want %+v, source %+v", got, source, c.want, doc.Source)
			}
		})
	}
}

// A workflow that was not read has no value: the reader maps nothing of
// it.
func TestAWorkflowThatWasNotReadHasNoValue(t *testing.T) {
	t.Parallel()
	ref := DocumentRef{Kind: document.KindWorkflow, Name: "review"}
	reader := newDocumentReader(definitionsFake{t: t, errs: map[DocumentRef]error{ref: document.ErrNotFound}})
	got, _, err := reader.Workflow(context.Background(), "review")
	if !unread(err) || !reflect.DeepEqual(got, declaredWorkflow{}) {
		t.Fatalf("workflow = %+v, %#v; want none and a failure to read", got, err)
	}
}

// A workflow's nodes are its one call or, of one that fans out and joins,
// its fan-out nodes in the order it declares them, then its join; listing
// them changes nothing of the workflow.
func TestAWorkflowsNodesAreItsCallOrItsFanOutThenItsJoin(t *testing.T) {
	t.Parallel()
	zeta, alpha := workflowNode{name: "zeta", process: "inspect", agent: "codex"}, workflowNode{name: "alpha", process: "inspect", agent: "pi"}
	merge := workflowNode{name: "merge", process: "consolidate", agent: "claude"}
	for name, c := range map[string]struct {
		workflow declaredWorkflow
		want     []workflowNode
	}{
		"fan-out nodes and a join": {
			workflow: declaredWorkflow{fanOut: []workflowNode{zeta, alpha}, join: merge},
			want:     []workflowNode{zeta, alpha, merge},
		},
		// What parsed of a workflow with problems: the join is listed as
		// far as it parsed.
		"a join alone": {
			workflow: declaredWorkflow{join: merge},
			want:     []workflowNode{merge},
		},
		"no node": {
			want: []workflowNode{{}},
		},
		"one call": {
			workflow: declaredWorkflow{call: &zeta},
			want:     []workflowNode{zeta},
		},
		// One call is the whole workflow, whatever else parsed.
		"one call beside other nodes": {
			workflow: declaredWorkflow{fanOut: []workflowNode{alpha}, join: merge, call: &zeta},
			want:     []workflowNode{zeta},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			// Room for the join after the fan-out nodes: listing them must
			// not write there.
			fanOut := append(make([]workflowNode, 0, len(c.workflow.fanOut)+1), c.workflow.fanOut...)
			workflow := c.workflow
			workflow.fanOut = fanOut
			got := workflow.nodes()
			if !slices.Equal(got, c.want) {
				t.Fatalf("nodes = %+v, want %+v", got, c.want)
			}
			if after := fanOut[:cap(fanOut)]; after[len(after)-1] != (workflowNode{}) {
				t.Fatalf("listing the nodes wrote %+v after the workflow's fan-out nodes", after[len(after)-1])
			}
		})
	}
}

// A workflow's forms are the brief forms its input values name, each once,
// in the order they are first named.
func TestAWorkflowsFormsAreTheOnesItsValuesNameEachOnce(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		values []declaredValue
		want   []string
	}{
		"forms named by several values": {
			values: []declaredValue{
				{name: "step", source: "file", forms: []string{"step", "goal"}},
				{name: "diff", source: "git.diff"},
				{name: "goal", source: "file", forms: []string{"goal", "note", "step"}},
			},
			want: []string{"step", "goal", "note"},
		},
		"values that name none": {
			values: []declaredValue{{name: "diff", source: "git.diff"}},
		},
		"no value": {},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := (declaredWorkflow{values: c.values}).forms(); !slices.Equal(got, c.want) {
				t.Fatalf("forms = %q, want %q", got, c.want)
			}
		})
	}
}

// processDocument is the document of the process inspect holding text,
// composed from the layer files given, nearest first.
func processDocument(text string, layers ...document.LayerFile) document.Document {
	return document.Document{
		Source: document.Source{Kind: document.KindProcess, Name: "inspect", Path: layers[0].Path, Layer: layers[0].Layer, SHA256: "digest of inspect", Layers: layers},
		Bytes:  []byte(text),
	}
}

// A process is read as the package uses it, beside the document's source:
// its instruction, its prompt and guidance, its params and input values in
// the order the document declares them, as a workflow's are, the revision
// it pins and whether it starts clean, its skills, its output, its inline
// verify values or the verification it names, its limits as it declares
// them to policy, whether a call's session may be resumed, and the
// warnings for its obsolete fields. One with only the required fields has
// nothing else. A document already read parses to the same.
func TestTheReaderGivesAProcessAsThePackageUsesIt(t *testing.T) {
	t.Parallel()
	timeout, attempts, cost := 30*time.Minute, 2, 2.5
	noEvent, noOutput, toolCommand, repeated, resumes := 5*time.Minute, 4*time.Minute, 3*time.Minute, 4, 2
	for name, c := range map[string]struct {
		text string
		want declaredProcess
	}{
		"every field": {
			text: "schema: agister.process/v1alpha1\nname: inspect\nstatus: active\ntype: process\nsession: resumable\n" +
				"prompt: inspect\nguidance: [style, tests]\nskills: [review, git]\n" +
				"input:\n" +
				"  instruction: Inspect the change.\n" +
				"  params:\n" +
				"    candidate: {default: HEAD}\n" +
				"    brief: {}\n" +
				"    note: {default: \"\"}\n" +
				"  values:\n" +
				"    candidate: {source: git.revision, rev: \"${param.candidate}\"}\n" +
				"    brief: {source: file, path: \"${param.brief}\", form: [goal, step]}\n" +
				"    outcomes: {source: workflow.collection}\n" +
				"output:\n  format: json\n  schema: review-result\n  require_valid: true\n" +
				"verify:\n  command: go test ./...\n  timeout: 10m\n  max_attempts: 3\n  instruction: Fix the cause, not the check.\n  where: workspace\n" +
				"timeout: 30m\nmax_cost_usd: 2.5\nretry: {max_attempts: 2}\n" +
				"stale:\n  no_event: 5m\n  no_output: 4m\n  tool_command: 3m\n  repeated_tool_calls: 4\n" +
				"  recover: {max_resumes: 2, instruction: Say what stopped you.}\n" +
				"tools: {allow: [repository.read, repository.write], require: [repository.read]}\n" +
				"isolation: {deny: [network]}\n" +
				"workspace: {access: read-write, scope: repository, revision: candidate, clean: true, setup: make deps}\n",
			want: declaredProcess{
				name:        "inspect",
				instruction: "Inspect the change.",
				prompt:      "inspect",
				guidance:    []string{"style", "tests"},
				params: []declaredParam{
					{name: "candidate", defaultValue: "HEAD", hasDefault: true},
					{name: "brief"},
					{name: "note", hasDefault: true},
				},
				values: []declaredValue{
					{name: "candidate", source: "git.revision", args: map[string]string{"rev": "${param.candidate}"}},
					{name: "brief", source: "file", args: map[string]string{"path": "${param.brief}"}, forms: []string{"goal", "step"}},
					{name: "outcomes", source: "workflow.collection", args: map[string]string{}},
				},
				revision: "candidate",
				clean:    true,
				skills:   []string{"review", "git"},
				output:   processOutput{format: "json", schema: "review-result"},
				verify:   &verifyValues{command: "go test ./...", timeout: 10 * time.Minute, maxAttempts: 3, instruction: "Fix the cause, not the check."},
				limits: policy.Declared{
					Process:     "inspect",
					Timeout:     &timeout,
					MaxAttempts: &attempts,
					MaxCostUSD:  &cost,
					Allow:       []string{"repository.read", "repository.write"},
					Deny:        []string{"network"},
					Require:     []string{"repository.read"},
					Access:      "read-write",
					Scope:       "repository",
					Pinned:      true,
					Stale: policy.DeclaredStale{
						NoEvent: &noEvent, NoOutput: &noOutput, ToolCommand: &toolCommand, RepeatedToolCalls: &repeated,
						MaxResumes: &resumes, Instruction: "Say what stopped you.",
					},
				},
				resumable: true,
				obsolete: []string{
					"workspace.setup: is obsolete and ignored (ADR-025): a call works in the caller's worktree, which its caller prepares",
					"verify.where: is obsolete and ignored (ADR-025): verification always runs in the call's worktree",
				},
			},
		},
		"only the required fields": {
			text: "schema: agister.process/v1alpha1\nname: inspect\ntype: process\nprompt: inspect\ninput:\n  instruction: Inspect the change.\noutput:\n  format: text\n",
			want: declaredProcess{
				name:        "inspect",
				instruction: "Inspect the change.",
				prompt:      "inspect",
				output:      processOutput{format: "text"},
				limits:      policy.Declared{Process: "inspect"},
			},
		},
		// The verification it names is not read with it: it has the name,
		// and no verify values.
		"a verification it names": {
			text: "schema: agister.process/v1alpha1\nname: inspect\ntype: process\nprompt: inspect\n" +
				"input:\n  instruction: Inspect the change.\n  values:\n    candidate: {source: git.revision}\n" +
				"output:\n  format: text\nverify: verify:repo\nworkspace: {revision: candidate, clean: true}\n",
			want: declaredProcess{
				name:        "inspect",
				instruction: "Inspect the change.",
				prompt:      "inspect",
				values:      []declaredValue{{name: "candidate", source: "git.revision", args: map[string]string{}}},
				revision:    "candidate",
				clean:       true,
				output:      processOutput{format: "text"},
				verifyName:  "repo",
				limits:      policy.Declared{Process: "inspect", Pinned: true},
			},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := processDocument(c.text,
				document.LayerFile{Layer: document.LayerRepository, Path: "/repo/.agister/processes/inspect.yaml", Fields: []string{"timeout"}},
				document.LayerFile{Layer: document.LayerHome, Path: "/home/processes/inspect.yaml", Fields: []string{"schema", "name", "type", "prompt", "input.instruction", "output.format"}})
			ref := DocumentRef{Kind: document.KindProcess, Name: "inspect"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Process(context.Background(), "inspect")
			if err != nil || !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("process = %+v, source %+v, %v; want %+v, source %+v", got, source, err, c.want, doc.Source)
			}
			if parsed, err := parseProcess(doc); err != nil || !reflect.DeepEqual(parsed, c.want) {
				t.Fatalf("the document already read parses to %+v, %v; want %+v", parsed, err, c.want)
			}
		})
	}
}

// A process with problems fails with the parser's *document.InvalidError:
// its problems in the parser's order, each attributed to the layer file
// that set the field at fault or, for a field none sets, to every file
// read, and the unknown ones flagged. What of the document parsed is given
// beside it, with the document's source, and a document already read
// fails and parses to the same.
func TestAProcessWithProblemsKeepsWhatParsedAndWhereEachProblemIs(t *testing.T) {
	t.Parallel()
	const repository, home = "/repo/.agister/processes/inspect.yaml", "/home/processes/inspect.yaml"
	layers := []document.LayerFile{
		{Layer: document.LayerRepository, Path: repository, Fields: []string{"colour", "session"}},
		{Layer: document.LayerHome, Path: home, Fields: []string{
			"schema", "type", "prompt", "guidance", "skills", "input.params.candidate.default", "input.values.candidate.source", "input.values.candidate.rev",
			"output.format", "verify", "verify.timeout", "verify.max_attempts", "verify.instruction", "timeout", "tools.allow", "workspace.revision", "workspace.clean",
		}},
	}
	timeout := 30 * time.Minute
	for name, c := range map[string]struct {
		text     string
		want     declaredProcess
		problems []document.Problem
	}{
		// Each value as far as it parsed: a session mode there is not,
		// which leaves the process fresh-only, a guidance that is the
		// prompt and a skill of no valid name, which are not kept, a value
		// that refers to a param nothing declares, and a verification
		// named by a process that pins no revision.
		"problems in two layers": {
			text: "schema: agister.process/v1alpha1\ncolour: red\ntype: process\nsession: sometimes\n" +
				"prompt: inspect\nguidance: [style, inspect]\nskills: [review, Bad Name]\n" +
				"input:\n" +
				"  params:\n" +
				"    candidate: {default: HEAD}\n" +
				"  values:\n" +
				"    candidate: {source: git.revision, rev: \"${param.revision}\"}\n" +
				"output:\n  format: json\n" +
				"verify: verify:repo\ntimeout: 30m\ntools: {allow: [repository.read]}\n",
			want: declaredProcess{
				name:       "inspect",
				prompt:     "inspect",
				guidance:   []string{"style"},
				params:     []declaredParam{{name: "candidate", defaultValue: "HEAD", hasDefault: true}},
				values:     []declaredValue{{name: "candidate", source: "git.revision", args: map[string]string{"rev": "${param.revision}"}}},
				skills:     []string{"review"},
				output:     processOutput{format: "json"},
				verifyName: "repo",
				limits:     policy.Declared{Process: "inspect", Timeout: &timeout, Allow: []string{"repository.read"}},
			},
			problems: []document.Problem{
				{Message: "colour: unknown field (set in " + repository + ")", Unknown: true},
				{Message: "name: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "session: unsupported session mode \"sometimes\" (supported: fresh-only, resumable) (set in " + repository + ")"},
				{Message: "guidance[1]: prompt \"inspect\" is the process's prompt: guidance names further prompts (set in " + home + ")"},
				{Message: "input.instruction: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "input.values.candidate: refers to ${param.revision}, which is not declared in input.params (set in " + home + ")"},
				{Message: "skills[1]: invalid skill name \"Bad Name\" (set in " + home + ")"},
				{Message: "output.schema: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "output.require_valid: must be true (accepting invalid output is not supported) (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "verify: requires workspace.revision: verification proves the run's changes from the pinned revision (ADR-025 rule 3) (set in " + home + ")"},
				{Message: "verify: requires workspace.clean: true: verification proves the run's changes from a clean start (ADR-025 rule 3) (set in " + home + ")"},
			},
		},
		// The verify values of an inline block as far as they parsed: no
		// command, and an attempt count there cannot be.
		"an inline verify with problems": {
			text: "schema: agister.process/v1alpha1\nname: inspect\ntype: process\nprompt: inspect\n" +
				"input:\n  instruction: Inspect the change.\n  values:\n    candidate: {source: git.revision}\n" +
				"output:\n  format: text\n" +
				"verify:\n  timeout: 10m\n  max_attempts: -1\n  instruction: Fix it.\n" +
				"workspace: {revision: candidate, clean: true}\n",
			want: declaredProcess{
				name:        "inspect",
				instruction: "Inspect the change.",
				prompt:      "inspect",
				values:      []declaredValue{{name: "candidate", source: "git.revision", args: map[string]string{}}},
				revision:    "candidate",
				clean:       true,
				output:      processOutput{format: "text"},
				verify:      &verifyValues{timeout: 10 * time.Minute, maxAttempts: -1, instruction: "Fix it."},
				limits:      policy.Declared{Process: "inspect", Pinned: true},
			},
			problems: []document.Problem{
				{Message: "verify.command: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "verify.max_attempts: must be at least 1 (set in " + home + ")"},
			},
		},
		"a schema of a newer version": {
			text: "schema: agister.process/v2\nname: inspect\ntype: process\nsession: resumable\nprompt: inspect\ninput:\n  instruction: Inspect the change.\noutput:\n  format: text\n",
			want: declaredProcess{
				name:        "inspect",
				instruction: "Inspect the change.",
				prompt:      "inspect",
				output:      processOutput{format: "text"},
				limits:      policy.Declared{Process: "inspect"},
				resumable:   true,
			},
			problems: []document.Problem{
				{Message: "schema: must be \"agister.process/v1alpha1\" (set in " + home + ")", Unknown: true},
			},
		},
		"no text": {
			text:     "\xff",
			want:     declaredProcess{name: "inspect", limits: policy.Declared{Process: "inspect"}},
			problems: []document.Problem{{Message: "not a UTF-8 text file"}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := processDocument(c.text, layers...)
			ref := DocumentRef{Kind: document.KindProcess, Name: "inspect"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			want := &document.InvalidError{Subject: "process inspect (" + repository + ")", Problems: c.problems}
			got, source, err := reader.Process(context.Background(), "inspect")
			if invalid, ok := err.(*document.InvalidError); unread(err) || !ok || !reflect.DeepEqual(invalid, want) {
				t.Fatalf("process error = %#v, want %#v", err, want)
			}
			if !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("process = %+v, source %+v; want %+v, source %+v", got, source, c.want, doc.Source)
			}
			parsed, err := parseProcess(doc)
			if invalid, ok := err.(*document.InvalidError); !ok || !reflect.DeepEqual(invalid, want) || !reflect.DeepEqual(parsed, c.want) {
				t.Fatalf("the document already read parses to %+v, %#v; want %+v, %#v", parsed, err, c.want, want)
			}
		})
	}
}

// A process that was not read has no value: the reader maps nothing of it.
func TestAProcessThatWasNotReadHasNoValue(t *testing.T) {
	t.Parallel()
	ref := DocumentRef{Kind: document.KindProcess, Name: "inspect"}
	reader := newDocumentReader(definitionsFake{t: t, errs: map[DocumentRef]error{ref: document.ErrNotFound}})
	got, _, err := reader.Process(context.Background(), "inspect")
	if !unread(err) || !reflect.DeepEqual(got, declaredProcess{}) {
		t.Fatalf("process = %+v, %#v; want none and a failure to read", got, err)
	}
}

// ADR-030 rules 2 and 3: whether a call's session may be resumed is the
// process's to say. One that sets no session is fresh-only, as one that
// says so is, and one that says resumable is resumable; the mode a call
// records and names is the one the document says.
func TestAProcessThatSetsNoSessionIsFreshOnly(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		session   string
		resumable bool
		mode      string
	}{
		"no session":      {session: "", resumable: false, mode: "fresh-only"},
		"says fresh-only": {session: "session: fresh-only\n", resumable: false, mode: "fresh-only"},
		"says resumable":  {session: "session: resumable\n", resumable: true, mode: "resumable"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := processDocument("schema: agister.process/v1alpha1\nname: inspect\ntype: process\n"+c.session+"prompt: inspect\ninput:\n  instruction: Inspect the change.\noutput:\n  format: text\n",
				document.LayerFile{Layer: document.LayerHome, Path: "/home/processes/inspect.yaml"})
			ref := DocumentRef{Kind: document.KindProcess, Name: "inspect"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, _, err := reader.Process(context.Background(), "inspect")
			if err != nil || got.resumable != c.resumable || got.session() != c.mode {
				t.Fatalf("process is resumable: %t, session mode %q, %v; want %t, %q", got.resumable, got.session(), err, c.resumable, c.mode)
			}
			if parsed, err := parseProcess(doc); err != nil || parsed.resumable != c.resumable {
				t.Fatalf("the document already read is resumable: %t, %v; want %t", parsed.resumable, err, c.resumable)
			}
		})
	}
}

// A process's prompts are its prompt, then its guidance in the order it
// names them, each once; one whose prompt did not parse has its guidance
// alone.
func TestAProcessPromptsAreItsPromptThenItsGuidanceEachOnce(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		process declaredProcess
		want    []string
	}{
		"a prompt and guidance": {process: declaredProcess{prompt: "inspect", guidance: []string{"style", "tests"}}, want: []string{"inspect", "style", "tests"}},
		"a prompt alone":        {process: declaredProcess{prompt: "inspect"}, want: []string{"inspect"}},
		"guidance alone":        {process: declaredProcess{guidance: []string{"style", "tests"}}, want: []string{"style", "tests"}},
		"a name named twice":    {process: declaredProcess{prompt: "inspect", guidance: []string{"style", "inspect", "style"}}, want: []string{"inspect", "style"}},
		"neither":               {},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := c.process.prompts(); !slices.Equal(got, c.want) {
				t.Fatalf("prompts = %q, want %q", got, c.want)
			}
		})
	}
}

// A process's forms are listed as a workflow's are: the brief forms its
// input values name, each once, in the order they are first named.
func TestAProcessFormsAreTheOnesItsValuesNameEachOnce(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		values []declaredValue
		want   []string
	}{
		"forms named by several values": {
			values: []declaredValue{
				{name: "step", source: "file", forms: []string{"step", "goal"}},
				{name: "diff", source: "git.diff"},
				{name: "goal", source: "file", forms: []string{"goal", "note", "step"}},
			},
			want: []string{"step", "goal", "note"},
		},
		"values that name none": {
			values: []declaredValue{{name: "diff", source: "git.diff"}},
		},
		"no value": {},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			got := (declaredProcess{values: c.values}).forms()
			if !slices.Equal(got, c.want) {
				t.Fatalf("forms = %q, want %q", got, c.want)
			}
			if of := (declaredWorkflow{values: c.values}).forms(); !slices.Equal(got, of) {
				t.Fatalf("forms = %q, and of a workflow with the same values %q", got, of)
			}
		})
	}
}

// The inputs of a process that receive a workflow's collection are its
// values of the source workflow.collection, in the order it declares
// them; a process without one collects nothing.
func TestAProcessCollectsThroughItsValuesOfTheCollectionSource(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		values []declaredValue
		want   []string
	}{
		"two among others": {
			values: []declaredValue{
				{name: "outcomes", source: "workflow.collection", args: map[string]string{}},
				{name: "diff", source: "git.diff", args: map[string]string{"base": "main"}},
				{name: "again", source: "workflow.collection"},
			},
			want: []string{"outcomes", "again"},
		},
		"none of that source": {values: []declaredValue{{name: "diff", source: "git.diff"}, {name: "workflow.collection", source: "file"}}},
		"no value":            {},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := collects(declaredProcess{name: "consolidate", values: c.values}); !slices.Equal(got, c.want) {
				t.Fatalf("collects = %q, want %q", got, c.want)
			}
		})
	}
}

// What a process declares to policy is its own limits and, of the verify
// it has, what bounds a call: the inline block's, or a named
// verification's once the process has it. One without verify declares
// none, and declaring changes nothing of the process.
func TestWhatAProcessDeclaresToPolicyHoldsItsVerifysBounds(t *testing.T) {
	t.Parallel()
	timeout := 30 * time.Minute
	own := policy.Declared{Process: "inspect", Timeout: &timeout, Allow: []string{"repository.read"}, Require: []string{"repository.read"}, Pinned: true}
	process := declaredProcess{name: "inspect", verifyName: "repo", limits: own}
	if got := process.declared(); !reflect.DeepEqual(got, own) {
		t.Fatalf("without verify, declared = %+v, want %+v", got, own)
	}
	process.verify = &verifyValues{command: "go test ./...", timeout: 10 * time.Minute, maxAttempts: 3, instruction: "Fix it."}
	want := own
	want.Verify = &policy.Verify{Timeout: 10 * time.Minute, MaxAttempts: 3}
	if got := process.declared(); !reflect.DeepEqual(got, want) {
		t.Fatalf("with verify, declared = %+v, want %+v", got, want)
	}
	if process.limits.Verify != nil {
		t.Fatalf("declaring gave the process's own limits the verify %+v", process.limits.Verify)
	}
}

// verificationDocument is the document of the verification repo holding
// text, composed from the layer files given, nearest first.
func verificationDocument(text string, layers ...document.LayerFile) document.Document {
	return document.Document{
		Source: document.Source{Kind: document.KindVerify, Name: "repo", Path: layers[0].Path, Layer: layers[0].Layer, SHA256: "digest of repo", Layers: layers},
		Bytes:  []byte(text),
	}
}

// A verification is read as the package uses it, beside the document's
// source: its name, its command, the timeout of a run, its attempts and
// its instruction, each as the document says it, and the warning for the
// obsolete field it holds.
func TestTheReaderGivesAVerificationAsThePackageUsesIt(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		text string
		want declaredVerification
	}{
		"its fields": {
			text: "schema: agister.verify/v1alpha1\nname: repo\ncommand: go test ./...\ntimeout: 10m\nmax_attempts: 3\ninstruction: Fix the cause, not the check.\n",
			want: declaredVerification{
				name:   "repo",
				verify: verifyValues{command: "go test ./...", timeout: 10 * time.Minute, maxAttempts: 3, instruction: "Fix the cause, not the check."},
			},
		},
		"an obsolete field beside them": {
			text: "schema: agister.verify/v1alpha1\nname: repo\ncommand: make test\ntimeout: 90s\nmax_attempts: 1\ninstruction: Fix it.\nwhere: workspace\n",
			want: declaredVerification{
				name:     "repo",
				verify:   verifyValues{command: "make test", timeout: 90 * time.Second, maxAttempts: 1, instruction: "Fix it."},
				obsolete: []string{"where: is obsolete and ignored (ADR-025): verification always runs in the call's worktree"},
			},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := verificationDocument(c.text,
				document.LayerFile{Layer: document.LayerRepository, Path: "/repo/.agister/verifies/repo.yaml", Fields: []string{"command"}},
				document.LayerFile{Layer: document.LayerHome, Path: "/home/verifies/repo.yaml", Fields: []string{"schema", "name", "timeout", "max_attempts", "instruction"}})
			ref := DocumentRef{Kind: document.KindVerify, Name: "repo"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Verification(context.Background(), "repo")
			if err != nil || !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("verification = %+v, source %+v, %v; want %+v, source %+v", got, source, err, c.want, doc.Source)
			}
		})
	}
}

// A verification with problems fails with the parser's
// *document.InvalidError: its problems in the parser's order, each
// attributed to the layer file that set the field at fault or, for a
// field none sets, to every file read, and the unknown ones flagged. What
// of the document parsed is given beside it, with the document's source.
func TestAVerificationWithProblemsKeepsWhatParsedAndWhereEachProblemIs(t *testing.T) {
	t.Parallel()
	const repository, home = "/repo/.agister/verifies/repo.yaml", "/home/verifies/repo.yaml"
	layers := []document.LayerFile{
		{Layer: document.LayerRepository, Path: repository, Fields: []string{"colour", "command"}},
		{Layer: document.LayerHome, Path: home, Fields: []string{"schema", "timeout", "max_attempts"}},
	}
	for name, c := range map[string]struct {
		text     string
		want     declaredVerification
		problems []document.Problem
	}{
		// Each value as far as it parsed: no instruction, a timeout that
		// is no duration and an attempt count there cannot be.
		"problems in two layers": {
			text: "schema: agister.verify/v1alpha1\ncolour: red\ncommand: go test ./...\ntimeout: soon\nmax_attempts: -2\n",
			want: declaredVerification{name: "repo", verify: verifyValues{command: "go test ./...", maxAttempts: -2}},
			problems: []document.Problem{
				{Message: "colour: unknown field (set in " + repository + ")", Unknown: true},
				{Message: "name: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "instruction: is required (no layer sets it: " + repository + ", " + home + ")"},
				{Message: "timeout: invalid duration \"soon\" (use e.g. 90s, 20m, 1h) (set in " + home + ")"},
				{Message: "max_attempts: must be at least 1 (set in " + home + ")"},
			},
		},
		"a schema of a newer version": {
			text: "schema: agister.verify/v2\nname: repo\ncommand: make test\ntimeout: 90s\nmax_attempts: 2\ninstruction: Fix it.\nwhere: workspace\n",
			want: declaredVerification{
				name:     "repo",
				verify:   verifyValues{command: "make test", timeout: 90 * time.Second, maxAttempts: 2, instruction: "Fix it."},
				obsolete: []string{"where: is obsolete and ignored (ADR-025): verification always runs in the call's worktree"},
			},
			problems: []document.Problem{
				{Message: "schema: must be \"agister.verify/v1alpha1\" (set in " + home + ")", Unknown: true},
			},
		},
		"no text": {
			text:     "\xff",
			want:     declaredVerification{name: "repo"},
			problems: []document.Problem{{Message: "not a UTF-8 text file"}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := verificationDocument(c.text, layers...)
			ref := DocumentRef{Kind: document.KindVerify, Name: "repo"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Verification(context.Background(), "repo")
			invalid, ok := err.(*document.InvalidError)
			if want := (&document.InvalidError{Subject: "verification repo (" + repository + ")", Problems: c.problems}); unread(err) || !ok || !reflect.DeepEqual(invalid, want) {
				t.Fatalf("verification error = %#v, want %#v", err, want)
			}
			if !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("verification = %+v, source %+v; want %+v, source %+v", got, source, c.want, doc.Source)
			}
		})
	}
}

// A verification that was not read has no value: the reader maps nothing
// of it.
func TestAVerificationThatWasNotReadHasNoValue(t *testing.T) {
	t.Parallel()
	ref := DocumentRef{Kind: document.KindVerify, Name: "repo"}
	reader := newDocumentReader(definitionsFake{t: t, errs: map[DocumentRef]error{ref: document.ErrNotFound}})
	got, _, err := reader.Verification(context.Background(), "repo")
	if !unread(err) || !reflect.DeepEqual(got, declaredVerification{}) {
		t.Fatalf("verification = %+v, %#v; want none and a failure to read", got, err)
	}
}

// A failed run may be followed by a repair turn where the verify values
// allow more than one attempt; a process without verify repairs nothing.
func TestVerifyValuesRepairWithMoreThanOneAttempt(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		verify *verifyValues
		want   bool
	}{
		"no verify":      {verify: nil, want: false},
		"one attempt":    {verify: &verifyValues{command: "go test ./...", maxAttempts: 1}, want: false},
		"two attempts":   {verify: &verifyValues{command: "go test ./...", maxAttempts: 2}, want: true},
		"three attempts": {verify: &verifyValues{command: "go test ./...", maxAttempts: 3}, want: true},
		"no attempt":     {verify: &verifyValues{command: "go test ./..."}, want: false},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := c.verify.repairs(); got != c.want {
				t.Fatalf("repairs = %t, want %t", got, c.want)
			}
		})
	}
}

// An input value's arguments are bound in one pass: each reference is
// substituted once, ${param.<name>} from the params and ${value.<name>}
// from the text of the values resolved before, and a text substituted is
// not read for references again. A param that was not given is empty, a
// value that has no text refuses the binding, naming the first of them by
// name, and what is no reference stays as written. The arguments
// themselves are left as they were.
func TestAnInputValuesArgumentsAreBoundInOnePass(t *testing.T) {
	t.Parallel()
	params := map[string]string{"candidate": "HEAD", "nested": "${value.revision}", "again": "${param.candidate}", "name": "candidate", "open": "{"}
	values := map[string]string{"revision": "abc123", "quoted": "${param.candidate}", "chained": "${value.revision}"}
	for name, c := range map[string]struct {
		args    map[string]string
		want    map[string]string
		refusal string
	}{
		"a param and a value": {
			args: map[string]string{"rev": "${param.candidate}", "range": "${value.revision}..${param.candidate}", "base": "main"},
			want: map[string]string{"rev": "HEAD", "range": "abc123..HEAD", "base": "main"},
		},
		"a param whose text is a reference": {
			args: map[string]string{"rev": "${param.nested}", "head": "${param.again}"},
			want: map[string]string{"rev": "${value.revision}", "head": "${param.candidate}"},
		},
		"a value whose text is a reference": {
			args: map[string]string{"rev": "${value.quoted}", "head": "${value.chained}"},
			want: map[string]string{"rev": "${param.candidate}", "head": "${value.revision}"},
		},
		// Substituting a reference makes no other of the text around it.
		"a reference made by a substitution": {
			args: map[string]string{"rev": "${param.${param.name}}", "head": "$${param.open}value.revision}"},
			want: map[string]string{"rev": "${param.candidate}", "head": "${value.revision}"},
		},
		"a param that was not given": {
			args: map[string]string{"rev": "[${param.missing}]"},
			want: map[string]string{"rev": "[]"},
		},
		"what is no reference": {
			args: map[string]string{"rev": "${input.candidate}", "head": "${param.Candidate}", "base": "$param.candidate"},
			want: map[string]string{"rev": "${input.candidate}", "head": "${param.Candidate}", "base": "$param.candidate"},
		},
		"no argument": {
			args: map[string]string{},
			want: map[string]string{},
		},
		"a value that has no text": {
			args:    map[string]string{"rev": "${value.zeta}", "head": "${value.alpha} ${value.revision}"},
			refusal: "refers to ${value.alpha}, which has no text value",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			args := maps.Clone(c.args)
			got, err := boundArgs(args, params, values)
			if c.refusal != "" {
				if err == nil || err.Error() != c.refusal || got != nil {
					t.Fatalf("bound = %q, %v; want none and the refusal %q", got, err, c.refusal)
				}
			} else if err != nil || !reflect.DeepEqual(got, c.want) {
				t.Fatalf("bound = %q, %v; want %q", got, err, c.want)
			}
			if !reflect.DeepEqual(args, c.args) {
				t.Fatalf("binding changed the arguments to %q, from %q", args, c.args)
			}
		})
	}
}

// A prompt of the inventory is read as the settings list it, apart from the
// prompt of the same name a call reads: parsed with its source, a failure
// to read it told from a failure to parse it.
func TestAListedPromptIsReadAsTheSettingsListIt(t *testing.T) {
	t.Parallel()
	ref := DocumentRef{Kind: document.KindPrompt, Name: "inspect"}
	prompt := func(path, text string) document.Document {
		return document.Document{
			Source: document.Source{Kind: ref.Kind, Name: ref.Name, Path: path, Layer: document.LayerHome, SHA256: "digest of " + path},
			Bytes:  []byte(text),
		}
	}
	// What a call reads, from a folder a layer lists: no listed read gives it.
	named := prompt("folder/inspect.md", "Inspect as the folder says.\n")
	listed := prompt("prompts/inspect.md", "Inspect as the inventory says.\n")
	fake := func(t *testing.T) definitionsFake {
		return definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: named}}
	}

	t.Run("read", func(t *testing.T) {
		t.Parallel()
		definitions := fake(t)
		definitions.listed = map[DocumentRef]document.Document{ref: listed}
		parsed, err := definition.ParsePrompt(listed)
		if err != nil {
			t.Fatalf("the listed prompt is invalid: %v", err)
		}
		want := promptOf(parsed)
		got, source, err := newDocumentReader(definitions).ListedPrompt(context.Background(), ref.Name)
		if err != nil || !reflect.DeepEqual(got, want) || !reflect.DeepEqual(source, listed.Source) {
			t.Fatalf("listed prompt = %+v, source %+v, %v; want %+v, source %+v", got, source, err, want, listed.Source)
		}
	})
	t.Run("not read", func(t *testing.T) {
		t.Parallel()
		definitions := fake(t)
		looked := document.Document{Source: listed.Source}
		definitions.listed = map[DocumentRef]document.Document{ref: looked}
		definitions.listedErrs = map[DocumentRef]error{ref: document.ErrNotFound}
		got, source, err := newDocumentReader(definitions).ListedPrompt(context.Background(), ref.Name)
		if !unread(err) || !errors.Is(err, document.ErrNotFound) || err.Error() != document.ErrNotFound.Error() {
			t.Fatalf("listed prompt error = %#v, want a failure to read that is %v", err, document.ErrNotFound)
		}
		if !reflect.DeepEqual(got, promptText{}) || !reflect.DeepEqual(source, looked.Source) {
			t.Fatalf("listed prompt = %+v, source %+v; want none, source %+v", got, source, looked.Source)
		}
	})
	t.Run("invalid", func(t *testing.T) {
		t.Parallel()
		broken := prompt("prompts/inspect.md", "\xff")
		definitions := fake(t)
		definitions.listed = map[DocumentRef]document.Document{ref: broken}
		parsed, parseErr := definition.ParsePrompt(broken)
		if parseErr == nil {
			t.Fatal("the broken prompt is valid")
		}
		want := promptOf(parsed)
		got, source, err := newDocumentReader(definitions).ListedPrompt(context.Background(), ref.Name)
		invalid, ok := err.(*document.InvalidError)
		if unread(err) || !ok || !reflect.DeepEqual(invalid, parseErr) {
			t.Fatalf("listed prompt error = %#v, want the parser's %#v", err, parseErr)
		}
		if !reflect.DeepEqual(got, want) || !reflect.DeepEqual(source, broken.Source) {
			t.Fatalf("listed prompt = %+v, source %+v; want %+v, source %+v", got, source, want, broken.Source)
		}
	})
}

// blocksDocument is the blocks document holding text, in the repository's
// settings.
func blocksDocument(text string) document.Document {
	const path = "/repo/.agister/blocks.yaml"
	return document.Document{
		Source: document.Source{
			Kind: document.KindBlocks, Name: "blocks", Path: path, Layer: document.LayerRepository, SHA256: "digest of the blocks",
			Layers: []document.LayerFile{{Layer: document.LayerRepository, Path: path}},
		},
		Bytes: []byte(text),
	}
}

// The blocks are read as the package uses them, beside the document's
// source: each document blocked by its kind and its name, with its reason
// where it gives one, in the order the document names them.
func TestTheReaderGivesTheBlocksAsThePackageUsesThem(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		text string
		want []declaredBlock
	}{
		"every kind a block may name": {
			text: "schema: agister.blocks/v1alpha1\nblocks:\n  - {ref: \"workflow:w\", reason: Not here.}\n  - {ref: \"process:p\"}\n" +
				"  - {ref: \"runtime:rt\", reason: Not installed.}\n  - {ref: \"agent:a\"}\n",
			want: []declaredBlock{
				{kind: document.KindWorkflow, name: "w", reason: "Not here."},
				{kind: document.KindProcess, name: "p"},
				{kind: document.KindRuntime, name: "rt", reason: "Not installed."},
				{kind: document.KindAgent, name: "a"},
			},
		},
		"none": {text: "schema: agister.blocks/v1alpha1\nblocks: []\n"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := blocksDocument(c.text)
			ref := DocumentRef{Kind: document.KindBlocks, Name: "blocks"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Blocks(context.Background(), "blocks")
			if err != nil || !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("blocks = %+v, source %+v, %v; want %+v, source %+v", got, source, err, c.want, doc.Source)
			}
		})
	}
}

// Blocks with problems fail with the parser's *document.InvalidError, its
// problems in the parser's order. The blocks that parsed are given beside
// it, with the document's source.
func TestBlocksWithProblemsKeepWhatParsed(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		text     string
		problems []document.Problem
		want     []declaredBlock
	}{
		"a block of a kind that cannot be blocked, one named twice and an unknown field": {
			text: "schema: agister.blocks/v1alpha1\nblocks:\n  - {ref: \"process:p\", reason: Not here.}\n  - {ref: \"prompt:inspect\"}\n" +
				"  - {ref: \"process:p\"}\n  - {ref: \"agent:a\", why: Slow.}\n",
			problems: []document.Problem{
				{Message: "blocks[1].ref: \"prompt\" cannot be blocked: only a process, workflow, agent or runtime is"},
				{Message: "blocks[2].ref: process:p is blocked twice (also blocks[0])"},
				{Message: "blocks[3].why: unknown field", Unknown: true},
			},
			want: []declaredBlock{
				{kind: document.KindProcess, name: "p", reason: "Not here."},
				{kind: document.KindAgent, name: "a"},
			},
		},
		"no list of blocks": {
			text:     "schema: agister.blocks/v1alpha1\n",
			problems: []document.Problem{{Message: "blocks: is required"}},
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := blocksDocument(c.text)
			ref := DocumentRef{Kind: document.KindBlocks, Name: "blocks"}
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: doc}})
			got, source, err := reader.Blocks(context.Background(), "blocks")
			invalid, ok := err.(*document.InvalidError)
			if want := (&document.InvalidError{Subject: "blocks", Problems: c.problems}); unread(err) || !ok || !reflect.DeepEqual(invalid, want) {
				t.Fatalf("blocks error = %#v, want %#v", err, want)
			}
			if !reflect.DeepEqual(got, c.want) || !reflect.DeepEqual(source, doc.Source) {
				t.Fatalf("blocks = %+v, source %+v; want %+v, source %+v", got, source, c.want, doc.Source)
			}
		})
	}
}

// Blocks that were not read have no value: the reader maps nothing of
// them.
func TestBlocksThatWereNotReadHaveNoValue(t *testing.T) {
	t.Parallel()
	ref := DocumentRef{Kind: document.KindBlocks, Name: "blocks"}
	reader := newDocumentReader(definitionsFake{t: t, errs: map[DocumentRef]error{ref: document.ErrNotFound}})
	got, _, err := reader.Blocks(context.Background(), "blocks")
	if !unread(err) || got != nil {
		t.Fatalf("blocks = %+v, %#v; want none and a failure to read", got, err)
	}
}

// The workspace settings are read only for where they are: whatever they
// hold, nothing of them is parsed.
func TestTheWorkspaceSettingsAreReadForWhereTheyAre(t *testing.T) {
	t.Parallel()
	ref := DocumentRef{Kind: document.KindWorkspace, Name: "workspace"}
	source := document.Source{Kind: ref.Kind, Name: ref.Name, Path: "mem/workspace.yaml", Layer: document.LayerHome, SHA256: "digest of mem/workspace.yaml"}
	for name, text := range map[string]string{
		"settings":      "schema: agister.workspace/v1alpha1\nmode: in-place\n",
		"anything else": "\xff",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: {Source: source, Bytes: []byte(text)}}})
			got, err := reader.Workspace(context.Background(), ref.Name)
			if err != nil || !reflect.DeepEqual(got, source) {
				t.Fatalf("workspace = source %+v, %v; want %+v", got, err, source)
			}
		})
	}
	t.Run("not read", func(t *testing.T) {
		t.Parallel()
		cause := errors.New("cannot be resolved")
		reader := newDocumentReader(definitionsFake{t: t, docs: map[DocumentRef]document.Document{ref: {Source: source}}, errs: map[DocumentRef]error{ref: cause}})
		got, err := reader.Workspace(context.Background(), ref.Name)
		if !unread(err) || !errors.Is(err, cause) || !reflect.DeepEqual(got, source) {
			t.Fatalf("workspace = source %+v, %#v; want source %+v and a failure to read that is %v", got, err, source, cause)
		}
	})
}

// extendingCase is a process document as the definitions give it, for what
// it extends: its text, and err where it cannot be read.
type extendingCase struct {
	text string
	err  error
	base string // the base it names, "" for none
}

// extendingCases are processes by name: review holds a whole process, and
// the others say what they extend.
func extendingCases() map[string]extendingCase {
	const whole = "schema: agister.process/v1alpha1\nname: review\ntype: process\nprompt: inspect\ninput:\n  instruction: Inspect the change.\noutput:\n  format: text\ntimeout: 20m\ntools: {allow: [repository.read]}\n"
	return map[string]extendingCase{
		"review":     {text: whole},
		"quick":      {text: "schema: agister.process/v1alpha1\nname: quick\ntype: process\nextends: process:review\ntimeout: 5m\n", base: "review"},
		"deep":       {text: "schema: agister.process/v1alpha1\nname: deep\ntype: process\nextends: process:review\ntimeout: 40m\n", base: "review"},
		"unreadable": {text: "schema: agister.process/v1alpha1\nname: unreadable\ntype: process\nextends: process:review\n", err: errors.New("layers do not compose"), base: "review"},
		"invalid":    {text: "name: invalid\nextends: process:review\ntimeout: never\n", base: "review"},
		"misnamed":   {text: "schema: agister.process/v1alpha1\nname: misnamed\ntype: process\nextends: review\ntimeout: 5m\n"},
	}
}

// What Extending returns names the base of each process asked of it, of
// one that cannot be read or does not parse too, and reads each base once
// for all of them.
func TestExtendingNamesEachProcessBaseAndReadsABaseOnce(t *testing.T) {
	t.Parallel()
	cases := extendingCases()
	definitions := definitionsFake{t: t, docs: map[DocumentRef]document.Document{}, errs: map[DocumentRef]error{}, reads: map[DocumentRef]int{}}
	for name, c := range cases {
		ref := DocumentRef{Kind: document.KindProcess, Name: name}
		definitions.docs[ref] = document.Document{
			Source: document.Source{Kind: ref.Kind, Name: name, Path: "mem/processes/" + name, Layer: document.LayerHome},
			Bytes:  []byte(c.text),
		}
		if c.err != nil {
			definitions.errs[ref] = c.err
		}
	}
	extends := newDocumentReader(definitions).Extending(context.Background())
	for name, c := range cases {
		if got := extends(name); got != c.base {
			t.Errorf("%s extends %q, want %q", name, got, c.base)
		}
	}
	// review is read once as a process asked of, and once as the base of
	// all that extend it.
	for name := range cases {
		want := 1
		if name == "review" {
			want = 2
		}
		if got := definitions.reads[DocumentRef{Kind: document.KindProcess, Name: name}]; got != want {
			t.Errorf("%s was read %d times, want %d", name, got, want)
		}
	}
}

// What a write is about to store is parsed as the agent it names, by the
// agents' parser, with no source but its kind and name: one with problems
// fails with the parser's own *document.InvalidError, beside what of it
// parsed, and never as a failure to read.
func TestAnAgentToStoreIsParsedAsTheAgentItNames(t *testing.T) {
	t.Parallel()
	source := document.Source{Kind: document.KindAgent, Name: "a"}
	for name, c := range map[string]struct {
		text  string
		valid bool
	}{
		"as formatted":    {text: string(definition.FormatAgent(definition.Agent{Name: "a", Runtime: "rt", Model: "m1", Effort: "high"})), valid: true},
		"another agent's": {text: string(definition.FormatAgent(definition.Agent{Name: "b", Runtime: "rt"}))},
		"no runtime":      {text: string(definition.FormatAgent(definition.Agent{Name: "a"}))},
		"no agent":        {text: "\xff"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			want, parseErr := definition.ParseAgent(document.Document{Source: source, Bytes: []byte(c.text)})
			if (parseErr == nil) != c.valid {
				t.Fatalf("the case's agent parses with %v", parseErr)
			}
			got, err := parsedAgent(source.Name, []byte(c.text))
			if !reflect.DeepEqual(got, agentOf(want)) {
				t.Fatalf("agent = %+v, want %+v", got, agentOf(want))
			}
			if c.valid {
				if err != nil {
					t.Fatalf("a valid agent was refused: %v", err)
				}
				return
			}
			invalid, ok := err.(*document.InvalidError)
			if unread(err) || !ok || !reflect.DeepEqual(invalid, parseErr) {
				t.Fatalf("error = %#v, want the parser's %#v", err, parseErr)
			}
			// The package's agent holds no source, so the error's subject
			// tells what the bytes were parsed as: the agent named, of no
			// file.
			if invalid.Subject != "agent a" {
				t.Fatalf("error's subject = %q, want %q", invalid.Subject, "agent a")
			}
		})
	}
}

// parsedCase is one document already read: its kind and text, whether it
// is valid, the documents it names, the helper that parses it and the
// kind's parser.
type parsedCase struct {
	kind   document.Kind
	text   string
	valid  bool
	names  []string
	parse  func(document.Document) (any, []string, error)
	parser func(document.Document) (any, error)
}

// parses is the case of a document of kind holding text, which parse
// parses as parser does and which names the documents named gives.
func parses[T any](kind document.Kind, text string, valid bool, names []string, parse, parser func(document.Document) (T, error), named func(T) []string) parsedCase {
	return parsedCase{
		kind: kind, text: text, valid: valid, names: names,
		parse: func(doc document.Document) (any, []string, error) {
			value, err := parse(doc)
			return value, named(value), err
		},
		parser: func(doc document.Document) (any, error) { return parser(doc) },
	}
}

// A document already read is parsed by its kind's parser, as the reader
// parses one it reads, and keeps the source it was read with. One with
// problems fails with the parser's own *document.InvalidError, never as a
// failure to read, beside what of it parsed: the documents it names.
func TestADocumentAlreadyReadIsParsedByItsKindsParser(t *testing.T) {
	t.Parallel()
	process := func(text string, valid bool, names ...string) parsedCase {
		return parses(document.KindProcess, text, valid, names, parseProcess,
			func(doc document.Document) (declaredProcess, error) {
				process, err := definition.ParseProcess(doc)
				return processOf(process), err
			},
			func(p declaredProcess) []string {
				return append(append([]string{p.verifyName}, p.prompts()...), p.skills...)
			})
	}
	agent := func(text string, valid bool, names ...string) parsedCase {
		return parses(document.KindAgent, text, valid, names, parseAgent,
			func(doc document.Document) (agentProfile, error) {
				agent, err := definition.ParseAgent(doc)
				return agentOf(agent), err
			},
			func(a agentProfile) []string { return a.skills })
	}
	for name, c := range map[string]parsedCase{
		"a process": process("schema: agister.process/v1alpha1\nname: d\ntype: process\nprompt: inspect\nguidance: [style]\nskills: [review]\ninput:\n  instruction: Inspect the change.\noutput:\n  format: text\ntimeout: 20m\ntools: {allow: [repository.read]}\n",
			true, "", "inspect", "style", "review"),
		"a process with problems": process("name: d\nprompt: inspect\nskills: [review]\nverify: verify:repo\n",
			false, "repo", "inspect", "review"),
		"no process": process("\xff", false, ""),
		"an agent": agent("schema = \"agister.agent/v1alpha1\"\nname = \"d\"\nruntime = \"rt\"\nmodel = \"m1\"\nmodel_family = \"fam\"\neffort = \"high\"\ncommand = \"/bin/spy\"\nskills = [\"review\"]\n",
			true, "review"),
		"an agent with problems": agent("name = \"d\"\nskills = [\"review\"]\n", false, "review"),
		"no agent":               agent("\xff", false),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			doc := document.Document{
				Source: document.Source{Kind: c.kind, Name: "d", Path: "mem/" + string(c.kind) + "/d", Layer: document.LayerHome, SHA256: "digest of d"},
				Bytes:  []byte(c.text),
			}
			want, parseErr := c.parser(doc)
			if (parseErr == nil) != c.valid {
				t.Fatalf("the case's document parses with %v", parseErr)
			}
			got, names, err := c.parse(doc)
			if !reflect.DeepEqual(got, want) || !slices.Equal(names, c.names) {
				t.Fatalf("parsed = %+v, naming %q; want %+v, naming %q", got, names, want, c.names)
			}
			if c.valid {
				if err != nil {
					t.Fatalf("a valid document was refused: %v", err)
				}
				return
			}
			invalid, ok := err.(*document.InvalidError)
			if unread(err) || !ok || !reflect.DeepEqual(invalid, parseErr) {
				t.Fatalf("error = %#v, want the parser's %#v", err, parseErr)
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
