package documents_test

import (
	"fmt"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/gokit/tree"
)

const (
	homeProcess       = "/home/.agister/processes/a.yaml"
	repositoryProcess = "/repo/.agister/processes/a.yaml"
	projectProcess    = "/repo/p/.agister/processes/a.yaml"
)

func source(path, bytes string) *documents.Source {
	return &documents.Source{Path: path, Bytes: []byte(bytes)}
}

// snapshotOf is a snapshot of the processes given, by name.
func snapshotOf(processes map[string]documents.Document) documents.Snapshot {
	return documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{documents.Process: processes}}
}

// fields are a map's entries, each as "<key> <value> <origin's path>", by
// key; a value that is not a scalar is its kind.
func fields(t *testing.T, n tree.Node) []string {
	t.Helper()
	if n.Kind() != tree.Map {
		t.Fatalf("the tree is a %s, not a map", n.Kind())
	}
	var got []string
	for _, key := range n.Keys() {
		value, _ := n.Get(key)
		got = append(got, fmt.Sprintf("%s %s %s", key, scalar(value), value.Origin().Path))
	}
	return got
}

func scalar(n tree.Node) string {
	if s, ok := n.Text(); ok {
		return s
	}
	if i, ok := n.Integer(); ok {
		return fmt.Sprint(i)
	}
	return n.Kind().String()
}

// decodeProblems are the problems tree gives for bytes at path, as a
// document's.
func decodeProblems(t *testing.T, format tree.Format, bytes, path string) []documents.Problem {
	t.Helper()
	_, decoded := tree.Decode(format, []byte(bytes), path)
	if len(decoded) == 0 {
		t.Fatalf("%q decodes with no problem", bytes)
	}
	var problems []documents.Problem
	for _, p := range decoded {
		problems = append(problems, documents.Problem{Path: p.Origin.Path, Line: p.Origin.Line, Place: p.Place, Message: p.Message})
	}
	return problems
}

func assertProblems(t *testing.T, got, want []documents.Problem) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Errorf("problems\n got %q\nwant %q", got, want)
	}
}

func assertNoTree(t *testing.T, got tree.Node) {
	t.Helper()
	if got.Kind() != tree.Empty {
		t.Errorf("a tree of kind %s, want none", got.Kind())
	}
}

// Each tree document's layers are decoded once, when the documents are
// built, and never again however often and from however many callers its
// documents are asked for.
func TestEachDocumentIsDerivedOnce(t *testing.T) {
	t.Parallel()
	const (
		agent  = "/home/.agister/agents/b.toml"
		prompt = "/home/.agister/prompts/p.md"
	)
	var mu sync.Mutex
	var decoded []string
	decode := func(format tree.Format, data []byte, path string) (tree.Node, []tree.Problem) {
		mu.Lock()
		decoded = append(decoded, path)
		mu.Unlock()
		return tree.Decode(format, data, path)
	}
	d := documents.NewDecodingWith(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
		documents.Process: {
			"a": {Sources: documents.Sources{
				Home:       source(homeProcess, "{x: 1}"),
				Repository: source(repositoryProcess, "x: [1"),
				Project:    source(projectProcess, "{y: 1}"),
			}},
			"c": {Sources: documents.Sources{Project: source("/repo/p/.agister/processes/c.yaml", "{x: 1}")}},
		},
		documents.Agent:  {"b": {Sources: documents.Sources{Home: source(agent, "x = 1")}}},
		documents.Prompt: {"p": {Sources: documents.Sources{Home: source(prompt, "near")}}},
	}}, decode)
	// Each file a tree document's layer holds, once; none of a blob's.
	want := slices.Sorted(slices.Values([]string{agent, homeProcess, repositoryProcess, projectProcess, "/repo/p/.agister/processes/c.yaml"}))
	assertDecoded := func(when string) {
		t.Helper()
		mu.Lock()
		got := slices.Sorted(slices.Values(decoded))
		mu.Unlock()
		if !slices.Equal(got, want) {
			t.Errorf("%s, decoded\n got %q\nwant %q", when, got, want)
		}
	}
	assertDecoded("built")
	var callers sync.WaitGroup
	for range 8 {
		callers.Add(1)
		go func() {
			defer callers.Done()
			for range 3 {
				d.Tree(documents.Process, "a")
				d.Tree(documents.Process, "c")
				d.Tree(documents.Agent, "b")
				d.Tree(documents.Process, "z")
				d.Blob(documents.Prompt, "p")
			}
		}()
	}
	callers.Wait()
	assertDecoded("asked for each document many times")
	if _, problems := d.Tree(documents.Process, "a"); len(problems) == 0 {
		t.Errorf("process a gives no problem, want its repository's")
	}
	if got, problems := d.Tree(documents.Agent, "b"); len(problems) > 0 || !slices.Equal(fields(t, got), []string{"x 1 " + agent}) {
		t.Errorf("agent b is %v %q, want x 1 from its file", got, problems)
	}
	got, problems := d.Blob(documents.Prompt, "p")
	assertProblems(t, problems, nil)
	assertBlob(t, got, prompt, "near")
}

