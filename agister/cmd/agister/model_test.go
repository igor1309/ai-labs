package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/supervisor"
)

// askProcess is the repository's process "ask" of model.feature.
const askProcess = `schema: agister.process/v1alpha1
prompt: ask
guidance: [g]
instruction: i
params:
  q: {}
inputs:
  q: {source: param, name: q}
environment:
  A: "1"
permissions:
  require: [repository.read]
  allow: [repository.read, host.read]
output:
  schema: answer
`

// answerSchema is the schema "answer": the field "ok", a boolean.
const answerSchema = `{"type":"object","required":["ok"],"properties":{"ok":{"type":"boolean"}}}`

// askMessage is the message of "ask" given q=why: its input, its prompt,
// then its guidance.
const askMessage = "## q\n\nwhy\n\n## prompt\n\np\n\n## g\n\nrules"

// modelSettings are the settings of model.feature: home's as shipped, with
// the repository's process "ask", its prompt, its guidance and its schema;
// then the files of more, by path.
func modelSettings(t *testing.T, more map[string]string) map[string]string {
	t.Helper()
	settings := shippedHome(t)
	settings["/r/.agister/processes/ask.yaml"] = askProcess
	settings["/r/.agister/prompts/ask.md"] = "p"
	settings["/r/.agister/prompts/g.md"] = "rules"
	settings["/r/.agister/schemas/answer.json"] = answerSchema
	maps.Copy(settings, more)
	return settings
}

// validatorSpy is a spy of core/call's validator: it keeps each schema and
// output it is asked to check, and rejects them with err, nil accepting
// them. It is safe for concurrent use.
type validatorSpy struct {
	err     error
	mu      sync.Mutex
	checked [][2]string
}

func (s *validatorSpy) Validate(schema, output []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.checked = append(s.checked, [2]string{string(schema), string(output)})
	return s.err
}

func (s *validatorSpy) checks() [][2]string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.checked)
}

// replies answers as a program that writes lines to stdout, one by one,
// and exits 0.
func replies(lines ...string) func(context.Context, supervisor.Program) (supervisor.Result, error) {
	return func(_ context.Context, program supervisor.Program) (supervisor.Result, error) {
		for _, line := range lines {
			program.Line(line)
		}
		return supervisor.Result{Stdout: kept(strings.Join(lines, "\n")), Stderr: kept("")}, nil
	}
}

// claudeResult is a result event of claude's stream-json, a success, its
// session "s1", given what else it reports.
func claudeResult(t *testing.T, more map[string]any) string {
	t.Helper()
	event := map[string]any{"type": "result", "subtype": "success", "is_error": false, "session_id": "s1", "result": "done"}
	maps.Copy(event, more)
	line, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	return string(line)
}

// unlined is programs with no line function, so that they compare.
func unlined(programs []supervisor.Program) []supervisor.Program {
	programs = slices.Clone(programs)
	for i := range programs {
		programs[i].Line = nil
	}
	return programs
}

// modelPrinted is what a test of a model's step reads of a result as cli
// prints it.
type modelPrinted struct {
	Status   string            `json:"status"`
	Class    *string           `json:"class"`
	Output   map[string]any    `json:"output"`
	Cost     *float64          `json:"cost"`
	Usage    map[string]any    `json:"usage"`
	Sessions map[string]string `json:"sessions"`
	Reason   *string           `json:"reason"`
}

func modelPrintedOf(t *testing.T, got ran) modelPrinted {
	t.Helper()
	var p modelPrinted
	if err := json.Unmarshal([]byte(got.stdout), &p); err != nil {
		t.Fatalf("stdout %q, stderr %q: %v", got.stdout, got.stderr, err)
	}
	return p
}

// model.feature, "A step on claude-code is given its message, instruction,
// model, effort, options and schema".
//
// Contract test: the files home holds, as Agister ships them.
func TestAStepOnClaudeCodeIsGivenItsMessageInstructionModelEffortOptionsAndSchema(t *testing.T) {
	t.Parallel()
	f := newRunFixture(modelSettings(t, nil), replies(claudeResult(t, map[string]any{"structured_output": map[string]any{"ok": true}})))
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	want := []supervisor.Program{{Name: "claude", Args: []string{
		"-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk",
		"--tools=Glob,Skill", "--allowedTools=Glob,Skill", "--strict-mcp-config",
		"--model", "opus", "--effort", "high", "--append-system-prompt", "i", "--json-schema", answerSchema,
	}, Dir: "/r", Env: append(slices.Clone(environ), "A=1"), Stdin: askMessage}}
	if ran := unlined(f.supervisor.ran()); !reflect.DeepEqual(ran, want) {
		t.Errorf("ran\n%#v\nwant\n%#v", ran, want)
	}
}

