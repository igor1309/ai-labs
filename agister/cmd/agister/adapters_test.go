package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/files"
	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
	"github.com/igor1309/ai-labs/agister/runtime/pi"
	"github.com/igor1309/ai-labs/agister/settings/check"
	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/agister/settings/layout"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
	"github.com/igor1309/ai-labs/gokit/tree"
)

// adapters.feature, "A reference is given to resolve as what it reads".
func TestAReferenceIsGivenToResolveAsWhatItReads(t *testing.T) {
	t.Parallel()
	const file = "/r/.agister/workflows/w.yaml"
	cases := []struct {
		reads documents.Reference
		read  resolve.Read
	}{
		{documents.Reference{Root: documents.ReadsParam, Name: "base"}, resolve.Read{Root: resolve.RootParam, Name: "base"}},
		{documents.Reference{Root: documents.ReadsInput, Name: "base"}, resolve.Read{Root: resolve.RootInput, Name: "base"}},
		{documents.Reference{Root: documents.ReadsState, Name: "review"}, resolve.Read{Root: resolve.RootState, Name: "review"}},
		{documents.Reference{Root: documents.ReadsOutputs, Name: "a"}, resolve.Read{Root: resolve.RootOutputs, Name: "a"}},
		{documents.Reference{Root: documents.ReadsOutputs, Name: "a", Field: "v"}, resolve.Read{Root: resolve.RootOutputs, Name: "a", Field: "v"}},
		{documents.Reference{Root: documents.ReadsSession, Name: "a"}, resolve.Read{Root: resolve.RootSession, Name: "a"}},
		{documents.Reference{Root: documents.ReadsState, Name: "review", Field: "x"}, resolve.Read{Root: resolve.RootState, Name: "review", Field: "x"}},
		{documents.Reference{Root: documents.ReadsItem}, resolve.Read{Root: resolve.RootQueryItem}},
		{documents.Reference{Root: documents.ReadsItem, Field: "fixed"}, resolve.Read{Root: resolve.RootQueryItem, Field: "fixed"}},
	}
	for _, c := range cases {
		t.Run(fmt.Sprintf("%+v", c.reads), func(t *testing.T) {
			t.Parallel()
			spy := newDocumentsSpy(t)
			spy.workflows["w"] = typed[documents.WorkflowDefinition]{value: documents.WorkflowDefinition{
				Name:    "w",
				Steps:   given([]documents.Field[documents.Item]{step("s", file, 3)}, file, 2),
				Outputs: given([]documents.Field[documents.Binding]{reading("o", c.reads, file, 5)}, file, 4),
			}}
			workflow, problems := sourceOf(t, spy, layout.Snapshot{}).Workflow("w")
			if len(problems) > 0 {
				t.Fatalf("problems %+v, want none", problems)
			}
			want := c.read
			want.Origin = at(file, 5, "outputs.o")
			if got := workflow.Outputs[0].From; got == nil || *got != want {
				t.Errorf("it reads %+v, want %+v", got, want)
			}
		})
	}
}

// adapters.feature, "A value's origin carries its place".
func TestAValuesOriginCarriesItsPlace(t *testing.T) {
	t.Parallel()
	const file = "/r/.agister/workflows/w.yaml"
	spy := newDocumentsSpy(t)
	spy.workflows["w"] = typed[documents.WorkflowDefinition]{value: documents.WorkflowDefinition{
		Name: "w",
		Steps: given([]documents.Field[documents.Item]{
			given(documents.Item{Name: "s", Process: given("p", file, 3), Agent: given("a", file, 4)}, file, 3),
		}, file, 2),
	}}
	workflow, problems := sourceOf(t, spy, layout.Snapshot{}).Workflow("w")
	if len(problems) > 0 {
		t.Fatalf("problems %+v, want none", problems)
	}
	want := resolve.Name{Value: "a", Origin: at(file, 4, "steps[0].agent")}
	if got := workflow.Steps[0].Agent; got != want {
		t.Errorf("the agent's name %+v, want %+v", got, want)
	}
}

// resolverSpy is a spy of check's resolve's resolve: it keeps each request
// and gives what its test gives, whatever the request.
type resolverSpy struct {
	requests []resolve.Request
	resolved resolve.Resolved
	faults   []resolve.Fault
}

