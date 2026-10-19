package documents_test

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/gokit/tree"
)

const (
	// validProcess is the process of process.feature's "A process's
	// fields".
	validProcess = `schema: agister.process/v1alpha1
prompt: review
instruction: Review the change.
guidance: [go-architecture]
skills: [skill:go]
params:
  base: {default: origin/trunk}
  goal: {}
inputs:
  base: {source: git.revision, rev: {from: params.base}, remote: origin}
  goal: {source: file, path: {from: params.goal}, form: [goal]}
environment:
  MODE: strict
  BASE: {from: inputs.base}
permissions: {require: [repository.read], allow: [repository.read, network]}
workspace: {access: read-only, revision: {from: inputs.base}, clean: true}
limits:
  time: 20m
  cost: 2.5
  stale: {repeated_tool_calls: 5, tool_command: 8m, no_event: 10m}
recovery: {resumes: 1, instruction: Go on.}
output: {schema: review-result}
`
)

// typeProcess is the process a typed from bytes, decoded in YAML as its
// home file.
func typeProcess(t *testing.T, bytes string) (documents.ProcessDefinition, []documents.Problem) {
	t.Helper()
	root, decoded := tree.Decode(tree.YAML, []byte(bytes), homeProcess)
	if len(decoded) > 0 {
		t.Fatalf("%q does not decode: %v", bytes, decoded)
	}
	return documents.TypeProcess("a", root)
}

func assertProcess(t *testing.T, got, want documents.ProcessDefinition) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("process\n got %+v\nwant %+v", got, want)
	}
}

func assertNoProcess(t *testing.T, got documents.ProcessDefinition) {
	t.Helper()
	if !reflect.DeepEqual(got, documents.ProcessDefinition{}) {
		t.Errorf("a process %+v, want none", got)
	}
}

// inHomeProcess is a problem at place of the process a's home file, on
// line.
func inHomeProcess(line int, place, message string) documents.Problem {
	return documents.Problem{Path: homeProcess, Line: line, Place: place, Message: message}
}

// given is value, given by the process a's home file, on line, at place.
func given[T any](value T, line int, place string) documents.Field[T] {
	return documents.Field[T]{Value: value, Origin: documents.Origin{Path: homeProcess, Line: line, Place: place}, Given: true}
}

// validProcessDefinition is validProcess typed: every field it gives, each
// with its value and the origin of its home file, on its line, at its
// place; a name the name alone, and a reference what it reads.
func validProcessDefinition() documents.ProcessDefinition {
	return documents.ProcessDefinition{
		Name:        "a",
		Prompt:      given("review", 2, "prompt"),
		Instruction: given("Review the change.", 3, "instruction"),
		Guidance:    given([]documents.Field[string]{given("go-architecture", 4, "guidance[0]")}, 4, "guidance"),
		Skills:      given([]documents.Field[string]{given("go", 5, "skills[0]")}, 5, "skills"),
		Params: given([]documents.Field[documents.Param]{
			given(documents.Param{Name: "base", Default: given("origin/trunk", 7, "params.base.default")}, 7, "params.base"),
			given(documents.Param{Name: "goal"}, 8, "params.goal"),
		}, 6, "params"),
		Inputs: given([]documents.Field[documents.Input]{
			given(documents.Input{Name: "base", Source: given("git.revision", 10, "inputs.base.source"), Arguments: []documents.Field[documents.Binding]{
				given(documents.Binding{Name: "remote", Value: documents.Value{Text: "origin"}}, 10, "inputs.base.remote"),
				given(documents.Binding{Name: "rev", Value: documents.Value{From: param("base")}}, 10, "inputs.base.rev"),
			}}, 10, "inputs.base"),
			given(documents.Input{Name: "goal", Source: given("file", 11, "inputs.goal.source"),
				Form: given([]documents.Field[string]{given("goal", 11, "inputs.goal.form[0]")}, 11, "inputs.goal.form"),
				Arguments: []documents.Field[documents.Binding]{
					given(documents.Binding{Name: "path", Value: documents.Value{From: param("goal")}}, 11, "inputs.goal.path"),
				}}, 11, "inputs.goal"),
		}, 9, "inputs"),
		Environment: given([]documents.Field[documents.Binding]{
			// The call records variables in their process's declaration order.
			given(documents.Binding{Name: "MODE", Value: documents.Value{Text: "strict"}}, 13, "environment.MODE"),
			given(documents.Binding{Name: "BASE", Value: documents.Value{From: input("base")}}, 14, "environment.BASE"),
		}, 12, "environment"),
		Permissions: given(documents.Permissions{
			Require: given([]string{"repository.read"}, 15, "permissions.require"),
			Allow:   given([]string{"repository.read", "network"}, 15, "permissions.allow"),
		}, 15, "permissions"),
		Workspace: given(documents.Workspace{
			Access:   given("read-only", 16, "workspace.access"),
			Revision: given(input("base"), 16, "workspace.revision"),
			Clean:    given(true, 16, "workspace.clean"),
		}, 16, "workspace"),
		Limits: given(documents.Limits{
			Time: given(20*time.Minute, 18, "limits.time"),
			Cost: given(2.5, 19, "limits.cost"),
			Stale: given(documents.Stale{
				RepeatedToolCalls: given(5, 20, "limits.stale.repeated_tool_calls"),
				ToolCommand:       given(8*time.Minute, 20, "limits.stale.tool_command"),
				NoEvent:           given(10*time.Minute, 20, "limits.stale.no_event"),
			}, 20, "limits.stale"),
		}, 17, "limits"),
		Recovery: given(documents.Recovery{Resumes: given(1, 21, "recovery.resumes"), Instruction: given("Go on.", 21, "recovery.instruction")}, 21, "recovery"),
		Output:   given(documents.Output{Schema: given("review-result", 22, "output.schema")}, 22, "output"),
	}
}

