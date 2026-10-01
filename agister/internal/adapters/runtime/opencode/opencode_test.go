package opencode_test

import (
	"context"
	"encoding/json"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// fresh is the session the fake starts.
const fresh = "ses_f06fe64c3ffeLyBkwYK7e1GfJs"

func request(prompt string) app.TurnRequest {
	return app.TurnRequest{
		Prompt:       prompt,
		Instruction:  "Do the thing.",
		Primitives:   []string{"read", "skill", "bash"},
		Model:        "opencode-go/minimax-m3",
		Effort:       "high",
		Timeout:      time.Minute,
		OutputSchema: json.RawMessage(`{"type":"object"}`),
	}
}

func runner(t *testing.T) *opencode.Runner {
	return &opencode.Runner{Command: runtimetest.Binary(t, "fakeopencode"), KillGrace: 200 * time.Millisecond}
}

func TestConformance(t *testing.T) {
	runtimetest.Conformance(t, runtimetest.Subject{
		New: func(command string) app.TurnRunner {
			return &opencode.Runner{Command: command, KillGrace: 200 * time.Millisecond}
		},
		Fake:      runtimetest.Binary(t, "fakeopencode"),
		Contract:  opencode.Contract,
		ToolCalls: true,
		Request:   request,
	})
}

func TestArguments(t *testing.T) {
	args, err := opencode.Arguments(request("hello"), "agister-1")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"run", "--format", "json", "--pure", "--agent", "agister-1", "-m", "opencode-go/minimax-m3", "--variant", "high"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
}

// A continuation resumes the session by ID, with every setting of a fresh
// turn.
func TestResumeArguments(t *testing.T) {
	r := request("hello")
	r.ResumeSessionID = "ses_1"
	args, err := opencode.Arguments(r, "agister-1")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"run", "--format", "json", "--pure", "--agent", "agister-1", "-s", "ses_1", "-m", "opencode-go/minimax-m3", "--variant", "high"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
}

// No model or effort leaves OpenCode's own; the agent is always the
// generated one, and no flag approves what it does not allow.
func TestDefaults(t *testing.T) {
	args, err := opencode.Arguments(app.TurnRequest{Prompt: "x", Primitives: []string{"skill"}}, "agister-1")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"run", "--format", "json", "--pure", "--agent", "agister-1"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args =\n%q\nwant\n%q", args, want)
	}
}

// The generated agent is the whole inline config: a primary agent whose
// prompt is the instruction and the schema, and whose permission denies
// everything first, then allows the granted primitives and nothing else.
// The order is the rules' order, so it is asserted on the text.
func TestConfigIsTheGeneratedAgent(t *testing.T) {
	const schema = "Your final answer is your output: reply with only one JSON value that this JSON Schema accepts, " +
		"with no other text and no Markdown fence.\n<output-schema>\n{\"type\":\"object\"}\n</output-schema>"
	prompt, _ := json.Marshal("Do the thing.\n\n" + schema)
	want := `{"agent":{"agister-1":{"mode":"primary","prompt":` + string(prompt) + `,"permission":{"*":"deny","read":"allow","skill":"allow","bash":"allow"}}}}`
	if got := opencode.Config(request("hello"), "agister-1"); got != want {
		t.Fatalf("config =\n%s\nwant\n%s", got, want)
	}
	// Neither an instruction nor a schema: no prompt, the same denial.
	want = `{"agent":{"agister-2":{"mode":"primary","permission":{"*":"deny","skill":"allow"}}}}`
	if got := opencode.Config(app.TurnRequest{Prompt: "x", Primitives: []string{"skill"}}, "agister-2"); got != want {
		t.Fatalf("config =\n%s\nwant\n%s", got, want)
	}
	// A resumed turn's config is a fresh turn's.
	r := request("hello")
	r.ResumeSessionID = "ses_1"
	if opencode.Config(r, "agister-1") != opencode.Config(request("hello"), "agister-1") {
		t.Fatal("a resumed turn's config differs")
	}
}

