package claudecode_test

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
)

// supervisorSpy answers in place of the supervisor: it keeps each program
// it is asked to run, its line function left out, gives that function the
// lines its test gives, in order, and gives the result and the error its
// test gives.
type supervisorSpy struct {
	lines  []string
	result claudecode.Ended
	err    error
	asked  []claudecode.Program
}

func (s *supervisorSpy) Run(_ context.Context, program claudecode.Program) (claudecode.Ended, error) {
	for _, line := range s.lines {
		program.Line(line)
	}
	program.Line = nil
	s.asked = append(s.asked, program)
	return s.result, s.err
}

// wrapper is the claude-code wrapper over spy.
func wrapper(t *testing.T, spy *supervisorSpy) *claudecode.Wrapper {
	t.Helper()
	w, err := claudecode.New(spy)
	if err != nil {
		t.Fatal(err)
	}
	return w
}

// reply is the reply of a turn, given schema, over spy's lines and result.
func reply(t *testing.T, spy *supervisorSpy, schema []byte) claudecode.Reply {
	t.Helper()
	got, err := wrapper(t, spy).Run(context.Background(), claudecode.Turn{Message: "m", Schema: schema})
	if err != nil {
		t.Fatal(err)
	}
	if got.Ended != spy.result {
		t.Errorf("ended %+v, want %+v", got.Ended, spy.result)
	}
	if got.Reply == nil {
		t.Fatal("no reply")
	}
	return *got.Reply
}

// Lines as claude -p --output-format stream-json --verbose writes them.
const (
	initLine            = `{"type":"system","subtype":"init","cwd":"/r","session_id":"s1","tools":["Read","Skill"],"model":"claude-opus-4-5","permissionMode":"dontAsk"}`
	rejectedLine        = `{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1760000000},"session_id":"s1"}`
	allowedLine         = `{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"},"session_id":"s1"}`
	toolUseLine         = `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/r/a"}}]},"session_id":"s1"}`
	toolDoneLine        = `{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"a"}]},"session_id":"s1"}`
	notJSONLine         = `{broken`
	duringExecutionLine = `{"type":"result","subtype":"error_during_execution","is_error":true,"session_id":"s1","errors":["the request was rejected"]}`
)

// assistant is an assistant event's line, of a text block.
func assistant(text string) string {
	return fmt.Sprintf(`{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"..."},{"type":"text","text":%q}]},"session_id":"s1"}`, text)
}

func ptr[T any](v T) *T { return &v }

// facts.feature, "Its facts".
func TestItsFacts(t *testing.T) {
	t.Parallel()
	want := claudecode.Facts{
		Contract:     "claude-code/3",
		Schema:       true,
		Session:      true,
		Skills:       true,
		Model:        true,
		Efforts:      []string{"low", "medium", "high", "xhigh", "max"},
		ToolCalls:    true,
		ToolCommands: true,
		Inputs:       claudecode.InMessage,
	}
	if got := wrapper(t, &supervisorSpy{}).Facts(); !reflect.DeepEqual(got, want) {
		t.Errorf("facts\n got %+v\nwant %+v", got, want)
	}
}

// turn.feature, "A turn asks the supervisor for claude, the message on
// stdin", "What is not given is left out" and "Skill is given once".
func TestATurnAsksTheSupervisorForClaudeTheMessageOnStdin(t *testing.T) {
	t.Parallel()
	head := []string{"-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk"}
	args := func(more ...string) []string { return append(append([]string{}, head...), more...) }
	for _, c := range []struct {
		name string
		turn claudecode.Turn
		want claudecode.Program
	}{
		{
			name: "all given",
			turn: claudecode.Turn{Message: "m", Dir: "/r", Env: []string{"goal=g"}, Instruction: "i", Model: "opus", Effort: "high",
				Options: []string{"Read", "Grep"}, Schema: []byte("{}")},
			want: claudecode.Program{Name: "claude", Dir: "/r", Env: []string{"goal=g"}, Stdin: "m", Args: args(
				"--tools=Read,Grep,Skill", "--allowedTools=Read,Grep,Skill", "--strict-mcp-config",
				"--model", "opus", "--effort", "high", "--append-system-prompt", "i", "--json-schema", "{}")},
		},
		{
			name: "nothing else given",
			turn: claudecode.Turn{Message: "m"},
			want: claudecode.Program{Name: "claude", Stdin: "m", Args: args("--tools=Skill", "--allowedTools=Skill", "--strict-mcp-config")},
		},
		{
			name: "Skill given",
			turn: claudecode.Turn{Message: "m", Options: []string{"Skill", "Read"}},
			want: claudecode.Program{Name: "claude", Stdin: "m", Args: args("--tools=Skill,Read", "--allowedTools=Skill,Read", "--strict-mcp-config")},
		},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &supervisorSpy{}
			if _, err := wrapper(t, spy).Run(context.Background(), c.turn); err != nil {
				t.Fatal(err)
			}
			if want := []claudecode.Program{c.want}; !reflect.DeepEqual(spy.asked, want) {
				t.Errorf("asked\n got %+v\nwant %+v", spy.asked, want)
			}
		})
	}
}

