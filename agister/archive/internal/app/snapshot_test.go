package app_test

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

// failingSource answers from docs, except where told to fail. A call that
// fails is counted among the spy's reads as one that succeeds is.
type failingSource struct {
	*definitionsSpy
	listErr map[document.Kind]error
	readErr map[string]error // kind/name
}

func (s failingSource) List(ctx context.Context, kind document.Kind) ([]string, error) {
	if err := s.listErr[kind]; err != nil {
		s.record("list " + string(kind))
		return nil, err
	}
	return s.definitionsSpy.List(ctx, kind)
}

func (s failingSource) Read(ctx context.Context, kind document.Kind, name string) (document.Document, error) {
	if err := s.readErr[string(kind)+"/"+name]; err != nil {
		s.record(string(kind) + "/" + name)
		return document.Document{}, err
	}
	return s.definitionsSpy.Read(ctx, kind, name)
}

// ReadListed fails where Read does: the spy's layer, home, lists no
// folders.
func (s failingSource) ReadListed(ctx context.Context, kind document.Kind, name string) (document.Document, error) {
	return s.Read(ctx, kind, name)
}

// A snapshot returns again what the source answered, errors included, so a
// check against it reports what a check against the source reports; and it
// never reads the source again.
func TestSnapshotReplaysReadAndListErrors(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	spy := &definitionsSpy{docs: settingsDocs()}
	readFailure, listFailure := errors.New("cannot read process p"), errors.New("cannot list verifications")
	live := failingSource{
		definitionsSpy: spy,
		listErr:        map[document.Kind]error{document.KindVerify: listFailure},
		readErr:        map[string]error{"processes/p": readFailure, "service/service": errors.New("cannot read service")},
	}
	snap := app.Snapshot(ctx, live)
	reads := spy.readCount()

	if _, err := snap.Read(ctx, document.KindProcess, "p"); err != readFailure {
		t.Errorf("read error = %v", err)
	}
	if _, err := snap.Read(ctx, document.KindService, "service"); err == nil || err.Error() != "cannot read service" {
		t.Errorf("service read error = %v", err)
	}
	if _, err := snap.List(ctx, document.KindVerify); err != listFailure {
		t.Errorf("list error = %v", err)
	}
	if names, err := snap.List(ctx, document.KindAgent); err != nil || !reflect.DeepEqual(names, []string{"a"}) {
		t.Errorf("agents = %v, %v", names, err)
	}
	if _, err := snap.Read(ctx, document.KindAgent, "unlisted"); err == nil {
		t.Error("an unlisted document was found")
	}
	if got := spy.readCount(); got != reads {
		t.Errorf("reading the snapshot read the source %d more times", got-reads)
	}

	sources := []string{"git.revision", "git.diff", "param"}
	check := func(src app.SnapshotSource) []string {
		// The list failure aborts a check, so compare with verifications listable.
		runtimes := &runtimesSpy{runner: &runnerSpy{}}
		checker := app.NewChecker(src, &validatorSpy{}, runtimes, sources)
		report, err := checker.Check(ctx, false)
		if err != nil {
			return []string{"error: " + err.Error()}
		}
		return messages(report.Problems)
	}
	if got, want := check(snap), check(live); !reflect.DeepEqual(got, want) {
		t.Errorf("check on snapshot = %v, on source = %v", got, want)
	}
	delete(live.listErr, document.KindVerify)
	snap = app.Snapshot(ctx, live)
	if got, want := check(snap), check(live); len(got) == 0 || !reflect.DeepEqual(got, want) {
		t.Errorf("check on snapshot = %v, on source = %v", got, want)
	}
}

// Editing the source after the snapshot changes nothing in it.
func TestSnapshotIsImmutable(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	spy := &definitionsSpy{docs: settingsDocs()}
	snap := app.Snapshot(ctx, spy)
	spy.set(document.KindAgent, "a", "changed")
	spy.set(document.KindAgent, "b", "added")
	doc, err := snap.Read(ctx, document.KindAgent, "a")
	if err != nil || string(doc.Bytes) != settingsDocs()[document.KindAgent]["a"] {
		t.Fatalf("read = %q, %v", doc.Bytes, err)
	}
	doc.Bytes[0] = 'X'
	again, _ := snap.Read(ctx, document.KindAgent, "a")
	if again.Bytes[0] == 'X' {
		t.Error("a caller changed the snapshot through the bytes it was given")
	}
	if names, _ := snap.List(ctx, document.KindAgent); !reflect.DeepEqual(names, []string{"a"}) {
		t.Errorf("agents = %v", names)
	}
}

