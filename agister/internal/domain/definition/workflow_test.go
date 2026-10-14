package definition_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/document"
)

const workflowText = `schema: agister.workflow/v1alpha1
name: w
type: workflow
input:
  params:
    candidate: {default: HEAD}
  values:
    candidate: {source: git.revision, rev: "${param.candidate}"}
fan_out:
  - {node: zeta, uses: process:z, agent: codex-sol-61}
  - {node: alpha, uses: process:a, agent: pi-m3}
join: {node: merge, uses: process:j, agent: claude-opus}
`

// Nodes keep their declaration order, which the collection follows.
func TestParseWorkflowKeepsDeclarationOrder(t *testing.T) {
	t.Parallel()
	workflow, err := definition.ParseWorkflow(doc(document.KindWorkflow, "w", workflowText))
	if err != nil {
		t.Fatal(err)
	}
	want := []definition.Node{{Name: "zeta", Process: "z", Agent: "codex-sol-61"}, {Name: "alpha", Process: "a", Agent: "pi-m3"}, {Name: "merge", Process: "j", Agent: "claude-opus"}}
	if !reflect.DeepEqual(workflow.Nodes(), want) || workflow.Join != want[2] {
		t.Fatalf("nodes = %+v, join %+v", workflow.Nodes(), workflow.Join)
	}
	if len(workflow.Params) != 1 || len(workflow.Values) != 1 || workflow.Values[0].Source != "git.revision" {
		t.Fatalf("inputs = %+v %+v", workflow.Params, workflow.Values)
	}
}

// Every node names the agent its call runs on (ADR-030 rule 5), a fan-out
// node and the join alike: one that names none is a problem of the
// workflow, and so is an agent that is no name.
func TestEveryNodeNamesItsAgent(t *testing.T) {
	t.Parallel()
	for node, problem := range map[string]string{
		"{node: zeta, uses: process:z, agent: codex-sol-61}": "fan_out[0].agent: is required",
		"{node: alpha, uses: process:a, agent: pi-m3}":       "fan_out[1].agent: is required",
		"{node: merge, uses: process:j, agent: claude-opus}": "join.agent: is required",
	} {
		without := node[:strings.Index(node, ", agent:")] + "}"
		_, err := definition.ParseWorkflow(doc(document.KindWorkflow, "w", strings.Replace(workflowText, node, without, 1)))
		var invalid *document.InvalidError
		if !errors.As(err, &invalid) || !reflect.DeepEqual(invalid.Messages(), []string{problem}) {
			t.Errorf("%s: err = %v, want only %q", without, err, problem)
		}
	}
	for agent, problem := range map[string]string{
		"agent:claude-opus": `fan_out[1].agent: must be an agent's name, not "agent:claude-opus"`,
		"Claude":            `fan_out[1].agent: must be an agent's name, not "Claude"`,
		"''":                "fan_out[1].agent: must not be empty",
		"[claude-opus]":     "fan_out[1].agent: must be a scalar",
	} {
		_, err := definition.ParseWorkflow(doc(document.KindWorkflow, "w", strings.Replace(workflowText, "agent: pi-m3", "agent: "+agent, 1)))
		var invalid *document.InvalidError
		if !errors.As(err, &invalid) || !reflect.DeepEqual(invalid.Messages(), []string{problem}) {
			t.Errorf("agent: %s: err = %v, want only %q", agent, err, problem)
		}
	}
}

const callText = `schema: agister.workflow/v1alpha1
name: c
type: workflow
call: {node: implement, uses: process:implement, agent: codex-sol-61}
`

// ADR-030 rule 6: a workflow may be one call, its only node, which names
// its agent; it declares no inputs, fan-out or join of its own.
func TestAWorkflowMayBeOneCall(t *testing.T) {
	t.Parallel()
	workflow, err := definition.ParseWorkflow(doc(document.KindWorkflow, "c", callText))
	if err != nil {
		t.Fatal(err)
	}
	want := definition.Node{Name: "implement", Process: "implement", Agent: "codex-sol-61"}
	if workflow.Call == nil || *workflow.Call != want || !reflect.DeepEqual(workflow.Nodes(), []definition.Node{want}) {
		t.Fatalf("call = %+v, nodes %+v, want %+v alone", workflow.Call, workflow.Nodes(), want)
	}
	if workflow.FanOut != nil || workflow.Join != (definition.Node{}) || workflow.Params != nil || workflow.Values != nil {
		t.Fatalf("workflow = %+v, want the call alone", workflow)
	}
	for name, c := range map[string]struct{ text, want string }{
		"no agent":     {strings.Replace(callText, ", agent: codex-sol-61", "", 1), "call.agent: is required"},
		"a bad agent":  {strings.Replace(callText, "agent: codex-sol-61", "agent: agent:codex-sol-61", 1), `call.agent: must be an agent's name, not "agent:codex-sol-61"`},
		"no process":   {strings.Replace(callText, "uses: process:implement, ", "", 1), "call.uses: is required"},
		"an input":     {callText + "input: {params: {brief: {}}}\n", "input: a workflow with call has no input (ADR-030 rule 6)"},
		"a fan-out":    {callText + "fan_out:\n  - {node: zeta, uses: process:z, agent: codex-sol-61}\n", "fan_out: a workflow with call has no fan_out (ADR-030 rule 6)"},
		"a join":       {callText + "join: {node: merge, uses: process:j, agent: claude-opus}\n", "join: a workflow with call has no join (ADR-030 rule 6)"},
		"not a node":   {strings.Replace(callText, "{node: implement, uses: process:implement, agent: codex-sol-61}", "process:implement", 1), "call: must be a mapping"},
		"other fields": {strings.Replace(callText, "agent: codex-sol-61", "agent: codex-sol-61, timeout: 1h", 1), "call.timeout: unknown field"},
	} {
		_, err := definition.ParseWorkflow(doc(document.KindWorkflow, "c", c.text))
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: err = %v, want %q", name, err, c.want)
		}
	}
}

func TestParseWorkflowProblems(t *testing.T) {
	t.Parallel()
	for name, tc := range map[string]struct{ text, want string }{
		"wrong type":          {strings.Replace(workflowText, "type: workflow", "type: process", 1), `type: must be "workflow"`},
		"not a process":       {strings.Replace(workflowText, "uses: process:z", "uses: agent:z", 1), `fan_out[0].uses: must be "process:<name>"`},
		"invalid node name":   {strings.Replace(workflowText, "node: zeta", "node: Zeta", 1), `fan_out[0].node: invalid node name "Zeta"`},
		"fan-out not a list":  {strings.Replace(workflowText, "fan_out:\n  - {node: zeta, uses: process:z, agent: codex-sol-61}\n  - {node: alpha, uses: process:a, agent: pi-m3}", "fan_out: {node: zeta, uses: process:z, agent: codex-sol-61}", 1), "fan_out: must be a list of nodes"},
		"no join":             {strings.Replace(workflowText, "join: {node: merge, uses: process:j, agent: claude-opus}\n", "", 1), "join: is required"},
		"unknown field":       {workflowText + "limits: {}\n", "limits: unknown field"},
		"collection as input": {strings.Replace(workflowText, "{source: git.revision, rev: \"${param.candidate}\"}", "{source: workflow.collection}", 1), "input.values.candidate.source: workflow.collection is given only to a join"},
		"undeclared param":    {strings.Replace(workflowText, "${param.candidate}", "${param.other}", 1), "refers to ${param.other}, which is not declared in input.params"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := definition.ParseWorkflow(doc(document.KindWorkflow, "w", tc.text))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want %q", err, tc.want)
			}
		})
	}
}
