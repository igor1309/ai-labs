package settings

import (
	"fmt"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

// WorkflowProblems reports what keeps a workflow's nodes from running as
// ADR-003 has them, given the processes that parsed: a node whose process
// does not exist; a fan-out node whose process takes the collection, which
// only a join receives, or needs a param the workflow does not pass; a
// workflow value no fan-out process takes; and a join process that cannot
// receive the collection, or whose inputs take a caller-supplied param.
// Nothing whoever starts the workflow supplies reaches the join. A node
// that binds a base, one of bases, binds no work (ADR-030 rule 9).
func WorkflowProblems(workflow definition.Workflow, processes map[string]definition.Process, bases map[string][]string) []string {
	var problems []string
	add := func(format string, args ...any) { problems = append(problems, fmt.Sprintf(format, args...)) }
	bound := func(node, name string) (definition.Process, bool) {
		if extenders := bases[name]; len(extenders) > 0 {
			add("%s: process %s is a base of %s, not work (ADR-030 rule 9): bind a process that extends it", node, name, strings.Join(extenders, ", "))
			return definition.Process{}, false
		}
		process, ok := processes[name]
		if !ok {
			add("%s: process %q does not exist", node, name)
		}
		return process, ok
	}
	passed := map[string]bool{}
	for _, value := range workflow.Values {
		passed[value.Name] = true
	}
	taken := map[string]bool{}
	for _, node := range workflow.FanOut {
		process, ok := bound("fan-out node "+node.Name, node.Process)
		if !ok {
			continue
		}
		if collects := process.Collects(); len(collects) > 0 {
			add("fan-out node %s: process %s takes the collection (input %s), which only a join receives", node.Name, process.Name, strings.Join(collects, ", "))
		}
		for _, param := range process.Params {
			taken[param.Name] = true
			if !param.HasDefault && !passed[param.Name] {
				add("fan-out node %s: process %s needs param %s, which the workflow does not pass (no input value %s)", node.Name, process.Name, param.Name, param.Name)
			}
		}
	}
	for _, value := range workflow.Values {
		if !taken[value.Name] && len(workflow.FanOut) > 0 {
			add("input value %s: no fan-out process takes a param %s", value.Name, value.Name)
		}
	}
	if workflow.Join.Process == "" {
		return problems
	}
	join, ok := bound("join node "+workflow.Join.Name, workflow.Join.Process)
	if !ok {
		return problems
	}
	switch collects := join.Collects(); len(collects) {
	case 0:
		add("join node %s: process %s cannot receive the collection: it declares no input with source %s", workflow.Join.Name, join.Name, definition.CollectionSource)
	case 1:
	default:
		add("join node %s: process %s declares more than one input with source %s: %s", workflow.Join.Name, join.Name, definition.CollectionSource, strings.Join(collects, ", "))
	}
	var callers []string
	for _, param := range join.Params {
		callers = append(callers, "param "+param.Name)
	}
	for _, value := range join.Values {
		if value.Source == "param" {
			callers = append(callers, "input "+value.Name+" (source param)")
		}
	}
	if len(callers) > 0 {
		add("join node %s: process %s takes caller-supplied params (%s); a join receives only the collection and fixed values", workflow.Join.Name, join.Name, strings.Join(callers, ", "))
	}
	return problems
}