// process.feature, "A process's fields".
func TestAProcesssFields(t *testing.T) {
	t.Parallel()
	d := documents.New(snapshotOf(map[string]documents.Document{"a": {Sources: documents.Sources{Home: source(homeProcess, validProcess)}}}))
	got, problems := d.Process("a")
	assertProblems(t, problems, nil)
	assertProcess(t, got, validProcessDefinition())
}

// process.feature, "A process's fields each hold what they name": a
// process with a field's problem, asked of documents, is no process and
// has the problem; one whose tree has problems has its tree's.
func TestDocumentsGivesAProcesssProblems(t *testing.T) {
	t.Parallel()
	d := documents.New(snapshotOf(map[string]documents.Document{
		"a": {Sources: documents.Sources{Home: source(homeProcess, strings.Replace(validProcess, "cost: 2.5", "cost: 0", 1))}},
		"b": {Sources: documents.Sources{Home: source("/home/.agister/processes/b.yaml", "x: [1")}},
	}))
	got, problems := d.Process("a")
	assertNoProcess(t, got)
	assertProblems(t, problems, []documents.Problem{inHomeProcess(19, "limits.cost", "it is more than zero")})
	_, want := d.Tree(documents.Process, "b")
	if len(want) == 0 {
		t.Fatal("the process b's tree has no problem")
	}
	got, problems = d.Process("b")
	assertNoProcess(t, got)
	assertProblems(t, problems, want)
}

// A process given is the caller's own: changing any slice of it changes
// nothing the documents hold, and the next call gives the process as typed.
func TestAProcessGivenIsTheCallersOwn(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		change func(*documents.ProcessDefinition)
	}{
		{"its guidance", func(p *documents.ProcessDefinition) { p.Guidance.Value[0].Value = "x" }},
		{"its skills", func(p *documents.ProcessDefinition) { p.Skills.Value[0].Value = "x" }},
		{"its params", func(p *documents.ProcessDefinition) { p.Params.Value[0].Value.Name = "x" }},
		{"its inputs", func(p *documents.ProcessDefinition) { p.Inputs.Value[0].Value.Name = "x" }},
		{"an input's form", func(p *documents.ProcessDefinition) { p.Inputs.Value[1].Value.Form.Value[0].Value = "x" }},
		{"an input's arguments", func(p *documents.ProcessDefinition) { p.Inputs.Value[0].Value.Arguments[0].Value.Name = "x" }},
		{"its environment", func(p *documents.ProcessDefinition) { p.Environment.Value[0].Value.Name = "x" }},
		{"the permissions it requires", func(p *documents.ProcessDefinition) { p.Permissions.Value.Require.Value[0] = "x" }},
		{"the permissions it allows", func(p *documents.ProcessDefinition) { p.Permissions.Value.Allow.Value[0] = "x" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			d := documents.New(snapshotOf(map[string]documents.Document{"a": {Sources: documents.Sources{Home: source(homeProcess, validProcess)}}}))
			gotten, _ := d.Process("a")
			c.change(&gotten)
			got, problems := d.Process("a")
			assertProblems(t, problems, nil)
			assertProcess(t, got, validProcessDefinition())
		})
	}
}

// process.feature, "A process needs only its schema".
func TestAProcessNeedsOnlyItsSchema(t *testing.T) {
	t.Parallel()
	got, problems := typeProcess(t, "schema: agister.process/v1alpha1\n")
	assertProblems(t, problems, nil)
	assertProcess(t, got, documents.ProcessDefinition{Name: "a"})
}