// What a caller does with the problems it is given leaves the next
// caller's as they were.
func TestADocumentsProblemsAreTheCallersOwn(t *testing.T) {
	t.Parallel()
	denied := documents.Problem{Path: repositoryProcess, Message: "permission denied"}
	d := documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
		documents.Process: {"a": {Problems: []documents.Problem{denied}}},
		documents.Prompt:  {"a": {Problems: []documents.Problem{denied}}},
	}})
	_, first := d.Tree(documents.Process, "a")
	first[0].Message = "changed"
	_, problems := d.Tree(documents.Process, "a")
	assertProblems(t, problems, []documents.Problem{denied})
	_, first = d.Blob(documents.Prompt, "a")
	first[0].Message = "changed"
	_, problems = d.Blob(documents.Prompt, "a")
	assertProblems(t, problems, []documents.Problem{denied})
}

// What the snapshot's caller does with the problems it gave after the
// documents are built changes no document's: each keeps every field it was
// given.
func TestTheSnapshotsProblemsChangingAfterChangesNoDocument(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		kind    documents.Kind
		sources documents.Sources
	}{
		{"a process with no source", documents.Process, documents.Sources{}},
		{"a process beside a source", documents.Process, documents.Sources{Home: source(homeProcess, "{x: 1}")}},
		{"an agent beside a source", documents.Agent, documents.Sources{Home: source("/home/.agister/agents/a.toml", "x = 1")}},
		{"a prompt with no source", documents.Prompt, documents.Sources{}},
		{"a prompt beside a source", documents.Prompt, documents.Sources{Home: source("/home/.agister/prompts/a.md", "far")}},
		{"a schema beside a source", documents.Schema, documents.Sources{Home: source("/home/.agister/schemas/a.json", "{}")}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			want := []documents.Problem{
				{Path: "/repo/.agister/a", Line: 2, Place: "x.y[0]", Message: "permission denied"},
				{Path: "/repo/p/.agister/a", Message: "too large"},
			}
			given := slices.Clone(want)
			d := documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
				c.kind: {"a": {Sources: c.sources, Problems: given}},
			}})
			for i := range given {
				given[i] = documents.Problem{Path: "/changed", Line: 99, Place: "changed", Message: "changed"}
			}
			if c.kind == documents.Prompt || c.kind == documents.Schema {
				got, problems := d.Blob(c.kind, "a")
				assertNoBlob(t, got)
				assertProblems(t, problems, want)
				return
			}
			got, problems := d.Tree(c.kind, "a")
			assertNoTree(t, got)
			assertProblems(t, problems, want)
		})
	}
}

// What the snapshot's caller does with its bytes after the documents are
// built changes no document: a blob's bytes stay those its digest is of.
func TestTheSnapshotsBytesChangingAfterChangesNoDocument(t *testing.T) {
	t.Parallel()
	const prompt = "/home/.agister/prompts/a.md"
	process := source(homeProcess, "{x: 1}")
	blob := source(prompt, "near")
	d := documents.New(documents.Snapshot{Documents: map[documents.Kind]map[string]documents.Document{
		documents.Process: {"a": {Sources: documents.Sources{Home: process}}},
		documents.Prompt:  {"a": {Sources: documents.Sources{Home: blob}}},
	}})
	copy(process.Bytes, "{y: 2}")
	copy(blob.Bytes, "XXXX")
	got, problems := d.Blob(documents.Prompt, "a")
	assertProblems(t, problems, nil)
	assertBlob(t, got, prompt, "near")
	composed, problems := d.Tree(documents.Process, "a")
	assertProblems(t, problems, nil)
	if got := fields(t, composed); !slices.Equal(got, []string{"x 1 " + homeProcess}) {
		t.Errorf("fields %q, want x 1 from home", got)
	}
}

func TestAProblemReadsAsItsPathLinePlaceAndMessage(t *testing.T) {
	t.Parallel()
	cases := []struct {
		problem documents.Problem
		want    string
	}{
		{documents.Problem{Path: "/a.yaml", Line: 3, Place: "x.y[0]", Message: "m"}, "/a.yaml:3: x.y[0]: m"},
		{documents.Problem{Path: "/a.yaml", Place: "x", Message: "m"}, "/a.yaml: x: m"},
		{documents.Problem{Path: "/a.yaml", Line: 3, Message: "m"}, "/a.yaml:3: m"},
		{documents.Problem{Path: "/a.yaml", Message: "m"}, "/a.yaml: m"},
		{documents.Problem{Place: "x", Message: "m"}, "x: m"},
		{documents.Problem{Message: "m"}, "m"},
	}
	for _, c := range cases {
		t.Run(strings.ReplaceAll(c.want, "/", "_"), func(t *testing.T) {
			t.Parallel()
			if got := c.problem.String(); got != c.want {
				t.Errorf("%#v reads %q, want %q", c.problem, got, c.want)
			}
		})
	}
}
