package main

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/agister/settings/layout"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
)

// given is a field documents gives, value from path on line, at place.
func given[T any](value T, path string, line int, place string) documents.Field[T] {
	return documents.Field[T]{Value: value, Origin: documents.Origin{Path: path, Line: line, Place: place}, Given: true}
}

// at is the origin resolve is given: path, line and place.
func at(path string, line int, place string) resolve.Origin {
	return resolve.Origin{Path: path, Line: line, Place: place}
}

// step is a step item of documents, name binding the process p to the agent
// a, from path on line, at place.
func step(name, path string, line int, place string) documents.Field[documents.Item] {
	return given(documents.Item{
		Name:    name,
		Process: given("p", path, line, place+".process"),
		Agent:   given("a", path, line, place+".agent"),
	}, path, line, place)
}

// resolvedStep is step in resolve's words, at place.
func resolvedStep(name, path string, line int, place string) resolve.Item {
	return resolve.Item{
		Name:    name,
		Origin:  at(path, line, place),
		Process: resolve.Name{Value: "p", Origin: at(path, line, place+".process")},
		Agent:   resolve.Name{Value: "a", Origin: at(path, line, place+".agent")},
	}
}

// reading is a binding of documents, name reading reference, from path on
// line, at place.
func reading(name string, reference documents.Reference, path string, line int, place string) documents.Field[documents.Binding] {
	return given(documents.Binding{Name: name, Value: documents.Value{From: reference}}, path, line, place)
}

// read is what a reference reads, in resolve's words, at origin.
func read(root resolve.Root, name, field string, origin resolve.Origin) *resolve.Read {
	return &resolve.Read{Root: root, Name: name, Field: field, Origin: origin}
}

