package opencode_test

import (
	"encoding/json"
	"fmt"

	"reflect"

	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	// fresh is the session the fake starts.
)

func TestArguments(t *testing.T) {
	t.Parallel()
	args, err := opencode.Arguments(opencode.TurnRequest(request("hello")), "agister-1")
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
	t.Parallel()
	r := request("hello")
	r.ResumeSessionID = "ses_1"
	args, err := opencode.Arguments(opencode.TurnRequest(r), "agister-1")
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
	t.Parallel()
	args, err := opencode.Arguments(opencode.TurnRequest(opencode.TurnRequest{Prompt: "x", Primitives: []string{"skill"}}), "agister-1")
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
	t.Parallel()
	const schema = "Your final answer is your output: reply with only one JSON value that this JSON Schema accepts, " +
		"with no other text and no Markdown fence.\n<output-schema>\n{\"type\":\"object\"}\n</output-schema>"
	prompt, _ := json.Marshal("Do the thing.\n\n" + schema)
	want := `{"agent":{"agister-1":{"mode":"primary","prompt":` + string(prompt) + `,"permission":{"*":"deny","read":"allow","skill":"allow","bash":"allow"}}}}`
	if got := opencode.Config(opencode.TurnRequest(request("hello")), "agister-1", ""); got != want {
		t.Fatalf("config =\n%s\nwant\n%s", got, want)
	}
	// Neither an instruction nor a schema: no prompt, the same denial.
	want = `{"agent":{"agister-2":{"mode":"primary","permission":{"*":"deny","skill":"allow"}}}}`
	if got := opencode.Config(opencode.TurnRequest(opencode.TurnRequest{Prompt: "x", Primitives: []string{"skill"}}), "agister-2", ""); got != want {
		t.Fatalf("config =\n%s\nwant\n%s", got, want)
	}
	// A resumed turn's config is a fresh turn's.
	r := request("hello")
	r.ResumeSessionID = "ses_1"
	if opencode.Config(opencode.TurnRequest(r), "agister-1", "") != opencode.Config(opencode.TurnRequest(request("hello")), "agister-1", "") {
		t.Fatal("a resumed turn's config differs")
	}
}