func (s *resolverSpy) Resolve(request resolve.Request) (resolve.Resolved, []resolve.Fault) {
	s.requests = append(s.requests, request)
	return s.resolved, s.faults
}

// declaredSpy is a spy of check's resolve's source: the workflows and the
// problems of no document its test gives.
type declaredSpy struct {
	t         *testing.T
	workflows map[string]resolve.Workflow
	problems  []resolve.Problem
}

func (s *declaredSpy) Workflow(name string) (resolve.Workflow, []resolve.Problem) {
	workflow, ok := s.workflows[name]
	if !ok {
		s.t.Errorf("the source asked for the workflow %q, which the test does not answer", name)
	}
	return workflow, nil
}

func (s *declaredSpy) Problems() []resolve.Problem { return slices.Clone(s.problems) }

// homeAndRepository are home's folder "/u/.agister" and the repository's
// "/r/.agister", and the project's "/r/a/.agister".
func homeAndRepository() layout.Folders {
	return layout.Folders{Home: "/u/.agister", Repository: "/r/.agister", Project: "/r/a/.agister"}
}

func checkResolveOf(t *testing.T, resolver resolver, source declared) *checkResolve {
	t.Helper()
	c, err := newCheckResolve(resolver, source, homeAndRepository())
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// adapters.feature, "Check's resolve gives a workflow every param it
// declares". A document of another kind is asked for with no param.
func TestChecksResolveGivesAWorkflowEveryParamItDeclares(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		document check.Reference
		want     resolve.Request
	}{
		{"a workflow", check.Reference{Kind: check.KindWorkflow, Name: "w"},
			resolve.Document(resolve.KindWorkflow, "w").WithParams("base", "goal")},
		{"a process", check.Reference{Kind: check.KindProcess, Name: "p"}, resolve.Document(resolve.KindProcess, "p")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			resolver := &resolverSpy{}
			source := &declaredSpy{t: t, workflows: map[string]resolve.Workflow{
				"w": {Name: "w", Params: []resolve.Param{{Name: "base"}, {Name: "goal", Default: true}}},
			}}
			checkResolveOf(t, resolver, source).Resolve(c.document)
			if want := []resolve.Request{c.want}; !reflect.DeepEqual(resolver.requests, want) {
				t.Errorf("resolve is asked\n got %+v\nwant %+v", resolver.requests, want)
			}
		})
	}
}

// treesSpy is a spy of check's fields' documents: the trees and problems
// its test gives, by kind and name.
type treesSpy struct {
	t        *testing.T
	trees    map[documents.Kind]map[string]tree.Node
	problems []documents.Problem
}

func (s *treesSpy) Tree(kind documents.Kind, name string) (tree.Node, []documents.Problem) {
	node, ok := s.trees[kind][name]
	if !ok && len(s.problems) == 0 {
		s.t.Errorf("documents asked for the tree of the %s %q, which the test does not answer", kind, name)
	}
	return node, slices.Clone(s.problems)
}