// process.feature, "A process's fields each hold what they name": each
// fault, in a valid process, is the process's one problem.
func TestAProcesssFieldsEachHoldWhatTheyName(t *testing.T) {
	t.Parallel()
	cases := []struct {
		fault    string
		old, new string
		want     documents.Problem
	}{
		{"the prompt agent:x", "prompt: review", "prompt: agent:x", inHomeProcess(2, "prompt", "it names a prompt")},
		{"the input x: {path: a}", "  goal: {source: file", "  x: {path: a}\n  goal: {source: file", missing("inputs.x.source")},
		{"the form [brief:goal, agent:x]", "form: [goal]", "form: [brief:goal, agent:x]",
			inHomeProcess(11, "inputs.goal.form[1]", "it names a brief")},
		{"the rev {from: steps.x.outputs.y}", "rev: {from: params.base}", "rev: {from: steps.x.outputs.y}",
			inHomeProcess(10, "inputs.base.rev", "it reads params.<name> or inputs.<name>")},
		{"the variable MODE: [a]", "MODE: strict", "MODE: [a]", inHomeProcess(13, "environment.MODE", "it is a string, or a reference")},
		{"the access write", "access: read-only", "access: write", inHomeProcess(16, "workspace.access", `it is "read-only" or "read-write"`)},
		{"the revision {from: params.base}", "revision: {from: inputs.base}", "revision: {from: params.base}",
			inHomeProcess(16, "workspace.revision", "it reads inputs.<name>")},
		{"the time soon", "time: 20m", "time: soon", inHomeProcess(18, "limits.time", `it is a duration, as "5m"`)},
		{"the time 0s", "time: 20m", "time: 0s", inHomeProcess(18, "limits.time", "it is more than zero")},
		{"the cost 0", "cost: 2.5", "cost: 0", inHomeProcess(19, "limits.cost", "it is more than zero")},
		{"0 repeated tool calls", "repeated_tool_calls: 5", "repeated_tool_calls: 0",
			inHomeProcess(20, "limits.stale.repeated_tool_calls", "it is at least 1")},
		{"a recovery of 0 resumes", "resumes: 1", "resumes: 0", inHomeProcess(21, "recovery.resumes", "it is at least 1")},
		{"a recovery with no instruction", ", instruction: Go on.}", "}", missing("recovery.instruction")},
		{"an output with no schema", "output: {schema: review-result}", "output: {}", missing("output.schema")},
	}
	for _, c := range cases {
		t.Run(c.fault, func(t *testing.T) {
			t.Parallel()
			if !strings.Contains(validProcess, c.old) {
				t.Fatalf("the valid process has no %q", c.old)
			}
			got, problems := typeProcess(t, strings.Replace(validProcess, c.old, c.new, 1))
			assertNoProcess(t, got)
			assertProblems(t, problems, []documents.Problem{c.want})
		})
	}
}

// Every problem of a process's fields is reported, nested or not, in the
// order its fields are read: each bad item of a list, each bad input and
// variable, a value of the wrong type for each typing a process alone
// reads, and the fields no kind knows of a reference after its own.
func TestEveryProcessFieldProblemIsReported(t *testing.T) {
	t.Parallel()
	got, problems := typeProcess(t, `schema: agister.process/v1alpha1
guidance: [a, agent:c, b, prompt:d, schema:e]
inputs:
  a: {source: file, path: {}, form: [agent:x, b, schema:y]}
  b: {rev: {from: inputs.a, at: 1}}
environment: {A: 1, B: {from: state.x}}
limits: {cost: cheap, stale: {repeated_tool_calls: 1.5}}
recovery: {resumes: 0}
colour: red
`)
	assertNoProcess(t, got)
	assertProblems(t, problems, []documents.Problem{
		inHomeProcess(2, "guidance[1]", "it names a prompt"),
		inHomeProcess(2, "guidance[4]", "it names a prompt"),
		inHomeProcess(4, "inputs.a.form[0]", "it names a brief"),
		inHomeProcess(4, "inputs.a.form[2]", "it names a brief"),
		missing("inputs.a.path.from"),
		missing("inputs.b.source"),
		inHomeProcess(5, "inputs.b.rev.at", "the field is not known"),
		inHomeProcess(6, "environment.A", "it is a string, or a reference"),
		inHomeProcess(6, "environment.B", "it reads params.<name> or inputs.<name>"),
		inHomeProcess(7, "limits.cost", "it is a number, not a string"),
		inHomeProcess(7, "limits.stale.repeated_tool_calls", "it is an integer, not a number"),
		inHomeProcess(8, "recovery.resumes", "it is at least 1"),
		missing("recovery.instruction"),
		inHomeProcess(9, "colour", "the field is not known"),
	})
}
