package definition_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
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
  - {node: zeta, uses: process:z}
  - {node: alpha, uses: process:a}
join: {node: merge, uses: process:j}
`

// Nodes keep their declaration order, which the collection follows.
func TestParseWorkflowKeepsDeclarationOrder(t *testing.T) {
	workflow, err := definition.ParseWorkflow(doc(definition.KindWorkflow, "w", workflowText))
	if err != nil {
		t.Fatal(err)
	}
	want := []definition.Node{{Name: "zeta", Process: "z"}, {Name: "alpha", Process: "a"}, {Name: "merge", Process: "j"}}
	if !reflect.DeepEqual(workflow.Nodes(), want) || workflow.Join != want[2] {
		t.Fatalf("nodes = %+v, join %+v", workflow.Nodes(), workflow.Join)
	}
	if len(workflow.Params) != 1 || len(workflow.Values) != 1 || workflow.Values[0].Source != "git.revision" {
		t.Fatalf("inputs = %+v %+v", workflow.Params, workflow.Values)
	}
}

func TestParseWorkflowProblems(t *testing.T) {
	for name, tc := range map[string]struct{ text, want string }{
		"wrong type":          {strings.Replace(workflowText, "type: workflow", "type: process", 1), `type: must be "workflow"`},
		"not a process":       {strings.Replace(workflowText, "uses: process:z", "uses: agent:z", 1), `fan_out[0].uses: must be "process:<name>"`},
		"invalid node name":   {strings.Replace(workflowText, "node: zeta", "node: Zeta", 1), `fan_out[0].node: invalid node name "Zeta"`},
		"fan-out not a list":  {strings.Replace(workflowText, "fan_out:\n  - {node: zeta, uses: process:z}\n  - {node: alpha, uses: process:a}", "fan_out: {node: zeta, uses: process:z}", 1), "fan_out: must be a list of nodes"},
		"no join":             {strings.Replace(workflowText, "join: {node: merge, uses: process:j}\n", "", 1), "join: is required"},
		"unknown field":       {workflowText + "limits: {}\n", "limits: unknown field"},
		"collection as input": {strings.Replace(workflowText, "{source: git.revision, rev: \"${param.candidate}\"}", "{source: workflow.collection}", 1), "input.values.candidate.source: workflow.collection is given only to a join"},
		"undeclared param":    {strings.Replace(workflowText, "${param.candidate}", "${param.other}", 1), "refers to ${param.other}, which is not declared in input.params"},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := definition.ParseWorkflow(doc(definition.KindWorkflow, "w", tc.text))
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want %q", err, tc.want)
			}
		})
	}
}