// model.feature, "A step on codex is given its plan's one option": its
// schema is written in a folder of its own under the system's temporary
// folder.
//
// Contract test: the files home holds, as Agister ships them; and the
// temporary folder codex writes its schema in.
func TestAStepOnCodexIsGivenItsPlansOneOption(t *testing.T) {
	t.Parallel()
	var schemaFile, schema string
	f := newRunFixture(modelSettings(t, nil), func(ctx context.Context, program supervisor.Program) (supervisor.Result, error) {
		if i := slices.Index(program.Args, "--output-schema"); i >= 0 && i+1 < len(program.Args) {
			schemaFile = program.Args[i+1]
			read, err := os.ReadFile(schemaFile)
			if err != nil {
				return supervisor.Result{}, err
			}
			schema = string(read)
		}
		return replies(`{"type":"item.completed","item":{"id":"i","type":"agent_message","text":"{\"ok\":true}"}}`,
			`{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}`)(ctx, program)
	})
	f.temp = t.TempDir()
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "codex-sol-61", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d, stdout %s; want none, 0", got.stderr, got.code, got.stdout)
	}
	want := []supervisor.Program{{Name: "codex", Args: []string{
		"exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only",
		"--config", `approval_policy="never"`, "--ignore-user-config", "--ignore-rules",
		"--model", "gpt-6.1-sol", "--config", `model_reasoning_effort="high"`, "--output-schema", schemaFile, "-",
	}, Dir: "/r", Env: append(slices.Clone(environ), "A=1"), Stdin: "<instructions>\ni\n</instructions>\n\n" + askMessage}}
	if ran := unlined(f.supervisor.ran()); !reflect.DeepEqual(ran, want) {
		t.Errorf("ran\n%#v\nwant\n%#v", ran, want)
	}
	if folder := filepath.Dir(filepath.Dir(schemaFile)); folder != f.temp || schema != answerSchema {
		t.Errorf("the schema's file %s held %q; want it in a folder of its own under %s, holding %q", schemaFile, schema, f.temp, answerSchema)
	}
}

// model.feature, "A completed step prints its reply's output and usage".
//
// Contract test: the files home holds, as Agister ships them.
func TestACompletedStepPrintsItsReplysOutputAndUsage(t *testing.T) {
	t.Parallel()
	f := newRunFixture(modelSettings(t, nil), replies(claudeResult(t, map[string]any{"structured_output": map[string]any{"ok": true},
		"total_cost_usd": 0.25, "usage": map[string]any{"input_tokens": 10, "output_tokens": 3}})))
	validator := &validatorSpy{}
	f.validator = validator
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	cost := 0.25
	want := modelPrinted{
		Status: "completed",
		Output: map[string]any{"output": map[string]any{"ok": true}},
		Cost:   &cost,
		Usage: map[string]any{"input_tokens": float64(10), "output_tokens": float64(3),
			"cache_read_tokens": nil, "cache_write_tokens": nil, "reasoning_tokens": nil},
		Sessions: map[string]string{"ask": "s1"},
	}
	if p := modelPrintedOf(t, got); !reflect.DeepEqual(p, want) {
		t.Errorf("printed %+v, want %+v", p, want)
	}
	if checks, want := validator.checks(), [][2]string{{answerSchema, `{"ok":true}`}}; !reflect.DeepEqual(checks, want) {
		t.Errorf("the validator checked %q, want %q", checks, want)
	}
}