// heldSource answers with the documents it holds, as it holds them: the
// slices of a document it gave stay its own, so a change to them reaches
// whoever kept the document as given. It lists every document it holds but
// the unlisted, which it gives all the same, as one written since the
// list, and counts what it was asked for each document.
type heldSource struct {
	docs     map[document.Kind]map[string]document.Document
	unlisted []string         // kind/name
	asked    map[string]asked // by kind/name
}

// asked counts the calls for one document, by the method called.
type asked struct{ Read, ReadListed int }

func newHeldSource(docs map[document.Kind]map[string]document.Document, unlisted ...string) *heldSource {
	return &heldSource{docs: docs, unlisted: unlisted, asked: map[string]asked{}}
}

func (s *heldSource) Read(_ context.Context, kind document.Kind, name string) (document.Document, error) {
	count := s.asked[string(kind)+"/"+name]
	count.Read++
	s.asked[string(kind)+"/"+name] = count
	return s.give(kind, name)
}

func (s *heldSource) ReadListed(_ context.Context, kind document.Kind, name string) (document.Document, error) {
	count := s.asked[string(kind)+"/"+name]
	count.ReadListed++
	s.asked[string(kind)+"/"+name] = count
	return s.give(kind, name)
}

func (s *heldSource) give(kind document.Kind, name string) (document.Document, error) {
	doc, ok := s.docs[kind][name]
	if !ok {
		return document.Document{}, document.ErrNotFound
	}
	return doc, nil
}