// adapters.feature, "A field's layer comes from its file". Each leaf is a
// field, at its place, its value as text, in the tree's order.
func TestAFieldsLayerComesFromItsFile(t *testing.T) {
	t.Parallel()
	const (
		repository = "/r/.agister/processes/p.yaml"
		home       = "/u/.agister/processes/p.yaml"
		project    = "/r/a/.agister/processes/p.yaml"
	)
	from := func(path string, line int) tree.Origin { return tree.Origin{Path: path, Line: line} }
	spy := &treesSpy{t: t, trees: map[documents.Kind]map[string]tree.Node{documents.Process: {"p": tree.NewMap(map[string]tree.Node{
		"instruction": tree.NewString("Review it.", from(repository, 2)),
		"guidance":    tree.NewList([]tree.Node{tree.NewString("g", from(home, 4))}, from(home, 3)),
		"limits": tree.NewMap(map[string]tree.Node{
			"cost":  tree.NewNumber(1.5, from(project, 6)),
			"stale": tree.NewMap(map[string]tree.Node{"repeated_tool_calls": tree.NewInteger(3, from(home, 8))}, from(home, 7)),
		}, from(home, 5)),
		"permissions": tree.NewMap(nil, from(home, 9)),
		"workspace":   tree.NewMap(map[string]tree.Node{"clean": tree.NewBoolean(true, from("/elsewhere/p.yaml", 1))}, from(home, 10)),
	}, from(home, 1))}}}
	fields, err := newCheckFields(spy, homeAndRepository())
	if err != nil {
		t.Fatal(err)
	}
	source := func(path string, line int, layer check.Layer) check.Source {
		return check.Source{File: path, Line: line, Layer: layer}
	}
	want := []check.Field{
		{Place: "guidance[0]", Value: "g", Source: source(home, 4, check.LayerHome)},
		{Place: "instruction", Value: "Review it.", Source: source(repository, 2, check.LayerRepository)},
		{Place: "limits.cost", Value: "1.5", Source: source(project, 6, check.LayerProject)},
		{Place: "limits.stale.repeated_tool_calls", Value: "3", Source: source(home, 8, check.LayerHome)},
		{Place: "permissions", Value: "{}", Source: source(home, 9, check.LayerHome)},
		{Place: "workspace.clean", Value: "true", Source: source("/elsewhere/p.yaml", 1, "")},
	}
	if got := fields.Fields(check.Reference{Kind: check.KindProcess, Name: "p"}); !reflect.DeepEqual(got, want) {
		t.Errorf("fields\n got %+v\nwant %+v", got, want)
	}
}

// A document whose tree has problems, one that does not decode, has no
// fields.
func TestADocumentThatDoesNotDecodeHasNoFields(t *testing.T) {
	t.Parallel()
	spy := &treesSpy{t: t, problems: []documents.Problem{{Path: "/r/.agister/processes/p.yaml", Line: 1, Message: "it is not YAML"}}}
	fields, err := newCheckFields(spy, homeAndRepository())
	if err != nil {
		t.Fatal(err)
	}
	if got := fields.Fields(check.Reference{Kind: check.KindProcess, Name: "p"}); got != nil {
		t.Errorf("fields %+v, want none", got)
	}
}

// adapters.feature, "One command reads the settings once": check, every
// listing and every show come from the one snapshot.
func TestOneCommandReadsTheSettingsOnce(t *testing.T) {
	t.Parallel()
	settings := map[string]string{
		"/u/.agister/workflows/w.yaml": "schema: agister.workflow/v1alpha1\nsteps:\n  - {name: s, process: p, agent: a}\n",
		"/u/.agister/processes/p.yaml": "schema: agister.process/v1alpha1\nprompt: pr\n",
		"/r/.agister/processes/p.yaml": "instruction: Review it.\n",
		"/u/.agister/agents/a.toml":    "schema = \"agister.agent/v1alpha1\"\nruntime = \"r\"\n",
		"/u/.agister/runtimes/r.yaml":  "schema: agister.runtime/v1alpha1\nadapter: bash\ncontract: bash/1\n",
		"/u/.agister/prompts/pr.md":    "Review.\n",
		"/r/.agister/blocks.yaml":      "- {agent: gone, reason: old}\n",
	}
	filesystem := newFilesystemSpy(settings)
	checker, err := newChecker("/u/.agister", "/r", filesystem, rootSpy{root: "/r"}, wrappersSpy{"bash/1": {}})
	if err != nil {
		t.Fatal(err)
	}
	report := checker.Check()
	for _, kind := range []check.Kind{check.KindWorkflow, check.KindProcess, check.KindAgent} {
		if _, err := checker.List(kind); err != nil {
			t.Fatal(err)
		}
	}
	for _, document := range []check.Reference{{Kind: check.KindWorkflow, Name: "w"}, {Kind: check.KindProcess, Name: "p"}} {
		if _, err := checker.Show(document); err != nil {
			t.Fatal(err)
		}
	}
	want := map[string]int{}
	for name := range settings {
		want[name] = 1
	}
	if got := filesystem.readsOf(); !maps.Equal(got, want) {
		t.Errorf("layout read the files %v, want each once: %v", got, want)
	}
	// The settings resolve, so the reads are those of a whole check.
	for _, status := range report.Names {
		if !status.Resolves {
			t.Errorf("%+v is refused: %+v", status.Document, report)
		}
	}
	if len(report.Names) != 5 {
		t.Errorf("names %+v, want the workflow, process, agent, runtime and prompt", report.Names)
	}
}

