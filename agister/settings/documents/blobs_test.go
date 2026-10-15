package documents_test

import (
	"crypto/sha256"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
)

// blobOf is a documents of one blob, kind's "a", of the sources and
// problems given.
func blobOf(kind documents.Kind, document documents.Document) *documents.Documents {
	return documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{kind: {"a": document}}})
}

func assertNoBlob(t *testing.T, got documents.Blob) {
	t.Helper()
	if !reflect.DeepEqual(got, documents.Blob{}) {
		t.Errorf("a blob at %q, want none", got.Path)
	}
}

func assertBlob(t *testing.T, got documents.Blob, path, bytes string) {
	t.Helper()
	want := documents.Blob{Path: path, Bytes: []byte(bytes), Digest: sha256.Sum256([]byte(bytes))}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("blob\n got %q %q %x\nwant %q %q %x", got.Path, got.Bytes, got.Digest, want.Path, want.Bytes, want.Digest)
	}
}

// Whichever layers hold a blob, it is the nearest one's file.
func TestABlobIsTheNearestLayersBytesWhole(t *testing.T) {
	t.Parallel()
	kinds := []struct {
		kind        documents.Kind
		folder, ext string
	}{
		{documents.Prompt, "prompts", ".md"},
		{documents.Schema, "schemas", ".json"},
	}
	// layers are the bytes of each layer that holds the blob; a layer not
	// named holds none.
	cases := []struct {
		name        string
		layers      map[string]string
		want, bytes string
	}{
		{"home and repository", map[string]string{"home": "far", "repository": "near"}, "repository", "near"},
		{"home alone", map[string]string{"home": "near"}, "home", "near"},
		{"repository alone", map[string]string{"repository": "near"}, "repository", "near"},
		{"home and project", map[string]string{"home": "far", "project": "near"}, "project", "near"},
		{"repository and project", map[string]string{"repository": "far", "project": "near"}, "project", "near"},
		{"every layer", map[string]string{"home": "far", "repository": "far", "project": "near"}, "project", "near"},
		{"an empty project over the repository", map[string]string{"repository": "far", "project": ""}, "project", ""},
	}
	for _, k := range kinds {
		for _, c := range cases {
			t.Run(string(k.kind)+" "+c.name, func(t *testing.T) {
				t.Parallel()
				paths := map[string]string{
					"home":       "/home/.agister/" + k.folder + "/a" + k.ext,
					"repository": "/repo/.agister/" + k.folder + "/a" + k.ext,
					"project":    "/repo/p/.agister/" + k.folder + "/a" + k.ext,
				}
				slot := func(layer string) *documents.Source {
					bytes, held := c.layers[layer]
					if !held {
						return nil
					}
					return source(paths[layer], bytes)
				}
				d := blobOf(k.kind, documents.Document{Sources: documents.Sources{
					Home:       slot("home"),
					Repository: slot("repository"),
					Project:    slot("project"),
				}})
				got, problems := d.Blob(k.kind, "a")
				assertProblems(t, problems, nil)
				assertBlob(t, got, paths[c.want], c.bytes)
			})
		}
	}
}

// A blob's bytes are its file's, every one: the whitespace around them and
// their line endings, CRLF among them, are kept, and the digest is theirs.
func TestABlobKeepsItsWhitespaceAndLineEndings(t *testing.T) {
	t.Parallel()
	kinds := []struct {
		kind        documents.Kind
		folder, ext string
	}{
		{documents.Prompt, "prompts", ".md"},
		{documents.Schema, "schemas", ".json"},
	}
	payloads := []struct {
		name, bytes string
	}{
		{"a leading line and spaces, a trailing CRLF", "\n  near\r\n"},
		{"a trailing LF", "near\n"},
		{"a trailing CR", "near\r"},
		{"leading and trailing CRLFs", "\r\nnear\r\n\r\n"},
		{"leading and trailing spaces and tabs", " \tnear \t"},
		{"CRLF line endings", "line one\r\nline two\r\n"},
		{"mixed line endings", "a\nb\r\nc\rd"},
		{"whitespace alone", " \r\n\t\n"},
	}
	for _, k := range kinds {
		for _, p := range payloads {
			t.Run(string(k.kind)+" "+p.name, func(t *testing.T) {
				t.Parallel()
				repository := "/repo/.agister/" + k.folder + "/a" + k.ext
				d := blobOf(k.kind, documents.Document{Sources: documents.Sources{
					Home:       source("/home/.agister/"+k.folder+"/a"+k.ext, "far"),
					Repository: source(repository, p.bytes),
				}})
				got, problems := d.Blob(k.kind, "a")
				assertProblems(t, problems, nil)
				assertBlob(t, got, repository, p.bytes)
			})
		}
	}
}

