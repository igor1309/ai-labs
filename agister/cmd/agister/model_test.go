package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"reflect"
	"slices"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
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

// tokens is a reported count of n tokens.
func tokens(n int64) *int64 { return &n }

// claudeReply is a turn on claude-code that exited 0, its reply reply.
func claudeReply(reply claudecode.Reply) func(context.Context, claudecode.Turn) (claudecode.Result, error) {
	return answers[claudecode.Turn](claudecode.Result{Reply: &reply})
}

// codexReply is a turn on codex that exited 0, its reply reply.
func codexReply(reply codex.Reply) func(context.Context, codex.Turn) (codex.Result, error) {
	return answers[codex.Turn](codex.Result{Reply: &reply})
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
	f := newRunFixture(t, modelSettings(t, nil), nil)
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1"})
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	want := []claudecode.Turn{{Message: askMessage, Dir: "/r", Env: append(slices.Clone(environ), "A=1"), Instruction: "i",
		Model: "opus", Effort: "high", Options: []string{"Glob"}, Schema: []byte(answerSchema)}}
	if ran := f.runtimes.claude.ran(); !reflect.DeepEqual(ran, want) {
		t.Errorf("ran\n%#v\nwant\n%#v", ran, want)
	}
}

// model.feature, "A step on codex is given its plan's one option".
//
// Contract test: the files home holds, as Agister ships them.
func TestAStepOnCodexIsGivenItsPlansOneOption(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, modelSettings(t, nil), nil)
	f.runtimes.codex.answer = codexReply(codex.Reply{Output: []byte(`{"ok":true}`), Session: "t1"})
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "codex-sol-61", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d, stdout %s; want none, 0", got.stderr, got.code, got.stdout)
	}
	want := []codex.Turn{{Message: askMessage, Dir: "/r", Env: append(slices.Clone(environ), "A=1"), Instruction: "i",
		Model: "gpt-6.1-sol", Effort: "high", Options: []string{"read-only"}, Schema: []byte(answerSchema)}}
	if ran := f.runtimes.codex.ran(); !reflect.DeepEqual(ran, want) {
		t.Errorf("ran\n%#v\nwant\n%#v", ran, want)
	}
}

// model.feature, "A completed step prints its reply's output and usage".
//
// Contract test: the files home holds, as Agister ships them.
func TestACompletedStepPrintsItsReplysOutputAndUsage(t *testing.T) {
	t.Parallel()
	cost := 0.25
	f := newRunFixture(t, modelSettings(t, nil), nil)
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1", Cost: &cost,
		Usage: claudecode.Usage{Input: tokens(10), Output: tokens(3)}})
	validator := &validatorSpy{}
	f.validator = validator
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
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

// model.feature, "Each step runs on its own agent's runtime": codex is
// asked once bash has run, and claude-code, unanswered, runs nothing.
//
// Contract test: the files home holds, as Agister ships them.
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
	f := newRunFixture(t, settings, echoes)
	var bashFirst bool
	f.runtimes.codex.answer = func(ctx context.Context, turn codex.Turn) (codex.Result, error) {
		bashFirst = len(f.runtimes.bash.ran()) == 1
		return codexReply(codex.Reply{Output: []byte(`{"ok":true}`)})(ctx, turn)
	}
	got := f.run(t, "/r", "run", "mixed", "--param", "what=hi", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d, stdout %s; want none, 0", got.stderr, got.code, got.stdout)
	}
	bashRan, codexRan := f.runtimes.bash.ran(), f.runtimes.codex.ran()
	if len(bashRan) != 1 || bashRan[0].Script != `echo "$what"` || len(codexRan) != 1 || codexRan[0].Message != askMessage || !bashFirst {
		t.Errorf("bash ran %+v and codex %+v, codex after bash %t; want the script of say, then the message of ask", bashRan, codexRan, bashFirst)
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
	f := newRunFixture(t, modelSettings(t, nil), nil)
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":1}`), Session: "s1"})
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
	f := newRunFixture(t, modelSettings(t, map[string]string{"/r/.agister/workflows/resumed.yaml": `schema: agister.workflow/v1alpha1
params:
  q: {}
steps:
  - {name: first, process: ask, agent: claude-opus, inputs: {q: {from: params.q}}}
  - {name: second, process: ask, agent: claude-opus, session: {from: steps.first.session}, inputs: {q: {from: params.q}}}
`}), nil)
	got := f.run(t, "/r", "run", "resumed", "--param", "q=why")
	want := ran{stderr: "agister: the run is refused, and nothing runs:\n  the step \"second\": the session is not run yet\n", code: 1}
	if got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
	if ran := f.runtimes.claude.ran(); len(ran) > 0 {
		t.Errorf("ran %+v, want nothing", ran)
	}
}

// model.feature, "A step alone prints its session by its process's name".
//
// Contract test: the files home holds, as Agister ships them.
func TestAStepAlonePrintsItsSessionByItsProcesssName(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, modelSettings(t, nil), nil)
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1"})
	f.validator = &validatorSpy{}
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want none, 0", got.stderr, got.code)
	}
	if p := modelPrintedOf(t, got); !reflect.DeepEqual(p.Sessions, map[string]string{"ask": "s1"}) {
		t.Errorf("printed the sessions %v, want ask to s1", p.Sessions)
	}
}