// Every tool is a primitive, allowed only when granted, and every variant
// an effort. Nothing but permission rules sets the tools.
func TestToolsAndVariants(t *testing.T) {
	t.Parallel()
	for _, tool := range opencode.Tools {
		r := request("x")
		r.Primitives = []string{"skill", tool}
		if _, err := opencode.Arguments(opencode.TurnRequest(r), "a"); err != nil {
			t.Errorf("tool %s: %v", tool, err)
		}
		var config struct {
			Agent map[string]map[string]json.RawMessage
		}
		if err := json.Unmarshal([]byte(opencode.Config(opencode.TurnRequest(r), "a", "")), &config); err != nil {
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
		if args, err := opencode.Arguments(opencode.TurnRequest(r), "a"); err != nil || !follows(args, "--variant", variant) {
			t.Errorf("effort %s: %q, %v", variant, args, err)
		}
	}
}

// echo is the fake's first line: what it was given.
type echo struct {
	Argv                   []string
	Prompt, Config, System string
	Permission             json.RawMessage
}

func TestSystemPrompt(t *testing.T) {
	t.Parallel()
	if got := opencode.SystemPrompt(opencode.TurnRequest(opencode.TurnRequest{Instruction: "Do the thing."})); got != "Do the thing." {
		t.Fatalf("instruction only: %q", got)
	}
	if got := opencode.SystemPrompt(opencode.TurnRequest(opencode.TurnRequest{})); got != "" {
		t.Fatalf("neither: %q", got)
	}
}

func exited(code int) opencode.Evidence {
	return opencode.Evidence{Exit: &opencode.Exit{Code: &code}}
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

func TestStructuredOutputMustBeJSON(t *testing.T) {
	t.Parallel()
	for _, text := range []string{"not json", "```json\n{}\n```", ""} {
		stream := &opencode.Stream{}
		data, _ := json.Marshal(map[string]any{"type": "text", "sessionID": "ses_1", "part": map[string]any{"type": "text", "text": text}})
		reduce(stream, stepStart, string(data), stopped)
		if turn := stream.Reconcile(clean, true); string(turn.Status) != string(opencode.Failed) || string(turn.Error.Class) != string(opencode.ClassInvalidOutput) {
			t.Errorf("%q: turn = %+v", text, turn)
		}
		// Without a schema, text is text.
		if turn := stream.Reconcile(clean, false); string(turn.Status) != string(opencode.Completed) || turn.Output != nil || turn.Text != text {
			t.Errorf("%q without a schema: turn = %+v", text, turn)
		}
	}
	stream := &opencode.Stream{}
	reduce(stream, stepStart, answer, stopped)
	if turn := stream.Reconcile(clean, true); string(turn.Status) != string(opencode.Completed) || string(turn.Output) != `{"answer":"vm"}` || turn.Text != `{"answer":"vm"}` {
		t.Fatalf("turn = %+v", turn)
	}
}

// Usage and cost are the turn's own, summed over every step it finished.
func TestUsageAndCostAreSummedOverTheTurn(t *testing.T) {
	t.Parallel()
	stream := &opencode.Stream{}
	reduce(stream,
		stepStart,
		`{"type":"tool_use","timestamp":2,"sessionID":"ses_1","part":{"type":"tool","tool":"read","callID":"c1","state":{"status":"completed","input":{"filePath":"a.txt"},"output":"one","time":{"start":1,"end":2}}}}`,
		`{"type":"step_finish","timestamp":2,"sessionID":"ses_1","part":{"type":"step-finish","reason":"tool-calls","cost":0.5,"tokens":{"total":1560,"input":1000,"output":40,"reasoning":0,"cache":{"write":20,"read":500}}}}`,
		stepStart, answer, stopped,
	)
	turn := stream.Reconcile(clean, true)
	if string(turn.Status) != string(opencode.Completed) || turn.ProviderSessionID != "ses_1" {
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
	if turn := stream.Reconcile(exited(1), false); string(turn.Status) != string(opencode.Failed) || turn.CostUSD == nil || *turn.CostUSD != 0.25 || *turn.Usage.InputTokens != 10 {
		t.Fatalf("failed turn = %+v, usage %+v", turn, turn.Usage)
	}
}

// A figure a step does not report is unknown for the turn, never a partial
// sum.
func TestAFigureSomeStepLacksIsUnknown(t *testing.T) {
	t.Parallel()
	stream := &opencode.Stream{}
	reduce(stream,
		stepStart,
		`{"type":"step_finish","sessionID":"ses_1","part":{"type":"step-finish","reason":"tool-calls","tokens":{"input":100,"output":3}}}`,
		stepStart, answer, stopped)
	turn := stream.Reconcile(clean, false)
	if u := turn.Usage; string(turn.Status) != string(opencode.Completed) || u == nil || *u.InputTokens != 110 || *u.OutputTokens != 8 || u.CacheReadTokens != nil || u.ReasoningTokens != nil || turn.CostUSD != nil {
		t.Fatalf("turn = %+v, usage %+v", turn, u)
	}
}

// An error event fails the turn, classified by its message, whatever the
// exit and whatever follows it.
func TestFailuresAreClassified(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name, message string
		class         opencode.Class
	}{
		{"APIError", "429 Too Many Requests: rate limit exceeded", opencode.ClassRateLimited},
		{"APIError", "You exceeded your current quota", opencode.ClassRateLimited},
		{"ProviderAuthError", "401 Unauthorized", opencode.ClassAuth},
		{"ProviderAuthError", "No API key found for opencode-go", opencode.ClassAuth},
		{"APIError", "prompt exceeds the context window", opencode.ClassContextOverflow},
		{"ProviderAuthError", "Invalid credentials for opencode-go", opencode.ClassAuth},
		{"UnknownError", "Unexpected server error. Check server logs for details.", opencode.ClassRuntimeError},
		{"MessageAbortedError", "", opencode.ClassRuntimeError},
	} {
		data, _ := json.Marshal(map[string]any{"type": "error", "sessionID": "ses_1", "error": map[string]any{"name": c.name, "data": map[string]any{"message": c.message}}})
		for _, evidence := range []opencode.Evidence{exited(1), clean} {
			stream := &opencode.Stream{}
			reduce(stream, stepStart, string(data))
			turn := stream.Reconcile(evidence, false)
			if string(turn.Status) != string(opencode.Failed) || string(turn.Error.Class) != string(c.class) || !strings.HasPrefix(turn.Error.Message, "runtime reported error: "+c.name) || !strings.HasSuffix(turn.Error.Message, c.message) {
				t.Errorf("%s %q: %+v", c.name, c.message, turn.Error)
			}
		}
	}
	// An API error is classified by the status it carries apart from its
	// message, which need not name it.
	for _, c := range []struct {
		status  int
		message string
		class   opencode.Class
	}{
		{429, "Too Many Requests", opencode.ClassRateLimited},
		{401, "Invalid token", opencode.ClassAuth},
		{403, "Forbidden", opencode.ClassAuth},
		{500, "Internal Server Error", opencode.ClassRuntimeError},
	} {
		data, _ := json.Marshal(map[string]any{"type": "error", "sessionID": "ses_1", "error": map[string]any{"name": "APIError", "data": map[string]any{"message": c.message, "statusCode": c.status, "isRetryable": false}}})
		stream := &opencode.Stream{}
		reduce(stream, stepStart, string(data))
		turn := stream.Reconcile(exited(1), false)
		if want := fmt.Sprintf("runtime reported error: APIError %d: %s", c.status, c.message); string(turn.Status) != string(opencode.Failed) || string(turn.Error.Class) != string(c.class) || turn.Error.Message != want {
			t.Errorf("%d %q: %+v", c.status, c.message, turn.Error)
		}
	}
	// A step that stopped does not undo an error reported before it.
	stream := &opencode.Stream{}
	reduce(stream, stepStart, failed, stepStart, answer, stopped)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(opencode.Failed) || string(turn.Error.Class) != string(opencode.ClassRuntimeError) {
		t.Fatalf("an error, then a stop: turn = %+v", turn)
	}
	// Agister's own timeout comes before the error it caused.
	stream = &opencode.Stream{}
	reduce(stream, stepStart, failed)
	if turn := stream.Reconcile(opencode.Evidence{TimedOut: true, Exit: &opencode.Exit{Signal: "killed"}}, false); turn.Error == nil || string(turn.Error.Class) != string(opencode.ClassTimeout) {
		t.Fatalf("timed out: turn = %+v", turn)
	}
}

// An error event is reported with its name, its message and the status an
// API error carries apart from the message.
func TestAnErrorIsReportedWithItsStatus(t *testing.T) {
	t.Parallel()
	stream := &opencode.Stream{}
	events := stream.Reduce(`{"type":"error","timestamp":2,"sessionID":"ses_1","error":{"name":"APIError","data":{"message":"Too Many Requests","statusCode":429,"isRetryable":true}}}`)
	if len(events) != 2 || events[1].Kind != "PROVIDER_ERROR" ||
		!reflect.DeepEqual(events[1].Data, map[string]any{"name": "APIError", "message": "APIError 429: Too Many Requests", "status_code": 429}) {
		t.Fatalf("events = %+v", events)
	}
	if want := []opencode.Failure{{Name: "APIError", Message: "Too Many Requests", StatusCode: 429}}; !reflect.DeepEqual(stream.Errors, want) {
		t.Fatalf("errors = %+v", stream.Errors)
	}
	// An error without a status is reported without one.
	if events := stream.Reduce(failed); len(events) != 1 || events[0].Data["status_code"] != nil || events[0].Data["message"] != "UnknownError: Unexpected server error. Check server logs for details." {
		t.Fatalf("events = %+v", events)
	}
}

// Only a final step_finish with reason stop completes a turn. A final step
// that ended otherwise is a failure the runtime reported; a stream that
// ends after a tool-calls step, inside a step or before any is decided by
// the transport.
func TestOnlyAFinalStopCompletesTheTurn(t *testing.T) {
	t.Parallel()
	for _, reason := range []string{"length", "content-filter", "error", "other", ""} {
		stream := &opencode.Stream{}
		reduce(stream, stepStart, answer, step("ses_1", reason))
		if turn := stream.Reconcile(clean, false); string(turn.Status) != string(opencode.Failed) || string(turn.Error.Class) != string(opencode.ClassRuntimeError) || !strings.HasPrefix(turn.Error.Message, "runtime reported ") {
			t.Errorf("reason %q: turn = %+v", reason, turn)
		}
	}
	timedOut := opencode.Evidence{TimedOut: true, Exit: &opencode.Exit{Signal: "killed"}}
	for name, lines := range map[string][]string{
		"no step":                 nil,
		"inside the first step":   {stepStart, answer},
		"after a tool-calls step": {stepStart, answer, step("ses_1", "tool-calls")},
		"inside the next step":    {stepStart, answer, stopped, stepStart, answer},
	} {
		stream := &opencode.Stream{}
		reduce(stream, lines...)
		if turn := stream.Reconcile(clean, true); string(turn.Status) != string(opencode.Lost) || string(turn.Error.Class) != string(opencode.ClassNoResult) || turn.Output != nil {
			t.Errorf("%s, exited: turn = %+v", name, turn)
		}
		if turn := stream.Reconcile(timedOut, true); string(turn.Status) == string(opencode.Completed) || turn.Error == nil || string(turn.Error.Class) != string(opencode.ClassTimeout) {
			t.Errorf("%s, timed out: turn = %+v", name, turn)
		}
		if turn := stream.Reconcile(exited(1), true); string(turn.Status) != string(opencode.Failed) || string(turn.Error.Class) != string(opencode.ClassRuntimeError) || turn.Error.Message != "exit code 1" {
			t.Errorf("%s, exit 1: turn = %+v", name, turn)
		}
	}
	// A non-zero exit after a stop is a failure too, quoting stderr.
	stream := &opencode.Stream{}
	reduce(stream, stepStart, answer, stopped)
	evidence := exited(1)
	evidence.StderrTail = "Error: database is locked\n"
	if turn := stream.Reconcile(evidence, false); string(turn.Status) != string(opencode.Failed) || turn.Error.Message != "exit code 1: Error: database is locked" {
		t.Fatalf("exit 1 after a stop: turn = %+v", turn)
	}
	// So is a process timed out, cancelled or ended by a signal after a
	// stop, whose exit code is unknown.
	for name, c := range map[string]struct {
		evidence opencode.Evidence
		class    opencode.Class
	}{
		"timed out":         {opencode.Evidence{TimedOut: true, Exit: &opencode.Exit{Signal: "SIGTERM"}}, opencode.ClassTimeout},
		"cancelled":         {opencode.Evidence{Aborted: true, Exit: &opencode.Exit{Signal: "SIGTERM"}}, opencode.ClassCancelled},
		"ended by a signal": {opencode.Evidence{Exit: &opencode.Exit{Signal: "SIGTERM"}}, opencode.ClassKilled},
	} {
		stream := &opencode.Stream{}
		reduce(stream, stepStart, `{"type":"text","timestamp":3,"sessionID":"ses_1","part":{"type":"text","text":"{}"}}`, stopped)
		if turn := stream.Reconcile(c.evidence, true); string(turn.Status) == string(opencode.Completed) || turn.Error == nil || string(turn.Error.Class) != string(c.class) || turn.Output != nil {
			t.Errorf("%s after a stop: turn = %+v", name, turn)
		}
	}
}

// OpenCode runs its default agent, which allows everything, when it does
// not find the one named: a turn that ran so fails, whatever it answered.
func TestATurnThatRanAsTheDefaultAgentFails(t *testing.T) {
	t.Parallel()
	stream := &opencode.Stream{}
	reduce(stream, stepStart, answer, stopped)
	evidence := clean
	evidence.StderrTail = "! agent \"agister-1\" not found. Falling back to default agent\n"
	turn := stream.Reconcile(evidence, false)
	if string(turn.Status) != string(opencode.Failed) || string(turn.Error.Class) != string(opencode.ClassRuntimeError) || !strings.Contains(turn.Error.Message, "default agent") || turn.Output != nil {
		t.Fatalf("turn = %+v", turn)
	}
}

// A tool call is reported from its tool_use event, with its whole input,
// numbers as written and however long: started, and finished once its
// state has ended, each once. bash runs commands. Only the event's preview
// is cut.
func TestToolCallsAreReported(t *testing.T) {
	t.Parallel()
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
			if *event.Started != (opencode.ToolCall{ID: "c1", Name: "bash", Input: input, Command: true}) {
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
	t.Parallel()
	stream := &opencode.Stream{}
	reduce(stream,
		stepStart,
		`{"type":"text","sessionID":"ses_1","part":{"type":"text","text":"Let me look at the tests."}}`,
		step("ses_1", "tool-calls"),
		stepStart,
		step("ses_1", "stop"),
	)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(opencode.Completed) || turn.Text != "" {
		t.Fatalf("turn = %+v", turn)
	}
	// A turn that did not complete keeps the last thing it said.
	stream = &opencode.Stream{}
	reduce(stream, stepStart, `{"type":"text","sessionID":"ses_1","part":{"type":"text","text":"Let me look at the tests."}}`, step("ses_1", "tool-calls"))
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(opencode.Lost) || turn.Text != "Let me look at the tests." {
		t.Fatalf("turn = %+v", turn)
	}
}

// A line that is not JSON is reported, and decides nothing.
func TestALineThatIsNotJSONIsReported(t *testing.T) {
	t.Parallel()
	stream := &opencode.Stream{}
	if events := stream.Reduce("not json"); len(events) != 1 || events[0].Kind != "STREAM_PARSE_ERROR" {
		t.Fatalf("events = %+v", events)
	}
	reduce(stream, stepStart, answer, stopped)
	if turn := stream.Reconcile(clean, false); string(turn.Status) != string(opencode.Completed) {
		t.Fatalf("turn = %+v", turn)
	}
}

// A process that could not be recorded fails the turn, whatever the stream
// says: it was killed, and nothing it reported can be trusted to be whole.
func TestUnrecordedProcessFailsTheTurnWhateverTheStreamSays(t *testing.T) {
	t.Parallel()
	stream := &opencode.Stream{}
	reduce(stream, stepStart, answer, stopped)
	turn := stream.Reconcile(opencode.Evidence{RecordError: "disk full"}, false)
	if string(turn.Status) != string(opencode.Failed) || turn.Error == nil || string(turn.Error.Class) != string(opencode.ClassInternal) || !strings.Contains(turn.Error.Message, "disk full") {
		t.Fatalf("turn = %+v", turn)
	}
}