// model.feature, "Each step runs on its own agent's runtime".
//
// Contract test: the files home holds, as Agister ships them; and the
// temporary folder codex writes its schema in.
func TestEachStepRunsOnItsOwnAgentsRuntime(t *testing.T) {
	t.Parallel()
	settings := modelSettings(t, map[string]string{
		"/r/.agister/processes/say.yaml": fmt.Sprintf(sayProcess, "", ""),
		"/r/.agister/prompts/say.md":     `echo "$what"`,
		"/r/.agister/workflows/mixed.yaml": `schema: agister.workflow/v1alpha1
params:
  what: {}
  q: {}
steps:
  - {name: say, process: say, agent: bash, inputs: {what: {from: params.what}}}
  - {name: ask, process: ask, agent: codex-sol-61, inputs: {q: {from: params.q}}}
outputs:
  said: {from: steps.say.outputs.stdout.head}
  answer: {from: steps.ask.outputs.ok}
`,
	})
	codex := replies(`{"type":"item.completed","item":{"id":"i","type":"agent_message","text":"{\"ok\":true}"}}`, `{"type":"turn.completed"}`)
	f := newRunFixture(settings, func(ctx context.Context, program supervisor.Program) (supervisor.Result, error) {
		if program.Name == "bash" {
			return echoes(ctx, program)
		}
		return codex(ctx, program)
	})
	f.temp = t.TempDir()
	got := f.run(t, "/r", "run", "mixed", "--param", "what=hi", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d, stdout %s; want none, 0", got.stderr, got.code, got.stdout)
	}
	ran := f.supervisor.ran()
	var names []string
	for _, program := range ran {
		names = append(names, program.Name)
	}
	if !slices.Equal(names, []string{"bash", "codex"}) {
		t.Fatalf("ran %q, want bash, then codex, and no claude", names)
	}
	if ran[0].Args[1] != `echo "$what"` || ran[1].Stdin != "<instructions>\ni\n</instructions>\n\n"+askMessage {
		t.Errorf("bash ran %q and codex was given %q; want the script of say, then the message of ask", ran[0].Args, ran[1].Stdin)
	}
	if p := modelPrintedOf(t, got); !reflect.DeepEqual(p.Output, map[string]any{"said": "hi\n", "answer": true}) {
		t.Errorf("printed the output %v, want said hi and answer true", p.Output)
	}
}

// model.feature, "Output the schema rejects fails the step".
//
// Contract test: the files home holds, as Agister ships them.
func TestOutputTheSchemaRejectsFailsTheStep(t *testing.T) {
	t.Parallel()
	f := newRunFixture(modelSettings(t, nil), replies(claudeResult(t, map[string]any{"structured_output": map[string]any{"ok": 1}})))
	f.validator = &validatorSpy{err: errors.New("at /ok: got number, want boolean")}
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 1 {
		t.Fatalf("stderr %q, exit %d; want none, 1", got.stderr, got.code)
	}
	p := modelPrintedOf(t, got)
	if p.Status != "failed" || p.Class == nil || *p.Class != "invalid_output" || p.Reason == nil || *p.Reason != "at /ok: got number, want boolean" {
		t.Errorf("printed %+v, want failed, class invalid_output, the validator's reason", p)
	}
}

// model.feature, "A step given a session is not run yet".
//
// Contract test: the files home holds, as Agister ships them.
func TestAStepGivenASessionIsNotRunYet(t *testing.T) {
	t.Parallel()
	f := newRunFixture(modelSettings(t, map[string]string{"/r/.agister/workflows/resumed.yaml": `schema: agister.workflow/v1alpha1
params:
  q: {}
steps:
  - {name: first, process: ask, agent: claude-opus, inputs: {q: {from: params.q}}}
  - {name: second, process: ask, agent: claude-opus, session: {from: steps.first.session}, inputs: {q: {from: params.q}}}
`}), replies())
	got := f.run(t, "/r", "run", "resumed", "--param", "q=why")
	want := ran{stderr: "agister: the run is refused, and nothing runs:\n  the step \"second\": the session is not run yet\n", code: 1}
	if got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
	if ran := f.supervisor.ran(); len(ran) > 0 {
		t.Errorf("ran %+v, want nothing", ran)
	}
}

// model.feature, "A step alone prints its session by its process's name".
//
// Contract test: the files home holds, as Agister ships them.
func TestAStepAlonePrintsItsSessionByItsProcesssName(t *testing.T) {
	t.Parallel()
	f := newRunFixture(modelSettings(t, nil), replies(`{"type":"system","subtype":"init","session_id":"s1"}`,
		claudeResult(t, map[string]any{"session_id": "", "structured_output": map[string]any{"ok": true}})))
	f.validator = &validatorSpy{}
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if p := modelPrintedOf(t, got); !reflect.DeepEqual(p.Sessions, map[string]string{"ask": "s1"}) {
		t.Errorf("printed the sessions %v, want ask to s1", p.Sessions)
	}
}
