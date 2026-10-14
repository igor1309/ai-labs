package app_test

import (
	"bytes"
	"context"
	"errors"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// portAnswer is what the definitions give for one read: a document, or an
// error beside what they know of the document they could not read.
type portAnswer struct {
	doc document.Document
	err error
}

// answeredDefinitions are the definitions a Checker checks in a test: the
// layers and each kind's names as the test set them, and for each read the
// answer the test set, Read's apart from ReadListed's. A list or a read the
// test did not set fails the test.
type answeredDefinitions struct {
	t      *testing.T
	layers []document.LayerDir
	names  map[document.Kind][]string
	read   map[app.DocumentRef]portAnswer
	listed map[app.DocumentRef]portAnswer
}

func (d *answeredDefinitions) Read(_ context.Context, kind document.Kind, name string) (document.Document, error) {
	return d.answer("read", d.read, kind, name)
}

func (d *answeredDefinitions) ReadListed(_ context.Context, kind document.Kind, name string) (document.Document, error) {
	return d.answer("listed read", d.listed, kind, name)
}

func (d *answeredDefinitions) answer(read string, answers map[app.DocumentRef]portAnswer, kind document.Kind, name string) (document.Document, error) {
	answer, ok := answers[app.DocumentRef{Kind: kind, Name: name}]
	if !ok {
		d.t.Errorf("%s of %s %q, which the test did not set", read, kind, name)
	}
	return answer.doc, answer.err
}

func (d *answeredDefinitions) List(_ context.Context, kind document.Kind) ([]string, error) {
	names, ok := d.names[kind]
	if !ok {
		d.t.Errorf("list of %s, which the test did not set", kind)
	}
	return names, nil
}

func (d *answeredDefinitions) Layers(context.Context) []document.LayerDir { return d.layers }

// give sets the answer to the read the Checker reads doc by.
func (d *answeredDefinitions) give(doc checkedDocument, answer portAnswer) {
	if doc.inventory {
		d.listed[doc.ref] = answer
		return
	}
	d.read[doc.ref] = answer
}

// checkedDocument is one document of the settings whose check is counted,
// with a valid text of it.
type checkedDocument struct {
	ref  app.DocumentRef
	text string
	// inventory: the Checker reads it as the settings list it, a prompt no
	// process names.
	inventory bool
	// unlisted: the settings do not list it, a prompt only the processes
	// that name it find.
	unlisted bool
}

// looked is the source the definitions give of the document, read or not:
// where it is, in the repository's layer.
func (c checkedDocument) looked() document.Source {
	return document.Source{Kind: c.ref.Kind, Name: c.ref.Name, Path: "mem/" + string(c.ref.Kind) + "/" + c.ref.Name, Layer: document.LayerRepository}
}

// held is the document as the definitions give it when it holds text.
func (c checkedDocument) held(text string) document.Document {
	source := c.looked()
	source.SHA256 = sha(text)
	source.Layers = []document.LayerFile{{Layer: source.Layer, Path: source.Path, SHA256: source.SHA256}}
	return document.Document{Source: source, Bytes: []byte(text)}
}

// checkedDocuments are settings with a document of every kind, and a prompt
// for each way the Checker reads one. Processes p and q name the same
// prompts, so that either names them where the other is not read or does
// not parse.
func checkedDocuments() map[string]checkedDocument {
	docs := settingsDocs()
	of := func(kind document.Kind, name string) checkedDocument {
		return checkedDocument{ref: app.DocumentRef{Kind: kind, Name: name}, text: docs[kind][name]}
	}
	docs[document.KindProcess]["p"] = strings.Replace(docs[document.KindProcess]["p"], "prompt: inspect\n", "prompt: inspect\nguidance: [house]\n", 1)
	docs[document.KindProcess]["q"] = strings.Replace(docs[document.KindProcess]["p"], "name: p\n", "name: q\n", 1)
	docs[document.KindVerify] = map[string]string{"repo": verification}
	docs[document.KindSkill] = map[string]string{"review": skillDoc("review")}
	docs[document.KindBrief] = map[string]string{"goal": goalForm}
	docs[document.KindWorkspace] = map[string]string{"workspace": "schema: agister.workspace/v1alpha1\nsetup: {command: ./link-config.sh}\n"}
	docs[document.KindBlocks] = map[string]string{"blocks": "schema: agister.blocks/v1alpha1\nblocks: []\n"}
	docs[document.KindPrompt]["notes"] = "Nothing names this prompt.\n"
	docs[document.KindPrompt]["house"] = "Keep to the house rules.\n"

	inventory, unlisted := of(document.KindPrompt, "notes"), of(document.KindPrompt, "house")
	inventory.inventory, unlisted.unlisted = true, true
	return map[string]checkedDocument{
		"the service":                       of(document.KindService, "service"),
		"a runtime mapping":                 of(document.KindRuntime, "rt"),
		"an agent":                          of(document.KindAgent, "a"),
		"a verification":                    of(document.KindVerify, "repo"),
		"a prompt a process names":          of(document.KindPrompt, "inspect"),
		"a prompt no process names":         inventory,
		"a prompt the settings do not list": unlisted,
		"a skill":                           of(document.KindSkill, "review"),
		"a brief form":                      of(document.KindBrief, "goal"),
		"a process":                         of(document.KindProcess, "p"),
		"another process":                   of(document.KindProcess, "q"),
		"a schema":                          of(document.KindSchema, "s"),
		"a workflow":                        of(document.KindWorkflow, "p_a"),
		"the workspace settings":            of(document.KindWorkspace, "workspace"),
		"the blocks":                        of(document.KindBlocks, "blocks"),
	}
}

// checkedSettings are the definitions that give every document of docs as
// it is, valid, from the repository's layer.
func checkedSettings(t *testing.T, docs map[string]checkedDocument) *answeredDefinitions {
	definitions := &answeredDefinitions{
		t:      t,
		layers: []document.LayerDir{{Layer: document.LayerRepository, Dir: "mem"}},
		names:  map[document.Kind][]string{},
		read:   map[app.DocumentRef]portAnswer{},
		listed: map[app.DocumentRef]portAnswer{},
	}
	for _, doc := range docs {
		definitions.give(doc, portAnswer{doc: doc.held(doc.text)})
		if !doc.unlisted {
			definitions.names[doc.ref.Kind] = append(definitions.names[doc.ref.Kind], doc.ref.Name)
		}
	}
	for _, names := range definitions.names {
		sort.Strings(names)
	}
	return definitions
}

// unparsed is a text no kind's parser takes, and the one schema the
// validator of a count test does not compile.
const unparsed = "\xff"

// checkedCounts are what a check of checkedDocuments counts when it reads
// and parses every document of them.
func checkedCounts() map[string]int {
	return map[string]int{
		"service": 1, "runtimes": 1, "agents": 1, "verifies": 1, "prompts": 3, "skills": 1, "briefs": 1,
		"processes": 2, "schemas": 1, "workflows": 1, "workspace": 1, "blocks": 1,
	}
}

// Check counts, by kind, each document the definitions gave it, whether or
// not it parses, and none they failed to give, whatever the failure: a kind
// none of whose documents was given has no count, and the count of every
// other document stays.
func TestCheckCountsEachDocumentItWasGivenParsedOrNot(t *testing.T) {
	t.Parallel()
	check := func(t *testing.T, definitions *answeredDefinitions) contract.CheckReport {
		t.Helper()
		validator := &validatorSpy{compileFor: func(schema []byte) error {
			if bytes.Equal(schema, []byte(unparsed)) {
				return errors.New("not a schema")
			}
			return nil
		}}
		report, err := app.NewChecker(definitions, validator, &runtimesSpy{}, []string{"git.revision", "git.diff"}).Check(context.Background(), false)
		if err != nil {
			t.Fatal(err)
		}
		return report
	}

	t.Run("every document read and parsed", func(t *testing.T) {
		t.Parallel()
		report := check(t, checkedSettings(t, checkedDocuments()))
		if len(report.Problems) != 0 {
			t.Fatalf("problems = %v, want none", messages(report.Problems))
		}
		if want := checkedCounts(); !reflect.DeepEqual(report.Checked, want) {
			t.Fatalf("checked = %v, want %v", report.Checked, want)
		}
	})

	failures := map[string]struct {
		answer  func(checkedDocument) portAnswer
		counted bool
	}{
		"not read": {answer: func(doc checkedDocument) portAnswer {
			return portAnswer{doc: document.Document{Source: doc.looked()}, err: errors.New("permission denied")}
		}},
		"not read, its layers invalid": {answer: func(doc checkedDocument) portAnswer {
			invalid := &document.InvalidError{Subject: "layers of " + doc.ref.Name, Problems: []document.Problem{{Message: "cannot be composed"}}}
			return portAnswer{doc: document.Document{Source: doc.looked()}, err: invalid}
		}},
		"not parsed": {counted: true, answer: func(doc checkedDocument) portAnswer {
			return portAnswer{doc: doc.held(unparsed)}
		}},
	}
	for name, doc := range checkedDocuments() {
		for failure, f := range failures {
			if f.counted && doc.ref.Kind == document.KindWorkspace {
				continue // nothing of it is parsed (ADR-025)
			}
			t.Run(name+" "+failure, func(t *testing.T) {
				t.Parallel()
				definitions := checkedSettings(t, checkedDocuments())
				definitions.give(doc, f.answer(doc))
				want := checkedCounts()
				if kind := string(doc.ref.Kind); !f.counted {
					if want[kind]--; want[kind] == 0 {
						delete(want, kind)
					}
				}
				if got := check(t, definitions).Checked; !reflect.DeepEqual(got, want) {
					t.Fatalf("checked = %v, want %v", got, want)
				}
			})
		}
	}
}