// adapters.feature, "The problems of no document are layout's and the
// blocks file's".
func TestTheProblemsOfNoDocumentAreLayoutsAndTheBlocksFiles(t *testing.T) {
	t.Parallel()
	spy := newDocumentsSpy(t)
	spy.blockProblems = []documents.Problem{{Path: "/r/.agister/blocks.yaml", Line: 2, Place: "[1]", Message: "it names one kind and a name"}}
	snapshot := layout.Snapshot{Problems: []layout.Problem{{Path: "/r/a/.agister", Err: layout.ErrNoLayerFolder}}}
	want := []resolve.Problem{
		{Origin: at("/r/a/.agister", 0, ""), Message: layout.ErrNoLayerFolder.Error()},
		{Origin: at("/r/.agister/blocks.yaml", 2, "[1]"), Message: "it names one kind and a name"},
	}
	if got := sourceOf(t, spy, snapshot).Problems(); !reflect.DeepEqual(got, want) {
		t.Errorf("the problems of no document\n got %+v\nwant %+v", got, want)
	}
}

type claudeCodeSpy struct{ facts claudecode.Facts }

func (s claudeCodeSpy) Facts() claudecode.Facts { return s.facts }

type codexSpy struct{ facts codex.Facts }

func (s codexSpy) Facts() codex.Facts { return s.facts }

type piSpy struct{ facts pi.Facts }

func (s piSpy) Facts() pi.Facts { return s.facts }

type bashSpy struct{ facts bash.Facts }

func (s bashSpy) Facts() bash.Facts { return s.facts }

// adapters.feature, "The facts by contract". Each wrapper's spy gives
// facts no other's does, so each answer tells its wrapper.
func TestTheFactsByContract(t *testing.T) {
	t.Parallel()
	wrappers, err := newContracts(
		claudeCodeFacts(claudeCodeSpy{claudecode.Facts{Contract: "claude-code/3", Schema: true, Efforts: []string{"high"}}}),
		codexFacts(codexSpy{codex.Facts{Contract: "codex/2", Session: true, Skills: true, Efforts: []string{"minimal"}}}),
		piFacts(piSpy{pi.Facts{Contract: "pi/1", Model: true, ToolCalls: true, Efforts: []string{"off"}}}),
		bashFacts(bashSpy{bash.Facts{Contract: "bash/1", ToolCommands: true}}),
	)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		contract string
		facts    resolve.Facts
		taken    bool
	}{
		{"claude-code/3", resolve.Facts{Schema: true, Efforts: []string{"high"}}, true},
		{"codex/2", resolve.Facts{Session: true, Skills: true, Efforts: []string{"minimal"}}, true},
		{"pi/1", resolve.Facts{Model: true, ToolCalls: true, Efforts: []string{"off"}}, true},
		{"bash/1", resolve.Facts{ToolCommands: true}, true},
		{"other/9", resolve.Facts{}, false},
	}
	for _, c := range cases {
		t.Run(c.contract, func(t *testing.T) {
			t.Parallel()
			facts, taken := wrappers.Facts(c.contract)
			if !reflect.DeepEqual(facts, c.facts) || taken != c.taken {
				t.Errorf("facts %+v, %t; want %+v, %t", facts, taken, c.facts, c.taken)
			}
		})
	}
}

