package app

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
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
		"the blocks": reads(document.KindBlocks, "blocks", "schema: agister.blocks/v1alpha1\nblocks:\n  - {ref: \"process:p\", reason: Not here.}\n",
			documentReader.Blocks, definition.ParseBlocks),
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
		want, err := definition.ParsePrompt(listed)
		if err != nil {
			t.Fatalf("the listed prompt is invalid: %v", err)
		}
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
		if !reflect.DeepEqual(got, definition.Prompt{}) || !reflect.DeepEqual(source, looked.Source) {
			t.Fatalf("listed prompt = %+v, source %+v; want none, source %+v", got, source, looked.Source)
		}
	})
	t.Run("invalid", func(t *testing.T) {
		t.Parallel()
		broken := prompt("prompts/inspect.md", "\xff")
		definitions := fake(t)
		definitions.listed = map[DocumentRef]document.Document{ref: broken}
		want, parseErr := definition.ParsePrompt(broken)
		if parseErr == nil {
			t.Fatal("the broken prompt is valid")
		}
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
			if !reflect.DeepEqual(got, want) || !reflect.DeepEqual(got.Source, source) {
				t.Fatalf("agent = %+v, want %+v, of source %+v", got, want, source)
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
		return parses(document.KindProcess, text, valid, names, parseProcess, definition.ParseProcess, func(p definition.Process) []string {
			return append(append([]string{p.VerifyName}, p.Prompts()...), p.Skills...)
		})
	}
	agent := func(text string, valid bool, names ...string) parsedCase {
		return parses(document.KindAgent, text, valid, names, parseAgent, definition.ParseAgent, func(a definition.Agent) []string { return a.Skills })
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