// Skill is added to a copy of the options, never into room the caller's
// slice has beyond them.
func TestSkillIsNotWrittenIntoTheCallersOptions(t *testing.T) {
	t.Parallel()
	room := []string{"Read", "kept"}
	if _, err := wrapper(t, &supervisorSpy{}).Run(context.Background(), claudecode.Turn{Message: "m", Options: room[:1]}); err != nil {
		t.Fatal(err)
	}
	if room[1] != "kept" {
		t.Errorf("the caller's slice became %q", room)
	}
}

// turn.feature, "A successful result is the reply", with a schema given
// and none, and the events the reply does not read among its lines.
func TestASuccessfulResultIsTheReply(t *testing.T) {
	t.Parallel()
	for _, schema := range [][]byte{nil, []byte(`{"type":"object"}`)} {
		t.Run(fmt.Sprintf("schema %q", schema), func(t *testing.T) {
			t.Parallel()
			spy := &supervisorSpy{lines: []string{
				initLine, allowedLine, notJSONLine, "", toolUseLine, toolDoneLine, assistant("thinking"),
				`{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"s1","structured_output":{"ok":true},"total_cost_usd":0.25,"usage":{"input_tokens":10,"output_tokens":3}}`,
			}}
			want := claudecode.Reply{Text: "done", Output: []byte(`{"ok":true}`), Session: "s1", Cost: ptr(0.25),
				Usage: claudecode.Usage{Input: ptr(int64(10)), Output: ptr(int64(3))}}
			if got := reply(t, spy, schema); !reflect.DeepEqual(got, want) {
				t.Errorf("reply\n got %+v\nwant %+v", got, want)
			}
		})
	}
}

// The usage reports each count it gives, cache read and cache write
// included, and a cost of 0 is a cost reported.
func TestTheUsageReportsEachCountItGives(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{
		`{"type":"result","subtype":"success","is_error":false,"result":"done","total_cost_usd":0,"usage":{"input_tokens":1,"output_tokens":2,"cache_read_input_tokens":3,"cache_creation_input_tokens":4}}`,
	}}
	got := reply(t, spy, nil)
	want := claudecode.Usage{Input: ptr(int64(1)), Output: ptr(int64(2)), CacheRead: ptr(int64(3)), CacheWrite: ptr(int64(4))}
	if !reflect.DeepEqual(got.Usage, want) || got.Cost == nil || *got.Cost != 0 {
		t.Errorf("usage %+v, cost %v; want %+v, cost 0", got.Usage, got.Cost, want)
	}
}

// turn.feature, "A result with no text keeps the last assistant text".
func TestAResultWithNoTextKeepsTheLastAssistantText(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{
		assistant("first"), assistant("last"), assistant("  "),
		`{"type":"result","subtype":"success","is_error":false,"result":""}`,
	}}
	if got := reply(t, spy, nil); got.Text != "last" || got.Failure != "" {
		t.Errorf("reply %+v, want the text %q and no failure", got, "last")
	}
}

// turn.feature, "A failed result is classed by its fields".
func TestAFailedResultIsClassedByItsFields(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name   string
		seen   string
		result string
		class  claudecode.Class
		reason string
	}{
		{"status 429", initLine, `{"type":"result","subtype":"success","is_error":true,"api_error_status":429,"result":"API Error: 429 rate limited"}`,
			claudecode.RateLimited, "API Error: 429 rate limited"},
		{"a rejected rate limit", rejectedLine, duringExecutionLine, claudecode.RateLimited, "the request was rejected"},
		{"status 401", initLine, `{"type":"result","subtype":"success","is_error":true,"api_error_status":401,"result":"Invalid API key"}`,
			claudecode.Auth, "Invalid API key"},
		{"status 403", initLine, `{"type":"result","subtype":"success","is_error":true,"api_error_status":403,"result":"Forbidden"}`,
			claudecode.Auth, "Forbidden"},
		{"status 413", initLine, `{"type":"result","subtype":"success","is_error":true,"api_error_status":413,"result":"Request too large"}`,
			claudecode.ContextOverflow, "Request too large"},
		{"a prompt too long", initLine, `{"type":"result","subtype":"success","is_error":true,"result":"Prompt is too long"}`,
			claudecode.ContextOverflow, "Prompt is too long"},
		{"the context window", initLine, `{"type":"result","subtype":"error_during_execution","is_error":true,"errors":["input exceeds the Context Window"]}`,
			claudecode.ContextOverflow, "input exceeds the Context Window"},
		{"error_max_turns", initLine, `{"type":"result","subtype":"error_max_turns","is_error":true,"errors":["Reached maximum number of turns (3)","stopped"]}`,
			claudecode.RuntimeError, "Reached maximum number of turns (3); stopped"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got := reply(t, &supervisorSpy{lines: []string{c.seen, c.result}}, nil)
			if got.Failure != c.class || got.Reason != c.reason {
				t.Errorf("failure %q, reason %q; want %q, %q", got.Failure, got.Reason, c.class, c.reason)
			}
		})
	}
}