func (s *heldSource) List(_ context.Context, kind document.Kind) ([]string, error) {
	var names []string
	for name := range s.docs[kind] {
		if !slices.Contains(s.unlisted, string(kind)+"/"+name) {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names, nil
}

func (s *heldSource) Layers(context.Context) []document.LayerDir { return nil }

// documents are the texts given as the documents a source holds: each its
// text under its kind and name, and nothing more.
func documents(texts map[document.Kind]map[string]string) map[document.Kind]map[string]document.Document {
	docs := map[document.Kind]map[string]document.Document{}
	for kind, named := range texts {
		docs[kind] = map[string]document.Document{}
		for name, text := range named {
			docs[kind][name] = document.Document{Source: document.Source{Kind: kind, Name: name}, Bytes: []byte(text)}
		}
	}
	return docs
}

// While it is built, the snapshot asks its source for each document once,
// however many documents name it and whether or not the source lists or
// holds it: a prompt a process names with Read, any other listed prompt
// with ReadListed, and none with both. The service document is asked for
// whether the source holds it or not.
func TestSnapshotReadsEachDocumentOnceWhileItIsBuilt(t *testing.T) {
	t.Parallel()
	settings := settingsDocs()
	settings[document.KindPrompt]["notes"] = "Notes no process names.\n"
	settings[document.KindVerify] = map[string]string{"repo": verification}
	settings[document.KindSkill] = map[string]string{"review": skillDoc("review")}
	// Processes p and q name the prompt inspect, the verification repo and
	// the skill review, and agent a the skill review too.
	p := withSkills(namingVerification(settingsDocs()[document.KindProcess]["p"]), "review")
	naming := func(docs map[document.Kind]map[string]string) map[document.Kind]map[string]string {
		docs[document.KindProcess] = map[string]string{"p": p, "q": strings.Replace(p, "name: p", "name: q", 1)}
		docs[document.KindAgent] = map[string]string{"a": skilledAgent("a", "review")}
		return docs
	}
	theNamed := func() map[document.Kind]map[string]string {
		return map[document.Kind]map[string]string{
			document.KindPrompt: {"inspect": inspectPrompt},
			document.KindVerify: {"repo": verification},
			document.KindSkill:  {"review": skillDoc("review")},
		}
	}
	each := []string{
		"service/service", "processes/p", "processes/q", "agents/a",
		"prompts/inspect", "verifies/repo", "skills/review",
	}
	for name, c := range map[string]struct {
		docs     map[document.Kind]map[string]string
		unlisted []string
		// read are the documents asked for once with Read and never with
		// ReadListed, and listed the reverse: the source is asked for no
		// other document.
		read, listed []string
	}{
		"listed documents": {
			docs: settings,
			read: []string{
				"service/service", "runtimes/rt", "agents/a", "processes/p", "workflows/p_a", "schemas/s",
				"prompts/inspect", "verifies/repo", "skills/review",
			},
			listed: []string{"prompts/notes"},
		},
		"a listed document two others name": {
			docs: naming(theNamed()),
			read: each,
		},
		"an unlisted document two others name": {
			docs:     naming(theNamed()),
			unlisted: []string{"prompts/inspect", "verifies/repo", "skills/review"},
			read:     each,
		},
		"a named document the source lacks": {
			docs: naming(map[document.Kind]map[string]string{}),
			read: each,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			source := newHeldSource(documents(c.docs), c.unlisted...)
			want := map[string]asked{}
			for _, doc := range c.read {
				want[doc] = asked{Read: 1}
			}
			for _, doc := range c.listed {
				want[doc] = asked{ReadListed: 1}
			}
			app.Snapshot(context.Background(), source)
			if !reflect.DeepEqual(source.asked, want) {
				t.Errorf("the snapshot asked its source for %+v, want %+v", source.asked, want)
			}
		})
	}
}

// layered is a document with every field its holder could change in place:
// its bytes, its layer files and their fields, and its layer texts with
// their bytes and their files' fields. Each call makes it anew.
func layered(kind document.Kind, name, text string) document.Document {
	file := func(layer document.Layer) document.LayerFile {
		return document.LayerFile{Layer: layer, Path: string(layer) + "/" + string(kind) + "/" + name, Fields: []string{"schema", "name"}}
	}
	doc := document.Document{Source: document.Source{Kind: kind, Name: name}, Bytes: []byte(text)}
	for _, layer := range []document.Layer{document.LayerRepository, document.LayerHome} {
		doc.Source.Layers = append(doc.Source.Layers, file(layer))
		doc.Texts = append(doc.Texts, document.LayerText{File: file(layer), Bytes: []byte(text)})
	}
	return doc
}

// A document of the snapshot is frozen whole: a change made in place to
// what the source kept of the document it gave, or to the document the
// snapshot gave a caller, changes none the snapshot gives afterwards.
func TestSnapshotFreezesEveryMutableFieldOfADocument(t *testing.T) {
	t.Parallel()
	held := func() map[document.Kind]map[string]document.Document {
		docs := documents(settingsDocs())
		docs[document.KindAgent]["a"] = layered(document.KindAgent, "a", settingsDocs()[document.KindAgent]["a"])
		docs[document.KindPrompt]["inspect"] = layered(document.KindPrompt, "inspect", inspectPrompt)
		docs[document.KindPrompt]["notes"] = layered(document.KindPrompt, "notes", "Notes no process names.\n")
		return docs
	}
	reads := map[string]struct {
		kind document.Kind
		name string
		read func(app.SnapshotSource, context.Context, document.Kind, string) (document.Document, error)
	}{
		"a listed document":        {document.KindAgent, "a", app.SnapshotSource.Read},
		"a prompt a process names": {document.KindPrompt, "inspect", app.SnapshotSource.Read},
		"an inventory prompt":      {document.KindPrompt, "notes", app.SnapshotSource.ReadListed},
	}
	// Each changes what a slice of the document holds, so every copy of
	// the document that shares the slice changes with it.
	changes := map[string]func(document.Document){
		"its bytes":                    func(doc document.Document) { doc.Bytes[0] = 'X' },
		"a layer file":                 func(doc document.Document) { doc.Source.Layers[1] = document.LayerFile{Path: "changed"} },
		"a layer file's fields":        func(doc document.Document) { doc.Source.Layers[1].Fields[0] = "changed" },
		"a layer text":                 func(doc document.Document) { doc.Texts[1] = document.LayerText{Bytes: []byte("changed")} },
		"a layer text's bytes":         func(doc document.Document) { doc.Texts[1].Bytes[0] = 'X' },
		"a layer text's file's fields": func(doc document.Document) { doc.Texts[1].File.Fields[0] = "changed" },
	}
	for of, r := range reads {
		for field, change := range changes {
			t.Run(of+"/"+field, func(t *testing.T) {
				t.Parallel()
				ctx := context.Background()
				source := newHeldSource(held())
				snap := app.Snapshot(ctx, source)
				want := held()[r.kind][r.name]
				given := func() document.Document {
					doc, err := r.read(snap, ctx, r.kind, r.name)
					if err != nil {
						t.Fatal(err)
					}
					return doc
				}
				if got := given(); !reflect.DeepEqual(got, want) {
					t.Fatalf("the snapshot gave %+v, want %+v", got, want)
				}
				change(source.docs[r.kind][r.name])
				if got := given(); !reflect.DeepEqual(got, want) {
					t.Errorf("after the source changed %s of the document it gave, the snapshot gave %+v, want %+v", field, got, want)
				}
				change(given())
				if got := given(); !reflect.DeepEqual(got, want) {
					t.Errorf("after a caller changed %s of the document it was given, the snapshot gave %+v, want %+v", field, got, want)
				}
			})
		}
	}
}