// adapters.feature, "Check's names come from the snapshot, with their
// layers". A file that cannot be read is its layer's too.
func TestChecksNamesComeFromTheSnapshotWithTheirLayers(t *testing.T) {
	t.Parallel()
	snapshot := layout.Snapshot{Layers: homeAndRepository(), Documents: map[layout.Kind]map[string]layout.Document{
		layout.Process: {"p": {Sources: layout.Sources{
			Home:       &layout.Source{Path: "/u/.agister/processes/p.yaml"},
			Repository: &layout.Source{Path: "/r/.agister/processes/p.yaml"},
		}}},
		layout.Prompt: {"pr": {Problems: []layout.Problem{{Path: "/r/a/.agister/prompts/pr.txt", Err: errors.New("a prompt is a \".md\" file")}}}},
	}}
	got := names{snapshot: snapshot}.Held()
	slices.SortFunc(got, func(a, b check.Held) int { return strings.Compare(string(a.Kind), string(b.Kind)) })
	want := []check.Held{
		{Kind: check.KindProcess, Name: "p", Layers: []check.Layer{check.LayerHome, check.LayerRepository}},
		{Kind: check.KindPrompt, Name: "pr", Layers: []check.Layer{check.LayerProject}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("names\n got %+v\nwant %+v", got, want)
	}
}

// adapters.feature, "A problem's and a link's layer come from their file".
// A block's source is its file's too.
func TestAProblemsAndALinksLayerComeFromTheirFile(t *testing.T) {
	t.Parallel()
	resolver := &resolverSpy{faults: []resolve.Fault{
		{Chain: []resolve.Link{
			{Kind: resolve.KindWorkflow, Name: "w"},
			{Kind: resolve.KindAgent, Name: "a", Origin: at("/u/.agister/workflows/w.yaml", 3, "steps[0].agent")},
		}, Problems: []resolve.Problem{{Origin: at("/r/.agister/agents/a.toml", 2, "model"), Message: "its runtime \"r\" takes a model"}}},
		{Chain: []resolve.Link{{Kind: resolve.KindProcess, Name: "p"}},
			Block: &resolve.Block{Kind: resolve.KindProcess, Name: "p", Reason: "not here", Origin: at("/r/.agister/blocks.yaml", 1, "[0]")}},
	}}
	_, faults := checkResolveOf(t, resolver, &declaredSpy{t: t}).Resolve(check.Reference{Kind: check.KindAgent, Name: "a"})
	want := []check.Fault{
		{Chain: []check.Link{
			{Kind: check.KindWorkflow, Name: "w"},
			{Kind: check.KindAgent, Name: "a", Source: check.Source{File: "/u/.agister/workflows/w.yaml", Line: 3, Layer: check.LayerHome}, Place: "steps[0].agent"},
		}, Problems: []check.Problem{{Source: check.Source{File: "/r/.agister/agents/a.toml", Line: 2, Layer: check.LayerRepository}, Place: "model", Message: "its runtime \"r\" takes a model"}}},
		{Chain: []check.Link{{Kind: check.KindProcess, Name: "p"}},
			Block: &check.Block{Reason: "not here", Source: check.Source{File: "/r/.agister/blocks.yaml", Line: 1, Layer: check.LayerRepository}}},
	}
	if !reflect.DeepEqual(faults, want) {
		t.Errorf("faults\n got %+v\nwant %+v", faults, want)
	}
}

// What resolves is given to check whole: every document reached, each
// plan and each warning, at its file's layer; and the problems of no
// document are the source's.
func TestChecksResolveGivesWhatResolves(t *testing.T) {
	t.Parallel()
	plan := resolve.Plan{Workflow: "w", Place: "steps[0]", Process: "p", Agent: "a", Runtime: "r",
		Options: []string{"o"}, Required: []string{"read"}, Allowed: []string{"read"}, Granted: []string{"read", "net"},
		Extra: []string{"net"}, Withheld: []string{"write"}}
	resolver := &resolverSpy{resolved: resolve.Resolved{
		Reached:  []resolve.Reference{{Kind: resolve.KindWorkflow, Name: "w"}, {Kind: resolve.KindSkill, Name: "k"}},
		Plans:    []resolve.Plan{plan},
		Warnings: []resolve.Problem{{Origin: at("/r/a/.agister/workflows/w.yaml", 3, "steps[0]"), Message: "its plan grants \"net\""}},
	}}
	source := &declaredSpy{t: t, workflows: map[string]resolve.Workflow{"w": {Name: "w"}},
		problems: []resolve.Problem{{Origin: at("/u/.agister", 0, ""), Message: "the layer's folder does not exist"}}}
	c := checkResolveOf(t, resolver, source)
	resolved, faults := c.Resolve(check.Reference{Kind: check.KindWorkflow, Name: "w"})
	if faults != nil {
		t.Fatalf("faults %+v, want none", faults)
	}
	want := check.Resolved{
		Reached: []check.Reference{{Kind: check.KindWorkflow, Name: "w"}, {Kind: check.KindSkill, Name: "k"}},
		Plans: []check.Plan{{Workflow: "w", Place: "steps[0]", Process: "p", Agent: "a", Runtime: "r",
			Options: []string{"o"}, Required: []string{"read"}, Allowed: []string{"read"}, Granted: []string{"read", "net"},
			Extra: []string{"net"}, Withheld: []string{"write"}}},
		Warnings: []check.Problem{{Source: check.Source{File: "/r/a/.agister/workflows/w.yaml", Line: 3, Layer: check.LayerProject},
			Place: "steps[0]", Message: "its plan grants \"net\""}},
	}
	if !reflect.DeepEqual(resolved, want) {
		t.Errorf("resolved\n got %+v\nwant %+v", resolved, want)
	}
	wantProblems := []check.Problem{{Source: check.Source{File: "/u/.agister", Layer: check.LayerHome}, Message: "the layer's folder does not exist"}}
	if got := c.Problems(); !reflect.DeepEqual(got, wantProblems) {
		t.Errorf("problems %+v, want %+v", got, wantProblems)
	}
}

// filesSpy is a spy of files: the entries and the error its test gives,
// whatever the folder, and the bytes of each file it gives.
type filesSpy struct {
	entries []files.Entry
	err     error
	bytes   map[string][]byte
}

func (s filesSpy) Entries(string) ([]files.Entry, error) { return slices.Clone(s.entries), s.err }

func (s filesSpy) Bytes(file string) ([]byte, error) {
	content, ok := s.bytes[file]
	if !ok {
		return nil, fs.ErrNotExist
	}
	return content, nil
}

// adapters.feature, "Layout's filesystem comes from files". A file's bytes
// are files'.
func TestLayoutsFilesystemComesFromFiles(t *testing.T) {
	t.Parallel()
	l, err := newLayoutFiles(filesSpy{
		entries: []files.Entry{{Name: "agents", Kind: files.Folder}, {Name: "service.toml", Kind: files.RegularFile}, {Name: "x", Kind: files.Other}},
		bytes:   map[string][]byte{"/u/.agister/service.toml": []byte("a = 1\n")},
	})
	if err != nil {
		t.Fatal(err)
	}
	entries, err := l.Entries("/u/.agister")
	if err != nil {
		t.Fatal(err)
	}
	want := []layout.Entry{{Name: "agents", Kind: layout.Folder}, {Name: "service.toml", Kind: layout.RegularFile}, {Name: "x", Kind: layout.Other}}
	if !slices.Equal(entries, want) {
		t.Errorf("entries %+v, want %+v", entries, want)
	}
	if got, err := l.Bytes("/u/.agister/service.toml"); err != nil || string(got) != "a = 1\n" {
		t.Errorf("bytes %q, %v; want %q", got, err, "a = 1\n")
	}
}

// adapters.feature, "Layout's worktree root comes from git".
func TestLayoutsWorktreeRootComesFromGit(t *testing.T) {
	t.Parallel()
	failed := errors.New("git rev-parse --show-toplevel in /r/a: exit status 128")
	cases := []struct {
		name string
		root string
		err  error
	}{
		{"the root /r", "/r", nil},
		{"none", "", nil},
		{"an error", "", failed},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			ctx := context.Background()
			git := &gitSpy{root: c.root, err: c.err, ctx: ctx}
			roots, err := newWorktreeRoot(ctx, git)
			if err != nil {
				t.Fatal(err)
			}
			root, err := roots.Root("/r/a")
			if root != c.root {
				t.Errorf("root %q, want %q", root, c.root)
			}
			switch {
			case c.err == nil && err != nil:
				t.Errorf("error %v, want none", err)
			case c.err != nil && (err == nil || errors.Unwrap(err) != c.err):
				t.Errorf("error %v, want %v, wrapped", err, c.err)
			}
			if want := []string{"/r/a"}; !slices.Equal(git.dirs, want) {
				t.Errorf("git is asked for %q, want %q", git.dirs, want)
			}
		})
	}
}