// source.feature, "The source gives resolve what decides a refusal".
func TestTheSourceGivesResolveWhatDecidesARefusal(t *testing.T) {
	t.Parallel()
	const (
		agentFile    = "/r/.agister/agents/a.toml"
		runtimeFile  = "/r/.agister/runtimes/r.yaml"
		processFile  = "/r/.agister/processes/p.yaml"
		workflowFile = "/r/.agister/workflows/w.yaml"
		blocksFile   = "/r/.agister/blocks.yaml"
	)
	cases := []struct {
		name string
		// documents types what the case gives.
		documents func(*documentsSpy)
		snapshot  layout.Snapshot
		// ask asks the source what the case gives resolve.
		ask  func(*source) any
		want any
	}{
		{
			name: "an agent's model, effort, runtime and fallback, each with its origin",
			documents: func(d *documentsSpy) {
				d.agents["a"] = typed[documents.AgentDefinition]{value: documents.AgentDefinition{
					Name: "a", Runtime: given("r", agentFile, 1, "runtime"), Model: given("opus", agentFile, 2, "model"), Effort: given("high", agentFile, 3, "effort"),
					Fallback: given("b", agentFile, 4, "fallback"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Agent("a")) },
			want: answerOf(resolve.Agent{
				Name:     "a",
				Runtime:  resolve.Name{Value: "r", Origin: at(agentFile, 1, "runtime")},
				Model:    resolve.Name{Value: "opus", Origin: at(agentFile, 2, "model")},
				Effort:   resolve.Name{Value: "high", Origin: at(agentFile, 3, "effort")},
				Fallback: resolve.Name{Value: "b", Origin: at(agentFile, 4, "fallback")},
			}, nil),
		},
		{
			name: "an agent's model's family, where it gives no model",
			documents: func(d *documentsSpy) {
				d.agents["a"] = typed[documents.AgentDefinition]{value: documents.AgentDefinition{
					Name: "a", Runtime: given("r", agentFile, 1, "runtime"), ModelFamily: given("opus", agentFile, 2, "model_family"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Agent("a")) },
			want: answerOf(resolve.Agent{
				Name:    "a",
				Runtime: resolve.Name{Value: "r", Origin: at(agentFile, 1, "runtime")},
				Model:   resolve.Name{Value: "opus", Origin: at(agentFile, 2, "model_family")},
			}, nil),
		},
		{
			name: "a runtime's contract, grants, select and options with their grants",
			documents: func(d *documentsSpy) {
				d.runtimes["r"] = typed[documents.RuntimeDefinition]{value: documents.RuntimeDefinition{
					Name: "r", Contract: given("c/1", runtimeFile, 2, "contract"), Grants: given([]string{"read"}, runtimeFile, 3, "grants"),
					Select: given("one", runtimeFile, 4, "select"),
					Options: given([]documents.Field[documents.Option]{
						given(documents.Option{Name: "x", Grants: given([]string{"write"}, runtimeFile, 6, "options.x.grants")}, runtimeFile, 6, "options.x"),
						given(documents.Option{Name: "y", Grants: given([]string{"write", "net"}, runtimeFile, 7, "options.y.grants")}, runtimeFile, 7, "options.y"),
					}, runtimeFile, 5, "options"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Runtime("r")) },
			want: answerOf(resolve.Runtime{
				Name:     "r",
				Contract: resolve.Name{Value: "c/1", Origin: at(runtimeFile, 2, "contract")},
				Grants:   []string{"read"},
				Select:   "one",
				Options:  []resolve.Option{{Name: "x", Grants: []string{"write"}}, {Name: "y", Grants: []string{"write", "net"}}},
			}, nil),
		},
		{
			name: "a process's require, allow, instruction, recovery and stale tool calls",
			documents: func(d *documentsSpy) {
				d.processes["p"] = typed[documents.ProcessDefinition]{value: documents.ProcessDefinition{
					Name:        "p",
					Instruction: given("i", processFile, 10, "instruction"),
					Permissions: given(documents.Permissions{
						Require: given([]string{"read"}, processFile, 3, "permissions.require"),
						Allow:   given([]string{"write"}, processFile, 4, "permissions.allow"),
					}, processFile, 2, "permissions"),
					Recovery: given(documents.Recovery{Resumes: given(1, processFile, 6, "recovery.resumes")}, processFile, 5, "recovery"),
					Limits: given(documents.Limits{
						Stale: given(documents.Stale{RepeatedToolCalls: given(3, processFile, 9, "limits.stale.repeated_tool_calls")}, processFile, 8, "limits.stale"),
					}, processFile, 7, "limits"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Process("p")) },
			want: answerOf(resolve.Process{
				Name: "p", Require: []string{"read"}, Allow: []string{"write"}, Instruction: true, Recovery: true, Staleness: true, StaleToolCalls: true,
			}, nil),
		},
		{
			name: "a process's stale tool commands",
			documents: func(d *documentsSpy) {
				d.processes["p"] = typed[documents.ProcessDefinition]{value: documents.ProcessDefinition{
					Name: "p",
					Limits: given(documents.Limits{
						Stale: given(documents.Stale{ToolCommand: given(time.Minute, processFile, 4, "limits.stale.tool_command")}, processFile, 3, "limits.stale"),
					}, processFile, 2, "limits"),
				}}
			},
			ask:  func(s *source) any { return answerOf(s.Process("p")) },
			want: answerOf(resolve.Process{Name: "p", Staleness: true, StaleToolCommands: true}, nil),
		},
		{
			name: "a process's revision, reading the input base",
			documents: func(d *documentsSpy) {
				d.processes["p"] = typed[documents.ProcessDefinition]{value: documents.ProcessDefinition{
					Name: "p",
					Workspace: given(documents.Workspace{
						Revision: given(documents.Reference{Root: documents.ReadsInput, Name: "base"}, processFile, 3, "workspace.revision"),
					}, processFile, 2, "workspace"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Process("p")) },
			want: answerOf(resolve.Process{
				Name: "p", Revision: read(resolve.RootInput, "base", "", at(processFile, 3, "workspace.revision")),
			}, nil),
		},
		{
			name: "a process's prompt, guidance and schema, each with its origin",
			documents: func(d *documentsSpy) {
				d.processes["p"] = typed[documents.ProcessDefinition]{value: documents.ProcessDefinition{
					Name:   "p",
					Prompt: given("pr", processFile, 2, "prompt"),
					Guidance: given([]documents.Field[string]{
						given("g", processFile, 3, "guidance[0]"), given("h", processFile, 4, "guidance[1]"),
					}, processFile, 3, "guidance"),
					Output: given(documents.Output{Schema: given("sc", processFile, 6, "output.schema")}, processFile, 5, "output"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Process("p")) },
			want: answerOf(resolve.Process{
				Name:   "p",
				Prompt: resolve.Name{Value: "pr", Origin: at(processFile, 2, "prompt")},
				Guidance: []resolve.Name{
					{Value: "g", Origin: at(processFile, 3, "guidance[0]")},
					{Value: "h", Origin: at(processFile, 4, "guidance[1]")},
				},
				Schema: resolve.Name{Value: "sc", Origin: at(processFile, 6, "output.schema")},
			}, nil),
		},
		{
			name: "a process's params, inputs and environment",
			documents: func(d *documentsSpy) {
				d.processes["p"] = typed[documents.ProcessDefinition]{value: documents.ProcessDefinition{
					Name: "p",
					Params: given([]documents.Field[documents.Param]{
						given(documents.Param{Name: "base"}, processFile, 3, "params.base"),
						given(documents.Param{Name: "goal", Default: given("x", processFile, 4, "params.goal.default")}, processFile, 4, "params.goal"),
					}, processFile, 2, "params"),
					Inputs: given([]documents.Field[documents.Input]{
						given(documents.Input{
							Name: "brief", Source: given("file", processFile, 6, "inputs.brief.source"),
							Form: given([]documents.Field[string]{given("step", processFile, 7, "inputs.brief.form[0]")}, processFile, 7, "inputs.brief.form"),
							Arguments: []documents.Field[documents.Binding]{
								reading("path", documents.Reference{Root: documents.ReadsParam, Name: "goal"}, processFile, 8, "inputs.brief.path"),
							},
						}, processFile, 6, "inputs.brief"),
					}, processFile, 5, "inputs"),
					Environment: given([]documents.Field[documents.Binding]{
						given(documents.Binding{Name: "MODE", Value: documents.Value{Text: "fast"}}, processFile, 10, "environment.MODE"),
					}, processFile, 9, "environment"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Process("p")) },
			want: answerOf(resolve.Process{
				Name:   "p",
				Params: []resolve.Param{{Name: "base"}, {Name: "goal", Default: true}},
				Inputs: []resolve.Input{{
					Name:  "brief",
					Forms: []resolve.Name{{Value: "step", Origin: at(processFile, 7, "inputs.brief.form[0]")}},
					Arguments: []resolve.Binding{{
						Name:   "path",
						From:   read(resolve.RootParam, "goal", "", at(processFile, 8, "inputs.brief.path")),
						Origin: at(processFile, 8, "inputs.brief.path"),
					}},
				}},
				Environment: []resolve.Binding{{Name: "MODE", Text: "fast", Origin: at(processFile, 10, "environment.MODE")}},
			}, nil),
		},
		{
			name: "the blocks, each its document, its reason, at its line",
			documents: func(d *documentsSpy) {
				d.blocks = []documents.Field[documents.Block]{
					given(documents.Block{Kind: documents.Agent, Name: "a", Reason: "old"}, blocksFile, 1, "[0]"),
					given(documents.Block{Kind: documents.Process, Name: "p", Reason: "not here"}, blocksFile, 2, "[1]"),
				}
			},
			ask: func(s *source) any { return s.Blocks() },
			want: []resolve.Block{
				{Kind: resolve.KindAgent, Name: "a", Reason: "old", Origin: at(blocksFile, 1, "[0]")},
				{Kind: resolve.KindProcess, Name: "p", Reason: "not here", Origin: at(blocksFile, 2, "[1]")},
			},
		},
		{
			name: "a skill's block",
			documents: func(d *documentsSpy) {
				d.blocks = []documents.Field[documents.Block]{
					given(documents.Block{Kind: documents.Kind("skill"), Name: "s", Reason: "old"}, blocksFile, 1, "[0]"),
				}
			},
			ask:  func(s *source) any { return s.Blocks() },
			want: []resolve.Block{{Kind: resolve.KindSkill, Name: "s", Reason: "old", Origin: at(blocksFile, 1, "[0]")}},
		},
		{
			name: "a workflow's params, base with no default and goal with one",
			documents: func(d *documentsSpy) {
				d.workflows["w"] = typed[documents.WorkflowDefinition]{value: documents.WorkflowDefinition{
					Name: "w",
					Params: given([]documents.Field[documents.Param]{
						given(documents.Param{Name: "base"}, workflowFile, 3, "params.base"),
						given(documents.Param{Name: "goal", Default: given("x", workflowFile, 4, "params.goal.default")}, workflowFile, 4, "params.goal"),
					}, workflowFile, 2, "params"),
					Steps: given([]documents.Field[documents.Item]{step("s", workflowFile, 6, "steps[0]")}, workflowFile, 5, "steps"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Workflow("w")) },
			want: answerOf(resolve.Workflow{
				Name:   "w",
				Params: []resolve.Param{{Name: "base"}, {Name: "goal", Default: true}},
				Steps:  []resolve.Item{resolvedStep("s", workflowFile, 6, "steps[0]")},
			}, nil),
		},
		{
			name: "a workflow's step continuing the session of a, with its inputs",
			documents: func(d *documentsSpy) {
				s := step("s", workflowFile, 4, "steps[1]")
				s.Value.Session = given(documents.Reference{Root: documents.ReadsSession, Name: "a"}, workflowFile, 5, "steps[1].session")
				s.Value.Inputs = given([]documents.Field[documents.Binding]{
					reading("goal", documents.Reference{Root: documents.ReadsParam, Name: "goal"}, workflowFile, 7, "steps[1].inputs.goal"),
				}, workflowFile, 6, "steps[1].inputs")
				d.workflows["w"] = typed[documents.WorkflowDefinition]{value: documents.WorkflowDefinition{
					Name:  "w",
					Steps: given([]documents.Field[documents.Item]{step("a", workflowFile, 3, "steps[0]"), s}, workflowFile, 2, "steps"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Workflow("w")) },
			want: answerOf(resolve.Workflow{
				Name: "w",
				Steps: []resolve.Item{
					resolvedStep("a", workflowFile, 3, "steps[0]"),
					func() resolve.Item {
						s := resolvedStep("s", workflowFile, 4, "steps[1]")
						s.Session = read(resolve.RootSession, "a", "", at(workflowFile, 5, "steps[1].session"))
						s.Inputs = []resolve.Binding{{
							Name:   "goal",
							From:   read(resolve.RootParam, "goal", "", at(workflowFile, 7, "steps[1].inputs.goal")),
							Origin: at(workflowFile, 7, "steps[1].inputs.goal"),
						}}
						return s
					}(),
				},
			}, nil),
		},
		{
			name: "a workflow's workflow item, parallel and branch, each with its items",
			documents: func(d *documentsSpy) {
				first := step("x", workflowFile, 8, "steps[2].branch[0]")
				first.Value.If = given(documents.Condition{Operator: "present",
					Reads: given(documents.Reference{Root: documents.ReadsParam, Name: "a"}, workflowFile, 9, "steps[2].branch[0].if.present"),
				}, workflowFile, 9, "steps[2].branch[0].if")
				first.Value.Outputs = given([]documents.Field[documents.Binding]{
					reading("o", documents.Reference{Root: documents.ReadsOutputs, Name: "x"}, workflowFile, 10, "steps[2].branch[0].outputs.o"),
				}, workflowFile, 10, "steps[2].branch[0].outputs")
				d.workflows["w"] = typed[documents.WorkflowDefinition]{value: documents.WorkflowDefinition{
					Name: "w",
					Steps: given([]documents.Field[documents.Item]{
						given(documents.Item{Name: "c", Workflow: given("v", workflowFile, 3, "steps[0].workflow")}, workflowFile, 3, "steps[0]"),
						given(documents.Item{Name: "par", Parallel: given([]documents.Field[documents.Item]{
							step("p1", workflowFile, 5, "steps[1].parallel[0]"), step("p2", workflowFile, 6, "steps[1].parallel[1]"),
						}, workflowFile, 4, "steps[1].parallel")}, workflowFile, 4, "steps[1]"),
						given(documents.Item{Name: "b", Branch: given([]documents.Field[documents.Item]{
							first, step("y", workflowFile, 11, "steps[2].branch[1]"),
						}, workflowFile, 7, "steps[2].branch")}, workflowFile, 7, "steps[2]"),
					}, workflowFile, 2, "steps"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Workflow("w")) },
			want: answerOf(resolve.Workflow{
				Name: "w",
				Steps: []resolve.Item{
					{Name: "c", Origin: at(workflowFile, 3, "steps[0]"),
						Workflow: resolve.Name{Value: "v", Origin: at(workflowFile, 3, "steps[0].workflow")}},
					{Name: "par", Origin: at(workflowFile, 4, "steps[1]"), Parallel: []resolve.Item{
						resolvedStep("p1", workflowFile, 5, "steps[1].parallel[0]"),
						resolvedStep("p2", workflowFile, 6, "steps[1].parallel[1]"),
					}},
					{Name: "b", Origin: at(workflowFile, 7, "steps[2]"), Branch: []resolve.Item{
						func() resolve.Item {
							x := resolvedStep("x", workflowFile, 8, "steps[2].branch[0]")
							x.If = resolve.Condition{Reads: []resolve.Read{
								*read(resolve.RootParam, "a", "", at(workflowFile, 9, "steps[2].branch[0].if.present")),
							}}
							x.Outputs = []resolve.Binding{{
								Name:   "o",
								From:   read(resolve.RootOutputs, "x", "", at(workflowFile, 10, "steps[2].branch[0].outputs.o")),
								Origin: at(workflowFile, 10, "steps[2].branch[0].outputs.o"),
							}}
							return x
						}(),
						resolvedStep("y", workflowFile, 11, "steps[2].branch[1]"),
					}},
				},
			}, nil),
		},
		{
			name: "a workflow's parallel p of max 1, its items and its max",
			documents: func(d *documentsSpy) {
				d.workflows["w"] = typed[documents.WorkflowDefinition]{value: documents.WorkflowDefinition{
					Name: "w",
					Steps: given([]documents.Field[documents.Item]{
						given(documents.Item{Name: "p",
							Parallel: given([]documents.Field[documents.Item]{
								step("a", workflowFile, 7, "steps[0].parallel.steps[0]"),
							}, workflowFile, 6, "steps[0].parallel.steps"),
							Max: given(1, workflowFile, 5, "steps[0].parallel.max"),
						}, workflowFile, 3, "steps[0]"),
					}, workflowFile, 2, "steps"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Workflow("w")) },
			want: answerOf(resolve.Workflow{
				Name: "w",
				Steps: []resolve.Item{{Name: "p", Origin: at(workflowFile, 3, "steps[0]"), Max: 1,
					Parallel: []resolve.Item{resolvedStep("a", workflowFile, 7, "steps[0].parallel.steps[0]")}}},
			}, nil),
		},
		{
			name: "a workflow's repeat r, its state, steps, next, until and max 3",
			documents: func(d *documentsSpy) {
				d.workflows["w"] = typed[documents.WorkflowDefinition]{value: documents.WorkflowDefinition{
					Name: "w",
					Steps: given([]documents.Field[documents.Item]{
						given(documents.Item{Name: "r", Repeat: given(documents.Repeat{
							State: given([]documents.Field[documents.Binding]{
								reading("f", documents.Reference{Root: documents.ReadsParam, Name: "x"}, workflowFile, 5, "steps[0].repeat.state.f"),
							}, workflowFile, 5, "steps[0].repeat.state"),
							Steps: given([]documents.Field[documents.Item]{
								step("a", workflowFile, 7, "steps[0].repeat.steps[0]"),
							}, workflowFile, 6, "steps[0].repeat.steps"),
							Next: given([]documents.Field[documents.Binding]{
								reading("f", documents.Reference{Root: documents.ReadsOutputs, Name: "a", Field: "v"}, workflowFile, 8, "steps[0].repeat.next.f"),
							}, workflowFile, 8, "steps[0].repeat.next"),
							Until: given(documents.Condition{Operator: "present",
								Reads: given(documents.Reference{Root: documents.ReadsState, Name: "f"}, workflowFile, 9, "steps[0].repeat.until.present"),
							}, workflowFile, 9, "steps[0].repeat.until"),
							Max: given(3, workflowFile, 10, "steps[0].repeat.max"),
						}, workflowFile, 4, "steps[0].repeat")}, workflowFile, 3, "steps[0]"),
					}, workflowFile, 2, "steps"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Workflow("w")) },
			want: answerOf(resolve.Workflow{
				Name: "w",
				Steps: []resolve.Item{{Name: "r", Origin: at(workflowFile, 3, "steps[0]"), Repeat: &resolve.Repeat{
					State: []resolve.Binding{{Name: "f",
						From:   read(resolve.RootParam, "x", "", at(workflowFile, 5, "steps[0].repeat.state.f")),
						Origin: at(workflowFile, 5, "steps[0].repeat.state.f")}},
					Steps: []resolve.Item{resolvedStep("a", workflowFile, 7, "steps[0].repeat.steps[0]")},
					Next: []resolve.Binding{{Name: "f",
						From:   read(resolve.RootOutputs, "a", "v", at(workflowFile, 8, "steps[0].repeat.next.f")),
						Origin: at(workflowFile, 8, "steps[0].repeat.next.f")}},
					Until: resolve.Condition{Reads: []resolve.Read{
						*read(resolve.RootState, "f", "", at(workflowFile, 9, "steps[0].repeat.until.present")),
					}},
					Max: 3,
				}}},
			}, nil),
		},
		{
			name: "a workflow's output o, reading the outputs of s",
			documents: func(d *documentsSpy) {
				d.workflows["w"] = typed[documents.WorkflowDefinition]{value: documents.WorkflowDefinition{
					Name: "w",
					Inputs: given([]documents.Field[documents.Input]{
						given(documents.Input{Name: "goal", Source: given("text", workflowFile, 3, "inputs.goal.source"),
							Form: given([]documents.Field[string]{given("goal", workflowFile, 3, "inputs.goal.form[0]")}, workflowFile, 3, "inputs.goal.form"),
						}, workflowFile, 3, "inputs.goal"),
					}, workflowFile, 2, "inputs"),
					Steps: given([]documents.Field[documents.Item]{step("s", workflowFile, 5, "steps[0]")}, workflowFile, 4, "steps"),
					Outputs: given([]documents.Field[documents.Binding]{
						reading("o", documents.Reference{Root: documents.ReadsOutputs, Name: "s"}, workflowFile, 7, "outputs.o"),
					}, workflowFile, 6, "outputs"),
				}}
			},
			ask: func(s *source) any { return answerOf(s.Workflow("w")) },
			want: answerOf(resolve.Workflow{
				Name:   "w",
				Inputs: []resolve.Input{{Name: "goal", Forms: []resolve.Name{{Value: "goal", Origin: at(workflowFile, 3, "inputs.goal.form[0]")}}}},
				Steps:  []resolve.Item{resolvedStep("s", workflowFile, 5, "steps[0]")},
				Outputs: []resolve.Binding{{Name: "o",
					From:   read(resolve.RootOutputs, "s", "", at(workflowFile, 7, "outputs.o")),
					Origin: at(workflowFile, 7, "outputs.o")}},
			}, nil),
		},
		{
			name: "the other document, prompt pr, its problem",
			documents: func(d *documentsSpy) {
				d.blobs[documents.Prompt] = map[string][]documents.Problem{"pr": {{Path: "/r/.agister/prompts/pr.md", Message: "it cannot be read"}}}
			},
			ask:  func(s *source) any { return s.Other(resolve.KindPrompt, "pr") },
			want: []resolve.Problem{{Origin: at("/r/.agister/prompts/pr.md", 0, ""), Message: "it cannot be read"}},
		},
		{
			name: "the other document, schema sc, its problem",
			documents: func(d *documentsSpy) {
				d.blobs[documents.Schema] = map[string][]documents.Problem{"sc": {{Message: `no layer holds the schema "sc"`}}}
			},
			ask:  func(s *source) any { return s.Other(resolve.KindSchema, "sc") },
			want: []resolve.Problem{{Message: `no layer holds the schema "sc"`}},
		},
		{
			name: "the other document, brief b, its problem",
			documents: func(d *documentsSpy) {
				d.briefs["b"] = typed[documents.BriefDefinition]{problems: []documents.Problem{
					{Path: "/r/.agister/brief-forms/b.yaml", Line: 3, Place: "parts", Message: "it names a part"},
				}}
			},
			ask:  func(s *source) any { return s.Other(resolve.KindBrief, "b") },
			want: []resolve.Problem{{Origin: at("/r/.agister/brief-forms/b.yaml", 3, "parts"), Message: "it names a part"}},
		},
		{
			name:      "the other document, skill k, which no layer holds",
			documents: func(*documentsSpy) {},
			ask:       func(s *source) any { return s.Other(resolve.KindSkill, "k") },
			want:      []resolve.Problem{{Message: `no layer holds the skill "k"`}},
		},
		{
			name:      "whether a layer holds the agent z: none does",
			documents: func(*documentsSpy) {},
			snapshot: layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
				layout.Agent: {"a": {Sources: layout.Sources{Home: &layout.Source{Path: "/u/.agister/agents/a.toml"}}}},
			}},
			ask:  func(s *source) any { return s.Holds(resolve.KindAgent, "z") },
			want: false,
		},
		{
			name:      "whether a layer holds the agent a: home does",
			documents: func(*documentsSpy) {},
			snapshot: layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
				layout.Agent: {"a": {Sources: layout.Sources{Home: &layout.Source{Path: "/u/.agister/agents/a.toml"}}}},
			}},
			ask:  func(s *source) any { return s.Holds(resolve.KindAgent, "a") },
			want: true,
		},
		{
			name:      "whether a layer holds the agent b, whose file cannot be read: the repository does",
			documents: func(*documentsSpy) {},
			snapshot: layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
				layout.Agent: {"b": {Problems: []layout.Problem{{Path: "/r/.agister/agents/b.yaml"}}}},
			}},
			ask:  func(s *source) any { return s.Holds(resolve.KindAgent, "b") },
			want: true,
		},
		{
			name:      "whether a layer holds the skill k: none does",
			documents: func(*documentsSpy) {},
			ask:       func(s *source) any { return s.Holds(resolve.KindSkill, "k") },
			want:      false,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := newDocumentsSpy(t)
			c.documents(spy)
			if got := c.ask(sourceOf(t, spy, c.snapshot)); !reflect.DeepEqual(got, c.want) {
				t.Errorf("the source gives\n got %+v\nwant %+v", got, c.want)
			}
		})
	}
}

// A document documents gives with problems is given to resolve as no
// definition, the zero one, and every problem, each at its origin: for
// each kind the source types.
func TestADocumentsProblemsAreGivenWithNoDefinition(t *testing.T) {
	t.Parallel()
	const file = "/r/.agister/x.yaml"
	problems := []documents.Problem{
		{Path: file, Line: 2, Place: "limits.time", Message: "it is more than zero"},
		{Path: file, Line: 5, Place: "steps", Message: "it has an item"},
		{Place: "schema", Message: "it is missing"},
	}
	want := []resolve.Problem{
		{Origin: at(file, 2, "limits.time"), Message: "it is more than zero"},
		{Origin: at(file, 5, "steps"), Message: "it has an item"},
		{Origin: at("", 0, "schema"), Message: "it is missing"},
	}
	cases := []struct {
		kind string
		// documents gives the document "d" with problems.
		documents func(*documentsSpy)
		// ask gives the source's answer for "d", and whether its definition
		// is the zero one.
		ask func(*source) (bool, []resolve.Problem)
	}{
		{"workflow", func(d *documentsSpy) {
			d.workflows["d"] = typed[documents.WorkflowDefinition]{problems: problems}
		}, func(s *source) (bool, []resolve.Problem) {
			w, p := s.Workflow("d")
			return reflect.DeepEqual(w, resolve.Workflow{}), p
		}},
		{"process", func(d *documentsSpy) {
			d.processes["d"] = typed[documents.ProcessDefinition]{problems: problems}
		}, func(s *source) (bool, []resolve.Problem) {
			v, p := s.Process("d")
			return reflect.DeepEqual(v, resolve.Process{}), p
		}},
		{"agent", func(d *documentsSpy) {
			d.agents["d"] = typed[documents.AgentDefinition]{problems: problems}
		}, func(s *source) (bool, []resolve.Problem) {
			v, p := s.Agent("d")
			return reflect.DeepEqual(v, resolve.Agent{}), p
		}},
		{"runtime", func(d *documentsSpy) {
			d.runtimes["d"] = typed[documents.RuntimeDefinition]{problems: problems}
		}, func(s *source) (bool, []resolve.Problem) {
			v, p := s.Runtime("d")
			return reflect.DeepEqual(v, resolve.Runtime{}), p
		}},
	}
	for _, c := range cases {
		t.Run(c.kind, func(t *testing.T) {
			t.Parallel()
			spy := newDocumentsSpy(t)
			c.documents(spy)
			zero, got := c.ask(sourceOf(t, spy, layout.Snapshot{}))
			if !zero {
				t.Errorf("the %s is given a definition, want none", c.kind)
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("problems\n got %+v\nwant %+v", got, want)
			}
		})
	}
}

// answered is a document resolve is given, or its problems.
type answered[T any] struct {
	Value    T
	Problems []resolve.Problem
}

func answerOf[T any](value T, problems []resolve.Problem) answered[T] {
	return answered[T]{Value: value, Problems: problems}
}

// source.feature, "A condition gives every reference it reads, however
// nested": each at the place documents gives it, in the order documents
// gives them.
func TestAConditionGivesEveryReferenceItReadsHoweverNested(t *testing.T) {
	t.Parallel()
	const (
		file = "/r/.agister/workflows/w.yaml"
		if0  = "steps[0].branch[0].if.not"
	)
	reference := func(root documents.Root, name, field string, line int, place string) documents.Field[documents.Reference] {
		return given(documents.Reference{Root: root, Name: name, Field: field}, file, line, place)
	}
	condition := func(c documents.Condition, line int, place string) documents.Field[documents.Condition] {
		return given(c, file, line, place)
	}
	// not: {and: [{equals: [{from: params.a}, "x"]},
	//             {all: {in: {from: state.f}, where: {present: {from: item.x}}}}]}
	nested := condition(documents.Condition{Operator: "not", Of: []documents.Field[documents.Condition]{
		condition(documents.Condition{Operator: "and", Of: []documents.Field[documents.Condition]{
			condition(documents.Condition{Operator: "equals", Reads: reference(documents.ReadsParam, "a", "", 5, if0+".and[0].equals[0]"),
				Equals: given[any]("x", file, 5, if0+".and[0].equals[1]")}, 5, if0+".and[0]"),
			condition(documents.Condition{Operator: "all", Reads: reference(documents.ReadsState, "f", "", 6, if0+".and[1].all.in"),
				Of: []documents.Field[documents.Condition]{
					condition(documents.Condition{Operator: "present",
						Reads: reference(documents.ReadsItem, "", "x", 7, if0+".and[1].all.where.present")}, 7, if0+".and[1].all.where"),
				}}, 6, if0+".and[1]"),
		}}, 4, if0),
	}}, 4, "steps[0].branch[0].if")
	arm := step("x", file, 3, "steps[0].branch[0]")
	arm.Value.If = nested
	spy := newDocumentsSpy(t)
	spy.workflows["w"] = typed[documents.WorkflowDefinition]{value: documents.WorkflowDefinition{
		Name: "w",
		Steps: given([]documents.Field[documents.Item]{
			given(documents.Item{Name: "b", Branch: given([]documents.Field[documents.Item]{
				arm, step("y", file, 8, "steps[0].branch[1]"),
			}, file, 2, "steps[0].branch")}, file, 2, "steps[0]"),
		}, file, 1, "steps"),
	}}
	workflow, problems := sourceOf(t, spy, layout.Snapshot{}).Workflow("w")
	if len(problems) > 0 {
		t.Fatalf("problems %+v, want none", problems)
	}
	want := []resolve.Read{
		*read(resolve.RootParam, "a", "", at(file, 5, if0+".and[0].equals[0]")),
		*read(resolve.RootState, "f", "", at(file, 6, if0+".and[1].all.in")),
		*read(resolve.RootQueryItem, "", "x", at(file, 7, if0+".and[1].all.where.present")),
	}
	if got := workflow.Steps[0].Branch[0].If.Reads; !reflect.DeepEqual(got, want) {
		t.Errorf("the arm's condition reads\n got %+v\nwant %+v", got, want)
	}
}

// A budget's problems, like blocks', belong to no document and preserve
// their field and line when resolve is given them.
func TestSourceReportsBudgetProblems(t *testing.T) {
	t.Parallel()
	docs := newDocumentsSpy(t)
	docs.budgetProblems = []documents.Problem{{Path: "/u/.agister/budget.yaml", Line: 2, Place: "daily.cost", Message: "it is more than zero"}}
	s := sourceOf(t, docs, layout.Snapshot{})
	want := []resolve.Problem{{Origin: resolve.Origin{Path: "/u/.agister/budget.yaml", Line: 2, Place: "daily.cost"}, Message: "it is more than zero"}}
	if got := s.Problems(); !reflect.DeepEqual(got, want) {
		t.Fatalf("problems %+v, want %+v", got, want)
	}
}