// Every tool is a primitive, allowed only when granted, and every variant
// an effort. Nothing but permission rules sets the tools.
func TestToolsAndVariants(t *testing.T) {
	for _, tool := range opencode.Tools {
		r := request("x")
		r.Primitives = []string{"skill", tool}
		if _, err := opencode.Arguments(r, "a"); err != nil {
			t.Errorf("tool %s: %v", tool, err)
		}
		var config struct {
			Agent map[string]map[string]json.RawMessage
		}
		if err := json.Unmarshal([]byte(opencode.Config(r, "a")), &config); err != nil {
			t.Fatal(err)
		}
		agent := config.Agent["a"]
		var permission map[string]string
		_ = json.Unmarshal(agent["permission"], &permission)
		want := map[string]string{"*": "deny", "skill": "allow", tool: "allow"}
		if !reflect.DeepEqual(permission, want) || !strings.HasPrefix(string(agent["permission"]), `{"*":"deny",`) || agent["tools"] != nil || len(config.Agent) != 1 {
			t.Errorf("tool %s: agent = %s", tool, agent)
		}
	}
	for _, variant := range []string{"none", "minimal", "low", "medium", "high", "xhigh", "max"} {
		r := request("x")
		r.Effort = variant
		if args, err := opencode.Arguments(r, "a"); err != nil || !follows(args, "--variant", variant) {
			t.Errorf("effort %s: %q, %v", variant, args, err)
		}
	}
}

func follows(args []string, flag, value string) bool {
	for i := range args[:len(args)-1] {
		if args[i] == flag && args[i+1] == value {
			return true
		}
	}
	return false
}

// echo is the fake's first line: what it was given.
type echo struct {
	Argv                   []string
	Prompt, Config, System string
	Permission             json.RawMessage
}

func echoed(t *testing.T, sink *runtimetest.Recorder) echo {
	t.Helper()
	var e echo
	if err := json.Unmarshal([]byte(sink.Lines[0]), &e); err != nil {
		t.Fatal(err)
	}
	return e
}

// A turn gives OpenCode the generated agent in OPENCODE_CONFIG_CONTENT and
// names it with --agent; the prompt goes on stdin. The agent's name is the
// turn's own, so no agent a config defines can merge with it.
func TestATurnRunsAsItsOwnGeneratedAgent(t *testing.T) {
	name := regexp.MustCompile(`^agister-[0-9a-f]{16}$`)
	var names []string
	for range 2 {
		sink := &runtimetest.Recorder{}
		r := request("hello SCENARIO:approve")
		if turn := runner(t).RunTurn(context.Background(), r, sink); turn.Status != run.Completed {
			t.Fatalf("turn = %+v", turn)
		}
		e := echoed(t, sink)
		agent := e.Argv[5]
		if e.Argv[4] != "--agent" || !name.MatchString(agent) || e.Config != opencode.Config(r, agent) {
			t.Fatalf("argv %q, config %s", e.Argv, e.Config)
		}
		if e.Prompt != "hello SCENARIO:approve" || !strings.HasPrefix(e.System, "Do the thing.\n\n") ||
			!strings.Contains(e.System, "<output-schema>\n{\"type\":\"object\"}\n</output-schema>") ||
			string(e.Permission) != `{"*":"deny","read":"allow","skill":"allow","bash":"allow"}` {
			t.Fatalf("echo = %+v", e)
		}
		names = append(names, agent)
	}
	if names[0] == names[1] {
		t.Fatalf("two turns ran as the same agent %s", names[0])
	}
}

// A turn's inline config replaces one the environment already holds.
func TestTheConfigReplacesAnInheritedOne(t *testing.T) {
	t.Setenv(opencode.ConfigVariable, `{"agent":{"build":{"permission":{"*":"allow"}}}}`)
	sink := &runtimetest.Recorder{}
	if turn := runner(t).RunTurn(context.Background(), request("SCENARIO:approve"), sink); turn.Status != run.Completed {
		t.Fatalf("turn = %+v", turn)
	}
	if e := echoed(t, sink); strings.Contains(e.Config, "build") || !strings.Contains(e.Config, e.Argv[5]) {
		t.Fatalf("config = %s", e.Config)
	}
}