// adapters.feature, "A folder files does not find is one layout does not
// find".
func TestAFolderFilesDoesNotFindIsOneLayoutDoesNotFind(t *testing.T) {
	t.Parallel()
	l, err := newLayoutFiles(filesSpy{err: &fs.PathError{Op: "open", Path: "/r/.agister", Err: fs.ErrNotExist}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := l.Entries("/r/.agister"); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("error %v, want one that is, or wraps, fs.ErrNotExist", err)
	}
}

// Layout's snapshot is given to documents whole: each document's sources
// and its files' problems, and the blocks file.
func TestDocumentsAreGivenLayoutsSnapshot(t *testing.T) {
	t.Parallel()
	home := &layout.Source{Path: "/u/.agister/agents/a.toml", Bytes: []byte("a")}
	project := &layout.Source{Path: "/r/a/.agister/agents/a.toml", Bytes: []byte("b")}
	blocks := &layout.Source{Path: "/r/.agister/blocks.yaml", Bytes: []byte("c")}
	got := documentsSnapshot(layout.Snapshot{
		Documents: map[layout.Kind]map[string]layout.Document{
			layout.Agent: {"a": {Sources: layout.Sources{Home: home, Project: project}}},
			layout.Prompt: {"pr": {Problems: []layout.Problem{
				{Path: "/r/.agister/prompts/pr.txt", Err: layout.ExtensionError{Kind: layout.Prompt, Extension: ".md"}},
			}}},
		},
		Blocks: blocks,
	})
	want := documents.Snapshot{
		Documents: map[documents.Kind]map[string]documents.Document{
			documents.Agent: {"a": {Sources: documents.Sources{
				Home:    &documents.Source{Path: home.Path, Bytes: home.Bytes},
				Project: &documents.Source{Path: project.Path, Bytes: project.Bytes},
			}}},
			documents.Prompt: {"pr": {Problems: []documents.Problem{{Path: "/r/.agister/prompts/pr.txt", Message: `a prompt is a ".md" file`}}}},
		},
		Blocks: &documents.Source{Path: blocks.Path, Bytes: blocks.Bytes},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("documents' snapshot\n got %+v\nwant %+v", got, want)
	}
}

// A path's layer is that of the nearest layer folder holding it, and none
// for a path no layer folder holds.
func TestAPathsLayerIsTheNearestFoldersHoldingIt(t *testing.T) {
	t.Parallel()
	nested := layout.Folders{Home: "/r/.agister/home/.agister", Repository: "/r/.agister"}
	cases := []struct {
		folders layout.Folders
		path    string
		want    check.Layer
	}{
		{homeAndRepository(), "/u/.agister/agents/a.toml", check.LayerHome},
		{homeAndRepository(), "/r/.agister", check.LayerRepository},
		{homeAndRepository(), "/r/a/.agister/agents/a.toml", check.LayerProject},
		{homeAndRepository(), "/r/.agister-old/agents/a.toml", ""},
		{homeAndRepository(), "", ""},
		{nested, "/r/.agister/home/.agister/agents/a.toml", check.LayerHome},
		{nested, "/r/.agister/agents/a.toml", check.LayerRepository},
		{layout.Folders{Home: "/u/.agister"}, "/r/.agister/agents/a.toml", ""},
	}
	for _, c := range cases {
		if got := layerOf(c.folders, c.path); got != c.want {
			t.Errorf("the layer of %q in %+v is %q, want %q", c.path, c.folders, got, c.want)
		}
	}
}

// Each kind is the same kind in every part's words.
func TestEveryKindIsOneKindInEachPartsWords(t *testing.T) {
	t.Parallel()
	for _, k := range everyKind() {
		spelled := []string{string(k.check), string(k.resolve), string(k.documents), string(k.cli)}
		if k.layout != "" {
			spelled = append(spelled, string(k.layout))
		}
		for _, s := range spelled {
			if s != string(k.check) {
				t.Errorf("%+v spells the kind %q as %q", k, k.check, s)
			}
		}
		if kindOf(k.resolve) != k || checkKind(k.check) != k || documentsKind(k.documents) != k || cliKind(k.cli) != k {
			t.Errorf("%+v is not found by each of its words", k)
		}
	}
}