// No format reads a blob's bytes: those no format decodes are given as
// they are.
func TestABlobIsNotDecoded(t *testing.T) {
	t.Parallel()
	cases := []struct {
		kind  documents.Kind
		path  string
		bytes string
	}{
		{documents.Prompt, "/home/.agister/prompts/a.md", "x: [1"},
		{documents.Prompt, "/home/.agister/prompts/a.md", "x = [1"},
		{documents.Schema, "/home/.agister/schemas/a.json", `{"x": [1`},
	}
	for _, c := range cases {
		t.Run(string(c.kind)+" "+c.bytes, func(t *testing.T) {
			t.Parallel()
			got, problems := blobOf(c.kind, documents.Document{Sources: documents.Sources{Home: source(c.path, c.bytes)}}).Blob(c.kind, "a")
			assertProblems(t, problems, nil)
			assertBlob(t, got, c.path, c.bytes)
		})
	}
}

func TestABlobNoLayerHoldsIsAProblem(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		snapshot documents.Snapshot
	}{
		{"no document", documents.Snapshot{}},
		{"no prompt", documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
			documents.Schema: {"a": {Sources: documents.Sources{Home: source("/home/.agister/schemas/a.json", "{}")}}},
		}}},
		{"no prompt a", documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
			documents.Prompt: {"b": {Sources: documents.Sources{Home: source("/home/.agister/prompts/b.md", "b")}}},
		}}},
		{"a prompt a with no source", documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
			documents.Prompt: {"a": {}},
		}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := documents.New(c.snapshot).Blob(documents.Prompt, "a")
			assertNoBlob(t, got)
			assertProblems(t, problems, []documents.Problem{{Message: `no layer holds the prompt "a"`}})
		})
	}
}

// A file problem is the blob's whichever layer's file it is, and no other
// layer's file stands in for it.
func TestABlobsFileProblemIsNoFallBack(t *testing.T) {
	t.Parallel()
	const (
		home       = "/home/.agister/prompts/a.md"
		repository = "/repo/.agister/prompts/a.md"
		project    = "/repo/p/.agister/prompts/a.md"
	)
	denied := documents.Problem{Path: repository, Message: "permission denied"}
	cases := []struct {
		name    string
		sources documents.Sources
	}{
		{"beside a farther source", documents.Sources{Home: source(home, "far")}},
		{"beside a nearer source", documents.Sources{Project: source(project, "near")}},
		{"with no source", documents.Sources{}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, problems := blobOf(documents.Prompt, documents.Document{Sources: c.sources, Problems: []documents.Problem{denied}}).Blob(documents.Prompt, "a")
			assertNoBlob(t, got)
			assertProblems(t, problems, []documents.Problem{denied})
		})
	}
}

func TestAKindThatIsNoBlobIsAProblem(t *testing.T) {
	t.Parallel()
	cases := []struct {
		kind documents.Kind
		want string
	}{
		{documents.Agent, "an agent is a tree, not a blob"},
		{documents.Process, "a process is a tree, not a blob"},
		{documents.Workflow, "a workflow is a tree, not a blob"},
		{documents.Runtime, "a runtime is a tree, not a blob"},
		{documents.Brief, "a brief is a tree, not a blob"},
		{"skill", `the kind "skill" is not known`},
	}
	for _, c := range cases {
		t.Run(string(c.kind), func(t *testing.T) {
			t.Parallel()
			got, problems := blobOf(c.kind, documents.Document{Sources: documents.Sources{Home: source("/home/.agister/a", "{x: 1}")}}).Blob(c.kind, "a")
			assertNoBlob(t, got)
			assertProblems(t, problems, []documents.Problem{{Message: c.want}})
		})
	}
}

// What a caller does with a blob's bytes leaves the snapshot's as they
// were: the next caller gets them unchanged.
func TestABlobsBytesAreTheCallersOwn(t *testing.T) {
	t.Parallel()
	const path = "/home/.agister/prompts/a.md"
	d := blobOf(documents.Prompt, documents.Document{Sources: documents.Sources{Home: source(path, "near")}})
	first, _ := d.Blob(documents.Prompt, "a")
	copy(first.Bytes, "XXXX")
	got, problems := d.Blob(documents.Prompt, "a")
	assertProblems(t, problems, nil)
	assertBlob(t, got, path, "near")
}