// OpenCode lists and loads a skill with its skill tool only: a turn not
// granted it is refused before OpenCode starts.
func TestRefusesATurnThatCannotUseASkill(t *testing.T) {
	for _, primitives := range [][]string{nil, {}, {"read", "grep", "glob"}, {"bash"}, {"edit"}} {
		r := request("x")
		r.Primitives = primitives
		if args, err := opencode.Arguments(r, "a"); err == nil || err.Error() != "opencode/1 needs skill to use the repository's skills (ADR-006)" {
			t.Errorf("primitives %q: args %q, err = %v", primitives, args, err)
		}
	}
	r := request("x")
	r.Primitives = []string{"read"}
	sink := &runtimetest.Recorder{}
	turn := runner(t).RunTurn(context.Background(), r, sink)
	if turn.Status != run.Failed || turn.Error.Class != run.ClassInternal || len(sink.Processes) != 0 {
		t.Fatalf("turn = %+v, processes %v", turn, sink.Processes)
	}
}

func TestRejectsWhatItCannotHonour(t *testing.T) {
	r := request("x")
	limit := 1.0
	r.MaxCostUSD = &limit
	if _, err := opencode.Arguments(r, "a"); err == nil || err.Error() != "opencode/1 cannot limit cost" {
		t.Fatalf("cost limit: err = %v", err)
	}
	// write is no permission of its own, list no tool of 1.18.33, and the
	// rest are tools a call is never given.
	for _, primitives := range [][]string{{"Bash"}, {"skill", "write"}, {"skill", "list"}, {"skill", "task"}, {"skill", "todowrite"}, {"skill", "question"}, {"skill", "*"}, {""}} {
		r := request("x")
		r.Primitives = primitives
		if _, err := opencode.Arguments(r, "a"); err == nil || !strings.Contains(err.Error(), "opencode/1 has no tool") {
			t.Errorf("primitives %q: err = %v", primitives, err)
		}
	}
	r = request("x")
	r.Effort = "extreme"
	if _, err := opencode.Arguments(r, "a"); err == nil || !strings.Contains(err.Error(), "opencode/1 has no variant") {
		t.Fatalf("an unknown variant: err = %v", err)
	}
	// Refused before OpenCode starts.
	r = request("x")
	r.MaxCostUSD = &limit
	sink := &runtimetest.Recorder{}
	turn := runner(t).RunTurn(context.Background(), r, sink)
	if turn.Status != run.Failed || turn.Error.Class != run.ClassInternal || len(sink.Processes) != 0 {
		t.Fatalf("turn = %+v, processes %v", turn, sink.Processes)
	}
}

func TestSystemPrompt(t *testing.T) {
	if got := opencode.SystemPrompt(app.TurnRequest{Instruction: "Do the thing."}); got != "Do the thing." {
		t.Fatalf("instruction only: %q", got)
	}
	if got := opencode.SystemPrompt(app.TurnRequest{}); got != "" {
		t.Fatalf("neither: %q", got)
	}
}

