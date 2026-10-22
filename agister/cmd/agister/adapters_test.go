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

	"github.com/igor1309/ai-labs/agister/core/workflow"
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
		{documents.Reference{Root: documents.ReadsOutputs, Name: "a", Field: "stdout", Path: []string{"head"}},
			resolve.Read{Root: resolve.RootOutputs, Name: "a", Field: "stdout"}},
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
				Steps:   given([]documents.Field[documents.Item]{step("s", file, 3, "steps[0]")}, file, 2, "steps"),
				Outputs: given([]documents.Field[documents.Binding]{reading("o", c.reads, file, 5, "outputs.o")}, file, 4, "outputs"),
			}}
			workflow, problems := sourceOf(t, spy, layout.Snapshot{}).Workflow("w")
			if len(problems) > 0 {
				t.Fatalf("problems %+v, want none", problems)
			}
			want := c.read
			want.Origin = at(file, 5, "outputs.o")
			if got := workflow.Outputs[0].From; got == nil || !reflect.DeepEqual(*got, want) {
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
			given(documents.Item{Name: "s", Process: given("p", file, 3, "steps[0].process"), Agent: given("a", file, 4, "steps[0].agent")}, file, 3, "steps[0]"),
		}, file, 2, "steps"),
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

// Each value's place is the one documents gives, whatever it spells: the
// spy gives places no position in a definition spells, so a place the
// source built would differ.
func TestEachValuesPlaceIsTheOneDocumentsGives(t *testing.T) {
	t.Parallel()
	const file = "/r/.agister/workflows/w.yaml"
	from := func(place string) documents.Reference {
		return documents.Reference{Root: documents.ReadsParam, Name: place}
	}
	arm := given(documents.Item{
		Name:    "x",
		If:      given(documents.Condition{Operator: "present", Reads: given(from("operand"), file, 5, "the operand's")}, file, 5, "the if's"),
		Process: given("p", file, 6, "the process's"),
		Agent:   given("a", file, 7, "the agent's"),
		Session: given(documents.Reference{Root: documents.ReadsSession, Name: "s"}, file, 8, "the session's"),
		Inputs:  given([]documents.Field[documents.Binding]{reading("i", from("input"), file, 9, "the input's")}, file, 9, "the inputs'"),
	}, file, 4, "the arm's")
	spy := newDocumentsSpy(t)
	spy.workflows["w"] = typed[documents.WorkflowDefinition]{value: documents.WorkflowDefinition{
		Name: "w",
		Steps: given([]documents.Field[documents.Item]{
			given(documents.Item{Name: "b", Branch: given([]documents.Field[documents.Item]{
				arm, step("y", file, 10, "the other arm's"),
			}, file, 3, "the branch's arms'")}, file, 2, "the branch's"),
		}, file, 1, "the steps'"),
		Outputs: given([]documents.Field[documents.Binding]{reading("o", from("output"), file, 12, "the output's")}, file, 11, "the outputs'"),
	}}
	spy.processes["p"] = typed[documents.ProcessDefinition]{value: documents.ProcessDefinition{
		Name:     "p",
		Guidance: given([]documents.Field[string]{given("g", file, 14, "the guidance's")}, file, 13, "the guidances'"),
		Workspace: given(documents.Workspace{
			Revision: given(documents.Reference{Root: documents.ReadsInput, Name: "r"}, file, 16, "the revision's"),
		}, file, 15, "the workspace's"),
	}}
	spy.blocks = []documents.Field[documents.Block]{given(documents.Block{Kind: documents.Agent, Name: "a"}, file, 17, "the block's")}
	s := sourceOf(t, spy, layout.Snapshot{})
	workflow, problems := s.Workflow("w")
	if len(problems) > 0 {
		t.Fatalf("problems %+v, want none", problems)
	}
	process, problems := s.Process("p")
	if len(problems) > 0 {
		t.Fatalf("problems %+v, want none", problems)
	}
	if len(workflow.Steps) != 1 || len(workflow.Steps[0].Branch) != 2 || len(workflow.Steps[0].Branch[0].If.Reads) != 1 ||
		len(workflow.Steps[0].Branch[0].Inputs) != 1 || len(workflow.Outputs) != 1 || len(process.Guidance) != 1 || process.Revision == nil {
		t.Fatalf("the workflow %+v and the process %+v, want each value given", workflow, process)
	}
	branch, x := workflow.Steps[0], workflow.Steps[0].Branch[0]
	got := []resolve.Origin{
		branch.Origin, x.Origin, x.If.Reads[0].Origin, x.Process.Origin, x.Agent.Origin, x.Session.Origin,
		x.Inputs[0].Origin, x.Inputs[0].From.Origin, workflow.Steps[0].Branch[1].Origin,
		workflow.Outputs[0].Origin, workflow.Outputs[0].From.Origin,
		process.Guidance[0].Origin, process.Revision.Origin, s.Blocks()[0].Origin,
	}
	want := []resolve.Origin{
		at(file, 2, "the branch's"), at(file, 4, "the arm's"), at(file, 5, "the operand's"), at(file, 6, "the process's"),
		at(file, 7, "the agent's"), at(file, 8, "the session's"), at(file, 9, "the input's"), at(file, 9, "the input's"),
		at(file, 10, "the other arm's"), at(file, 12, "the output's"), at(file, 12, "the output's"),
		at(file, 14, "the guidance's"), at(file, 16, "the revision's"), at(file, 17, "the block's"),
	}
	if !slices.Equal(got, want) {
		t.Errorf("origins\n got %+v\nwant %+v", got, want)
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
	checker, err := newChecker("/u/.agister", "/r", filesystem, rootSpy{root: "/r"}, wrappersSpy{"bash/1": {Message: true}})
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

// capabilities are what a runtime can do, each a field of resolve's facts
// and of every wrapper's, by the same name.
func capabilities() []string {
	return []string{"Schema", "Session", "Skills", "Model", "ToolCalls", "ToolCommands"}
}

// withCapabilities is facts with each of capabilities set.
func withCapabilities[F any](facts F, capabilities []string) F {
	for _, capability := range capabilities {
		reflect.ValueOf(&facts).Elem().FieldByName(capability).SetBool(true)
	}
	return facts
}

// Every capability of resolve's facts is among capabilities.
func TestCapabilitiesAreEveryOneOfResolvesFacts(t *testing.T) {
	t.Parallel()
	var fields []string
	facts := reflect.TypeFor[resolve.Facts]()
	for i := range facts.NumField() {
		if field := facts.Field(i); field.Type.Kind() == reflect.Bool {
			fields = append(fields, field.Name)
		}
	}
	want := append(capabilities(), "Message")
	if !slices.Equal(fields, want) {
		t.Errorf("resolve's capabilities %q, want %q", fields, want)
	}
}

// Message support is derived from each wrapper's input delivery, rather
// than from its name or its other capabilities.
func TestMessageCapabilityFollowsTheWrappersInputDelivery(t *testing.T) {
	t.Parallel()
	for _, message := range []bool{false, true} {
		t.Run(fmt.Sprint(message), func(t *testing.T) {
			t.Parallel()
			claude, codexInput, piInput, bashInput := claudecode.InEnvironment, codex.InEnvironment, pi.InEnvironment, bash.InEnvironment
			if message {
				claude, codexInput, piInput, bashInput = claudecode.InMessage, codex.InMessage, pi.InMessage, bash.InMessage
			}
			for _, wrapper := range []wrapperFacts{
				claudeCodeFacts(claudeCodeSpy{claudecode.Facts{Inputs: claude}}),
				codexFacts(codexSpy{codex.Facts{Inputs: codexInput}}),
				piFacts(piSpy{pi.Facts{Inputs: piInput}}),
				bashFacts(bashSpy{bash.Facts{Inputs: bashInput}}),
			} {
				if _, got := wrapper(); !reflect.DeepEqual(got, resolve.Facts{Message: message}) {
					t.Errorf("facts %+v, want only Message %t", got, message)
				}
			}
		})
	}
}

// adapters.feature, "The facts by contract". For each wrapper, each
// capability alone, or none, with efforts no other wrapper gives: every
// other wrapper gives every capability and efforts of its own, so an
// answer that drops or crosses a capability, or is another wrapper's,
// differs.
func TestTheFactsByContract(t *testing.T) {
	t.Parallel()
	// wrappers are each runtime wrapper's contract, and its facts as a spy
	// of it gives them: the capabilities and the efforts.
	wrappers := []struct {
		contract string
		facts    func(capabilities, efforts []string) wrapperFacts
	}{
		{"claude-code/3", func(capabilities, efforts []string) wrapperFacts {
			return claudeCodeFacts(claudeCodeSpy{withCapabilities(claudecode.Facts{Contract: "claude-code/3", Efforts: efforts}, capabilities)})
		}},
		{"codex/2", func(capabilities, efforts []string) wrapperFacts {
			return codexFacts(codexSpy{withCapabilities(codex.Facts{Contract: "codex/2", Efforts: efforts}, capabilities)})
		}},
		{"pi/1", func(capabilities, efforts []string) wrapperFacts {
			return piFacts(piSpy{withCapabilities(pi.Facts{Contract: "pi/1", Efforts: efforts}, capabilities)})
		}},
		{"bash/1", func(capabilities, efforts []string) wrapperFacts {
			return bashFacts(bashSpy{withCapabilities(bash.Facts{Contract: "bash/1", Efforts: efforts}, capabilities)})
		}},
	}
	// contractsOf are the wrappers' facts, each with every capability and
	// efforts of its own, but that of contract, which gives facts.
	contractsOf := func(t *testing.T, contract string, facts wrapperFacts) *contracts {
		t.Helper()
		var given []wrapperFacts
		for _, w := range wrappers {
			if w.contract == contract {
				given = append(given, facts)
				continue
			}
			given = append(given, w.facts(capabilities(), []string{w.contract + "'s effort"}))
		}
		c, err := newContracts(given...)
		if err != nil {
			t.Fatal(err)
		}
		return c
	}
	for _, w := range wrappers {
		alone := [][]string{nil}
		for _, capability := range capabilities() {
			alone = append(alone, []string{capability})
		}
		for _, capability := range alone {
			t.Run(fmt.Sprintf("%s %q", w.contract, capability), func(t *testing.T) {
				t.Parallel()
				efforts := []string{"only " + w.contract + "'s"}
				facts, taken := contractsOf(t, w.contract, w.facts(capability, efforts)).Facts(w.contract)
				want := withCapabilities(resolve.Facts{Efforts: efforts}, capability)
				if !reflect.DeepEqual(facts, want) || !taken {
					t.Errorf("facts %+v, %t; want %+v, true", facts, taken, want)
				}
			})
		}
	}
	t.Run("other/9", func(t *testing.T) {
		t.Parallel()
		if facts, taken := contractsOf(t, "", nil).Facts("other/9"); !reflect.DeepEqual(facts, resolve.Facts{}) || taken {
			t.Errorf("facts %+v, %t; want none, false", facts, taken)
		}
	})
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

// filesSpy is a spy of files: the entries of each folder its test gives,
// by folder, and the bytes of each file, by path; a folder or a file it is
// not given does not exist. It keeps each folder and file it is asked.
type filesSpy struct {
	entries map[string][]files.Entry
	bytes   map[string][]byte
	folders []string
	files   []string
}

func (s *filesSpy) Entries(folder string) ([]files.Entry, error) {
	s.folders = append(s.folders, folder)
	entries, ok := s.entries[folder]
	if !ok {
		return nil, &fs.PathError{Op: "open", Path: folder, Err: fs.ErrNotExist}
	}
	return slices.Clone(entries), nil
}

func (s *filesSpy) Bytes(file string) ([]byte, error) {
	s.files = append(s.files, file)
	content, ok := s.bytes[file]
	if !ok {
		return nil, &fs.PathError{Op: "open", Path: file, Err: fs.ErrNotExist}
	}
	return slices.Clone(content), nil
}

// adapters.feature, "Layout's filesystem comes from files". Each folder's
// entries and each file's bytes are files' for that folder or file.
func TestLayoutsFilesystemComesFromFiles(t *testing.T) {
	t.Parallel()
	spy := &filesSpy{
		entries: map[string][]files.Entry{
			"/u/.agister": {{Name: "agents", Kind: files.Folder}, {Name: "service.toml", Kind: files.RegularFile}, {Name: "x", Kind: files.Other}},
			"/r/.agister": {{Name: "blocks.yaml", Kind: files.RegularFile}},
		},
		bytes: map[string][]byte{
			"/u/.agister/service.toml": []byte("a = 1\n"),
			"/r/.agister/blocks.yaml":  []byte("[]\n"),
		},
	}
	l, err := newLayoutFiles(spy)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		folder string
		want   []layout.Entry
	}{
		{"/u/.agister", []layout.Entry{{Name: "agents", Kind: layout.Folder}, {Name: "service.toml", Kind: layout.RegularFile}, {Name: "x", Kind: layout.Other}}},
		{"/r/.agister", []layout.Entry{{Name: "blocks.yaml", Kind: layout.RegularFile}}},
	} {
		if entries, err := l.Entries(c.folder); err != nil || !slices.Equal(entries, c.want) {
			t.Errorf("the entries of %s %+v, %v; want %+v", c.folder, entries, err, c.want)
		}
	}
	for file, want := range map[string]string{"/u/.agister/service.toml": "a = 1\n", "/r/.agister/blocks.yaml": "[]\n"} {
		if got, err := l.Bytes(file); err != nil || string(got) != want {
			t.Errorf("the bytes of %s %q, %v; want %q", file, got, err, want)
		}
	}
	if want := []string{"/u/.agister", "/r/.agister"}; !slices.Equal(spy.folders, want) {
		t.Errorf("files is asked the folders %q, want %q", spy.folders, want)
	}
	slices.Sort(spy.files)
	if want := []string{"/r/.agister/blocks.yaml", "/u/.agister/service.toml"}; !slices.Equal(spy.files, want) {
		t.Errorf("files is asked the files %q, want %q", spy.files, want)
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
// find", beside one files finds. A file files does not find is one layout
// does not find too.
func TestAFolderFilesDoesNotFindIsOneLayoutDoesNotFind(t *testing.T) {
	t.Parallel()
	spy := &filesSpy{entries: map[string][]files.Entry{"/u/.agister": {{Name: "agents", Kind: files.Folder}}}}
	l, err := newLayoutFiles(spy)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := l.Entries("/r/.agister"); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("error %v, want one that is, or wraps, fs.ErrNotExist", err)
	}
	if _, err := l.Bytes("/r/.agister/blocks.yaml"); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("error %v, want one that is, or wraps, fs.ErrNotExist", err)
	}
	if want := []string{"/r/.agister"}; !slices.Equal(spy.folders, want) {
		t.Errorf("files is asked the folders %q, want %q", spy.folders, want)
	}
	if want := []string{"/r/.agister/blocks.yaml"}; !slices.Equal(spy.files, want) {
		t.Errorf("files is asked the files %q, want %q", spy.files, want)
	}
}

// Layout's snapshot is given to documents whole: each document's sources
// and its files' problems, and the blocks file.
func TestDocumentsAreGivenLayoutsSnapshot(t *testing.T) {
	t.Parallel()
	home := &layout.Source{Path: "/u/.agister/agents/a.toml", Bytes: []byte("a")}
	project := &layout.Source{Path: "/r/a/.agister/agents/a.toml", Bytes: []byte("b")}
	blocks := &layout.Source{Path: "/r/.agister/blocks.yaml", Bytes: []byte("c")}
	budget := &layout.Source{Path: "/u/.agister/budget.yaml", Bytes: []byte("daily: {cost: 20}")}
	got := documentsSnapshot(layout.Snapshot{
		Documents: map[layout.Kind]map[string]layout.Document{
			layout.Agent: {"a": {Sources: layout.Sources{Home: home, Project: project}}},
			layout.Prompt: {"pr": {Problems: []layout.Problem{
				{Path: "/r/.agister/prompts/pr.txt", Err: layout.ExtensionError{Kind: layout.Prompt, Extension: ".md"}},
			}}},
		},
		Blocks: blocks,
		Budget: budget,
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
		Budget: &documents.Source{Path: budget.Path, Bytes: budget.Bytes},
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

// Execution bindings come straight from checked documents, including the
// nested output path that resolve does not need for its checks.
func TestWorkflowBindingsReadTheCheckedDocuments(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name  string
		value documents.Value
		want  workflow.Value
	}{
		{"literal", documents.Value{Text: "hello"}, workflow.Value{Text: "hello"}},
		{"param", documents.Value{From: documents.Reference{Root: documents.ReadsParam, Name: "p"}}, workflow.Value{Reads: &workflow.Reference{Of: workflow.Params, Name: "p"}}},
		{"input", documents.Value{From: documents.Reference{Root: documents.ReadsInput, Name: "i"}}, workflow.Value{Reads: &workflow.Reference{Of: workflow.Inputs, Name: "i"}}},
		{"whole output", documents.Value{From: documents.Reference{Root: documents.ReadsOutputs, Name: "a"}}, workflow.Value{Reads: &workflow.Reference{Of: workflow.Outputs, Name: "a"}}},
		{"nested output", documents.Value{From: documents.Reference{Root: documents.ReadsOutputs, Name: "a", Field: "stdout", Path: []string{"head"}}}, workflow.Value{Reads: &workflow.Reference{Of: workflow.Outputs, Name: "a", Field: "stdout", Path: []string{"head"}}}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got, err := documentWorkflowBindings([]documents.Field[documents.Binding]{{Value: documents.Binding{Name: "x", Value: c.value}}})
			if err != nil {
				t.Fatal(err)
			}
			if want := []workflow.Binding{{Name: "x", Value: c.want}}; !reflect.DeepEqual(got, want) {
				t.Errorf("bindings %+v, want %+v", got, want)
			}
		})
	}
}