// turn.feature, "A schema given and no structured output is invalid
// output", a null one included.
func TestASchemaGivenAndNoStructuredOutputIsInvalidOutput(t *testing.T) {
	t.Parallel()
	for _, result := range []string{
		`{"type":"result","subtype":"success","is_error":false,"result":"done"}`,
		`{"type":"result","subtype":"success","is_error":false,"result":"done","structured_output":null}`,
	} {
		t.Run(result, func(t *testing.T) {
			t.Parallel()
			got := reply(t, &supervisorSpy{lines: []string{initLine, result}}, []byte(`{"type":"object"}`))
			if got.Failure != claudecode.InvalidOutput || got.Output != nil || got.Text != "done" {
				t.Errorf("reply %+v, want %q, no output and the text %q", got, claudecode.InvalidOutput, "done")
			}
		})
	}
}

// turn.feature, "A failed result with a schema given is the runtime's
// failure".
func TestAFailedResultWithASchemaGivenIsTheRuntimesFailure(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{`{"type":"result","subtype":"success","is_error":true,"api_error_status":401,"result":"Invalid API key"}`}}
	if got := reply(t, spy, []byte(`{"type":"object"}`)); got.Failure != claudecode.Auth {
		t.Errorf("failure %q, want %q", got.Failure, claudecode.Auth)
	}
}

// turn.feature, "With no result, how the program exited decides".
func TestWithNoResultHowTheProgramExitedDecides(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name   string
		ended  claudecode.Ended
		class  claudecode.Class
		reason string
	}{
		{"exited 1", claudecode.Ended{Code: 1, Stderr: claudecode.Stream{Head: "boom\n", Tail: "boom\n", Size: 5}}, claudecode.RuntimeError, "boom"},
		{"exited 0", claudecode.Ended{}, claudecode.NoResult, ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got := reply(t, &supervisorSpy{lines: []string{initLine}, result: c.ended}, nil)
			if got.Failure != c.class || got.Reason != c.reason || got.Session != "s1" {
				t.Errorf("reply %+v, want %q, reason %q, session s1", got, c.class, c.reason)
			}
		})
	}
}

// turn.feature, "What the supervisor gives besides is the turn's".
func TestWhatTheSupervisorGivesBesidesIsTheTurns(t *testing.T) {
	t.Parallel()
	given := claudecode.Ended{Signal: "killed", Stderr: claudecode.Stream{Head: "e", Tail: "e", Size: 1, Digest: "ed"}}
	spy := &supervisorSpy{lines: []string{initLine, `{"type":"result","subtype":"success","is_error":false,"result":"done"}`}, result: given}
	got, err := wrapper(t, spy).Run(context.Background(), claudecode.Turn{Message: "m"})
	if err != nil {
		t.Fatal(err)
	}
	if want := (claudecode.Result{Ended: given}); !reflect.DeepEqual(got, want) {
		t.Errorf("turn gave %+v, want %+v", got, want)
	}
}

// turn.feature, "A program that could not start is the turn's", and any
// other error of the supervisor.
func TestAProgramThatCouldNotStartIsTheTurns(t *testing.T) {
	t.Parallel()
	for _, given := range []error{fmt.Errorf("%w: claude: not found", claudecode.ErrNotStarted), errors.New("observing claude exiting")} {
		t.Run(given.Error(), func(t *testing.T) {
			t.Parallel()
			got, err := wrapper(t, &supervisorSpy{err: given}).Run(context.Background(), claudecode.Turn{Message: "m"})
			if !errors.Is(err, given) || !reflect.DeepEqual(got, claudecode.Result{}) {
				t.Errorf("turn gave %+v, %v; want nothing, %v", got, err, given)
			}
		})
	}
}

// The claude-code wrapper is built with its supervisor.
func TestTheWrapperNeedsASupervisor(t *testing.T) {
	t.Parallel()
	if _, err := claudecode.New(nil); err == nil {
		t.Error("a claude-code wrapper built with no supervisor, want an error")
	}
}