func TestIdentity(t *testing.T) {
	identity, err := opencode.New(runtimetest.Binary(t, "fakeopencode")).Identity(context.Background())
	want := app.RuntimeIdentity{Contract: "opencode/1", Version: "1.18.33", Resume: true, ResumeWhereItRan: true, ToolCalls: true, SkillTools: []string{"skill"}}
	if err != nil || !reflect.DeepEqual(identity, want) {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
}

// A fresh turn reports the session OpenCode started, and a later turn of
// the call resumes it by that ID.
func TestALaterTurnResumesTheSession(t *testing.T) {
	sink := &runtimetest.Recorder{}
	turn := runner(t).RunTurn(context.Background(), request("SCENARIO:approve"), sink)
	if turn.Status != run.Completed || turn.ProviderSessionID != fresh {
		t.Fatalf("fresh turn = %+v", turn)
	}
	next := request("SCENARIO:approve")
	next.ResumeSessionID = turn.ProviderSessionID
	sink = &runtimetest.Recorder{}
	turn = runner(t).RunTurn(context.Background(), next, sink)
	if turn.Status != run.Completed || turn.ProviderSessionID != fresh || !follows(echoed(t, sink).Argv, "-s", fresh) {
		t.Fatalf("resumed turn = %+v", turn)
	}
}

func exited(code int) supervisor.Evidence {
	return supervisor.Evidence{Exit: &run.Exit{Code: &code}}
}

var clean = exited(0)

func reduce(stream *opencode.Stream, lines ...string) {
	for _, line := range lines {
		stream.Reduce(line)
	}
}

const (
	stepStart = `{"type":"step_start","timestamp":1,"sessionID":"ses_1","part":{"type":"step-start"}}`
	answer    = `{"type":"text","timestamp":3,"sessionID":"ses_1","part":{"type":"text","text":"{\"answer\":\"vm\"}"}}`
	stopped   = `{"type":"step_finish","timestamp":4,"sessionID":"ses_1","part":{"type":"step-finish","reason":"stop","cost":0.25,"tokens":{"total":26,"input":10,"output":5,"reasoning":5,"cache":{"write":2,"read":4}}}}`
	failed    = `{"type":"error","timestamp":2,"sessionID":"ses_1","error":{"name":"UnknownError","data":{"message":"Unexpected server error. Check server logs for details.","ref":"err_1"}}}`
)

func step(session, reason string) string {
	return `{"type":"step_finish","timestamp":4,"sessionID":"` + session + `","part":{"type":"step-finish","reason":"` + reason + `","cost":0,"tokens":{"total":0,"input":0,"output":0,"reasoning":0,"cache":{"write":0,"read":0}}}}`
}

// A resume turn must report the session it resumed: another one, or none
// by the end of the turn, breaks the contract of resuming in place.
func TestResumeReportingAnotherSessionFails(t *testing.T) {
	for name, lines := range map[string][]string{
		"another session": {`{"type":"step_start","sessionID":"ses_2","part":{"type":"step-start"}}`, step("ses_2", "stop")},
		"no session":      {`{"type":"step_finish","part":{"type":"step-finish","reason":"stop"}}`},
	} {
		stream := &opencode.Stream{ResumedSessionID: "ses_1"}
		reduce(stream, lines...)
		if turn := stream.Reconcile(clean, false); turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError || !strings.Contains(turn.Error.Message, "resumed session ses_1") {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
	stream := &opencode.Stream{ResumedSessionID: "ses_1"}
	reduce(stream, stepStart, answer, stopped)
	if turn := stream.Reconcile(clean, false); turn.Status != run.Completed || turn.ProviderSessionID != "ses_1" {
		t.Fatalf("the same session: turn = %+v", turn)
	}
}

func TestStructuredOutputMustBeJSON(t *testing.T) {
	for _, text := range []string{"not json", "```json\n{}\n```", ""} {
		stream := &opencode.Stream{}
		data, _ := json.Marshal(map[string]any{"type": "text", "sessionID": "ses_1", "part": map[string]any{"type": "text", "text": text}})
		reduce(stream, stepStart, string(data), stopped)
		if turn := stream.Reconcile(clean, true); turn.Status != run.Failed || turn.Error.Class != run.ClassInvalidOutput {
			t.Errorf("%q: turn = %+v", text, turn)
		}
		// Without a schema, text is text.
		if turn := stream.Reconcile(clean, false); turn.Status != run.Completed || turn.Output != nil || turn.Text != text {
			t.Errorf("%q without a schema: turn = %+v", text, turn)
		}
	}
	stream := &opencode.Stream{}
	reduce(stream, stepStart, answer, stopped)
	if turn := stream.Reconcile(clean, true); turn.Status != run.Completed || string(turn.Output) != `{"answer":"vm"}` || turn.Text != `{"answer":"vm"}` {
		t.Fatalf("turn = %+v", turn)
	}
}

// Usage and cost are the turn's own, summed over every step it finished.
func TestUsageAndCostAreSummedOverTheTurn(t *testing.T) {
	stream := &opencode.Stream{}
	reduce(stream,
		stepStart,
		`{"type":"tool_use","timestamp":2,"sessionID":"ses_1","part":{"type":"tool","tool":"read","callID":"c1","state":{"status":"completed","input":{"filePath":"a.txt"},"output":"one","time":{"start":1,"end":2}}}}`,
		`{"type":"step_finish","timestamp":2,"sessionID":"ses_1","part":{"type":"step-finish","reason":"tool-calls","cost":0.5,"tokens":{"total":1560,"input":1000,"output":40,"reasoning":0,"cache":{"write":20,"read":500}}}}`,
		stepStart, answer, stopped,
	)
	turn := stream.Reconcile(clean, true)
	if turn.Status != run.Completed || turn.ProviderSessionID != "ses_1" {
		t.Fatalf("turn = %+v", turn)
	}
	u := turn.Usage
	if u == nil || *u.InputTokens != 1010 || *u.OutputTokens != 45 || *u.CacheReadTokens != 504 || *u.CacheWriteTokens != 22 || *u.ReasoningTokens != 5 {
		t.Fatalf("usage = %+v", u)
	}
	if turn.CostUSD == nil || *turn.CostUSD != 0.75 {
		t.Fatalf("cost = %v", turn.CostUSD)
	}
	// A turn that fails after a step has still cost that step.
	stream = &opencode.Stream{}
	reduce(stream, stepStart, stopped, failed)
	if turn := stream.Reconcile(exited(1), false); turn.Status != run.Failed || turn.CostUSD == nil || *turn.CostUSD != 0.25 || *turn.Usage.InputTokens != 10 {
		t.Fatalf("failed turn = %+v, usage %+v", turn, turn.Usage)
	}
}

// A figure a step does not report is unknown for the turn, never a partial
// sum.
func TestAFigureSomeStepLacksIsUnknown(t *testing.T) {
	stream := &opencode.Stream{}
	reduce(stream,
		stepStart,
		`{"type":"step_finish","sessionID":"ses_1","part":{"type":"step-finish","reason":"tool-calls","tokens":{"input":100,"output":3}}}`,
		stepStart, answer, stopped)
	turn := stream.Reconcile(clean, false)
	if u := turn.Usage; turn.Status != run.Completed || u == nil || *u.InputTokens != 110 || *u.OutputTokens != 8 || u.CacheReadTokens != nil || u.ReasoningTokens != nil || turn.CostUSD != nil {
		t.Fatalf("turn = %+v, usage %+v", turn, u)
	}
}

// An error event fails the turn, classified by its message, whatever the
// exit and whatever follows it.
func TestFailuresAreClassified(t *testing.T) {
	for _, c := range []struct {
		name, message string
		class         run.Class
	}{
		{"APIError", "429 Too Many Requests: rate limit exceeded", run.ClassRateLimited},
		{"APIError", "You exceeded your current quota", run.ClassRateLimited},
		{"ProviderAuthError", "401 Unauthorized", run.ClassAuth},
		{"ProviderAuthError", "No API key found for opencode-go", run.ClassAuth},
		{"APIError", "prompt exceeds the context window", run.ClassContextOverflow},
		{"UnknownError", "Unexpected server error. Check server logs for details.", run.ClassRuntimeError},
		{"MessageAbortedError", "", run.ClassRuntimeError},
	} {
		data, _ := json.Marshal(map[string]any{"type": "error", "sessionID": "ses_1", "error": map[string]any{"name": c.name, "data": map[string]any{"message": c.message}}})
		for _, evidence := range []supervisor.Evidence{exited(1), clean} {
			stream := &opencode.Stream{}
			reduce(stream, stepStart, string(data))
			turn := stream.Reconcile(evidence, false)
			if turn.Status != run.Failed || turn.Error.Class != c.class || !strings.HasPrefix(turn.Error.Message, "runtime reported error: "+c.name) || !strings.HasSuffix(turn.Error.Message, c.message) {
				t.Errorf("%s %q: %+v", c.name, c.message, turn.Error)
			}
		}
	}
	// A step that stopped does not undo an error reported before it.
	stream := &opencode.Stream{}
	reduce(stream, stepStart, failed, stepStart, answer, stopped)
	if turn := stream.Reconcile(clean, false); turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError {
		t.Fatalf("an error, then a stop: turn = %+v", turn)
	}
	// Agister's own timeout comes before the error it caused.
	stream = &opencode.Stream{}
	reduce(stream, stepStart, failed)
	if turn := stream.Reconcile(supervisor.Evidence{TimedOut: true, Exit: &run.Exit{Signal: "killed"}}, false); turn.Error == nil || turn.Error.Class != run.ClassTimeout {
		t.Fatalf("timed out: turn = %+v", turn)
	}
}

// Only a final step_finish with reason stop completes a turn. A final step
// that ended otherwise is a failure the runtime reported; a stream that
// ends after a tool-calls step, inside a step or before any is decided by
// the transport.
func TestOnlyAFinalStopCompletesTheTurn(t *testing.T) {
	for _, reason := range []string{"length", "content-filter", "error", "other", ""} {
		stream := &opencode.Stream{}
		reduce(stream, stepStart, answer, step("ses_1", reason))
		if turn := stream.Reconcile(clean, false); turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError || !strings.HasPrefix(turn.Error.Message, "runtime reported ") {
			t.Errorf("reason %q: turn = %+v", reason, turn)
		}
	}
	timedOut := supervisor.Evidence{TimedOut: true, Exit: &run.Exit{Signal: "killed"}}
	for name, lines := range map[string][]string{
		"no step":                 nil,
		"inside the first step":   {stepStart, answer},
		"after a tool-calls step": {stepStart, answer, step("ses_1", "tool-calls")},
		"inside the next step":    {stepStart, answer, stopped, stepStart, answer},
	} {
		stream := &opencode.Stream{}
		reduce(stream, lines...)
		if turn := stream.Reconcile(clean, true); turn.Status != run.Lost || turn.Error.Class != run.ClassNoResult || turn.Output != nil {
			t.Errorf("%s, exited: turn = %+v", name, turn)
		}
		if turn := stream.Reconcile(timedOut, true); turn.Status == run.Completed || turn.Error == nil || turn.Error.Class != run.ClassTimeout {
			t.Errorf("%s, timed out: turn = %+v", name, turn)
		}
		if turn := stream.Reconcile(exited(1), true); turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError || turn.Error.Message != "exit code 1" {
			t.Errorf("%s, exit 1: turn = %+v", name, turn)
		}
	}
	// A non-zero exit after a stop is a failure too, quoting stderr.
	stream := &opencode.Stream{}
	reduce(stream, stepStart, answer, stopped)
	evidence := exited(1)
	evidence.StderrTail = "Error: database is locked\n"
	if turn := stream.Reconcile(evidence, false); turn.Status != run.Failed || turn.Error.Message != "exit code 1: Error: database is locked" {
		t.Fatalf("exit 1 after a stop: turn = %+v", turn)
	}
}

// OpenCode runs its default agent, which allows everything, when it does
// not find the one named: a turn that ran so fails, whatever it answered.
func TestATurnThatRanAsTheDefaultAgentFails(t *testing.T) {
	stream := &opencode.Stream{}
	reduce(stream, stepStart, answer, stopped)
	evidence := clean
	evidence.StderrTail = "! agent \"agister-1\" not found. Falling back to default agent\n"
	turn := stream.Reconcile(evidence, false)
	if turn.Status != run.Failed || turn.Error.Class != run.ClassRuntimeError || !strings.Contains(turn.Error.Message, "default agent") || turn.Output != nil {
		t.Fatalf("turn = %+v", turn)
	}
}

// A tool call is reported from its tool_use event, with its whole input,
// numbers as written and however long: started, and finished once its
// state has ended, each once. bash runs commands. Only the event's preview
// is cut.
func TestToolCallsAreReported(t *testing.T) {
	stream := &opencode.Stream{}
	long := strings.Repeat("x", 1000)
	input := `{"command":"ls ` + long + `","timeout":12345678901234567890}`
	use := func(id, tool, status, input string) string {
		return `{"type":"tool_use","timestamp":2,"sessionID":"ses_1","part":{"type":"tool","tool":"` + tool + `","callID":"` + id + `","state":{"status":"` + status + `","input":` + input + `}}}`
	}
	events := stream.Reduce(use("c1", "bash", "completed", input))
	var trace []string
	for _, event := range events {
		switch {
		case event.Started != nil:
			if *event.Started != (app.ToolCall{ID: "c1", Name: "bash", Input: input, Command: true}) {
				t.Fatalf("started = %+v", event.Started)
			}
			trace = append(trace, "started")
		case event.Finished != "":
			trace = append(trace, "finished "+event.Finished)
		default:
			if strings.HasPrefix(event.Kind, "TOOL_") && (event.Data["tool_use_id"] != "c1" || event.Data["input"] == input) {
				t.Fatalf("event = %+v", event)
			}
			trace = append(trace, event.Kind)
		}
	}
	// The first event of the stream also binds the session.
	if want := []string{"PROVIDER_SESSION_BOUND", "TOOL_REQUESTED", "started", "TOOL_RESULT", "finished c1"}; !reflect.DeepEqual(trace, want) {
		t.Fatalf("trace = %q", trace)
	}
	// A call still running is started only; its end finishes it, once.
	events = stream.Reduce(use("c2", "read", "running", `{"filePath":"a.txt"}`))
	if len(events) != 2 || events[1].Started == nil || events[1].Started.Command {
		t.Fatalf("running: events = %+v", events)
	}
	events = stream.Reduce(use("c2", "read", "error", `{"filePath":"a.txt"}`))
	if len(events) != 2 || events[0].Kind != "TOOL_RESULT" || events[0].Data["is_error"] != true || events[1].Finished != "c2" {
		t.Fatalf("error: events = %+v", events)
	}
	if events = stream.Reduce(use("c2", "read", "error", `{"filePath":"a.txt"}`)); len(events) != 0 {
		t.Fatalf("repeated: events = %+v", events)
	}
}

// A completed turn's text is its final step's, never the commentary of an
// earlier one, even when the final one says nothing.
func TestACompletedTurnsTextIsTheFinalSteps(t *testing.T) {
	stream := &opencode.Stream{}
	reduce(stream,
		stepStart,
		`{"type":"text","sessionID":"ses_1","part":{"type":"text","text":"Let me look at the tests."}}`,
		step("ses_1", "tool-calls"),
		stepStart,
		step("ses_1", "stop"),
	)
	if turn := stream.Reconcile(clean, false); turn.Status != run.Completed || turn.Text != "" {
		t.Fatalf("turn = %+v", turn)
	}
	// A turn that did not complete keeps the last thing it said.
	stream = &opencode.Stream{}
	reduce(stream, stepStart, `{"type":"text","sessionID":"ses_1","part":{"type":"text","text":"Let me look at the tests."}}`, step("ses_1", "tool-calls"))
	if turn := stream.Reconcile(clean, false); turn.Status != run.Lost || turn.Text != "Let me look at the tests." {
		t.Fatalf("turn = %+v", turn)
	}
}

// A line that is not JSON is reported, and decides nothing.
func TestALineThatIsNotJSONIsReported(t *testing.T) {
	stream := &opencode.Stream{}
	if events := stream.Reduce("not json"); len(events) != 1 || events[0].Kind != "STREAM_PARSE_ERROR" {
		t.Fatalf("events = %+v", events)
	}
	reduce(stream, stepStart, answer, stopped)
	if turn := stream.Reconcile(clean, false); turn.Status != run.Completed {
		t.Fatalf("turn = %+v", turn)
	}
}

// A process that could not be recorded fails the turn, whatever the stream
// says: it was killed, and nothing it reported can be trusted to be whole.
func TestUnrecordedProcessFailsTheTurnWhateverTheStreamSays(t *testing.T) {
	stream := &opencode.Stream{}
	reduce(stream, stepStart, answer, stopped)
	turn := stream.Reconcile(supervisor.Evidence{RecordError: "disk full"}, false)
	if turn.Status != run.Failed || turn.Error == nil || turn.Error.Class != run.ClassInternal || !strings.Contains(turn.Error.Message, "disk full") {
		t.Fatalf("turn = %+v", turn)
	}
}
