package codex_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// supervisorSpy answers in place of the supervisor: it keeps each program
// it is asked to run, its line function left out, and the bytes of the
// file its --output-schema names, and why its context had ended, nil
// where it had not; gives that function the lines its test gives, in
// order, counting in given those it has begun to give, runs its test's
// hook, and gives the result and the error its test gives.
type supervisorSpy struct {
	lines  []string
	result codex.Ended
	err    error
	during func()
	asked  []codex.Program
	schema []byte
	ended  []error
	given  int
}

func (s *supervisorSpy) Run(ctx context.Context, program codex.Program) (codex.Ended, error) {
	s.ended = append(s.ended, ctx.Err())
	if i := slices.Index(program.Args, "--output-schema"); i >= 0 && i+1 < len(program.Args) {
		schema, err := os.ReadFile(program.Args[i+1])
		if err != nil {
			return codex.Ended{}, err
		}
		s.schema = schema
	}
	for _, line := range s.lines {
		s.given++
		program.Line(line)
	}
	program.Line = nil
	s.asked = append(s.asked, program)
	if s.during != nil {
		s.during()
	}
	return s.result, s.err
}

// wrapper is the codex wrapper over spy, its schemas written under folder.
func wrapper(t *testing.T, spy *supervisorSpy, folder string) *codex.Wrapper {
	t.Helper()
	w, err := codex.New(spy, folder)
	if err != nil {
		t.Fatal(err)
	}
	return w
}

// reply is the reply of a turn, given schema, over spy's lines and result.
func reply(t *testing.T, spy *supervisorSpy, schema []byte) codex.Reply {
	t.Helper()
	got, err := wrapper(t, spy, t.TempDir()).Run(context.Background(), codex.Turn{Message: "m", Options: []string{"read-only"}, Schema: schema}, discard)
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

// empty fails the test unless folder holds nothing.
func empty(t *testing.T, folder string) {
	t.Helper()
	entries, err := os.ReadDir(folder)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) > 0 {
		t.Errorf("%s holds %v, want nothing", folder, entries)
	}
}

// Lines as codex exec --json writes them.
const (
	threadLine    = `{"type":"thread.started","thread_id":"t1"}`
	turnLine      = `{"type":"turn.started"}`
	errorLine     = `{"type":"error","message":"Reconnecting... 1/5 (stream disconnected before completion)"}`
	commandLine   = `{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"ls","aggregated_output":"","status":"in_progress"}}`
	reasoningLine = `{"type":"item.completed","item":{"id":"item_2","type":"reasoning","text":"thinking"}}`
	notJSONLine   = `{broken`
	completedLine = `{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":4,"output_tokens":3,"reasoning_output_tokens":2}}`
)

// message is an agent_message item's line.
func message(text string) string {
	return fmt.Sprintf(`{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":%q}}`, text)
}

// failed is a turn.failed line of message.
func failed(message string) string {
	line, _ := json.Marshal(map[string]any{"type": "turn.failed", "error": map[string]any{"message": message}})
	return string(line)
}

func ptr[T any](v T) *T { return &v }

// discard is a report that keeps nothing, for a turn whose test is not
// about what it reports.
func discard(codex.Report) {}

// facts.feature, "Its facts".
func TestItsFacts(t *testing.T) {
	t.Parallel()
	want := codex.Facts{
		Contract:     "codex/2",
		Schema:       true,
		Session:      true,
		Skills:       true,
		Model:        true,
		Efforts:      []string{"minimal", "low", "medium", "high", "xhigh"},
		ToolCalls:    true,
		Budget:       false,
		ToolCommands: true,
		Inputs:       codex.InMessage,
	}
	if got := wrapper(t, &supervisorSpy{}, t.TempDir()).Facts(); !reflect.DeepEqual(got, want) {
		t.Errorf("facts\n got %+v\nwant %+v", got, want)
	}
}

// turn.feature, "A turn asks the supervisor for codex exec, the message on
// stdin": the schema is in a file of a folder of its own under the folder
// the wrapper is given, gone once the turn has returned.
func TestATurnAsksTheSupervisorForCodexExecTheMessageOnStdin(t *testing.T) {
	t.Parallel()
	folder := t.TempDir()
	spy := &supervisorSpy{}
	turn := codex.Turn{Message: "m", Dir: "/r", Env: []string{"goal=g"}, Instruction: "i", Model: "gpt-6.1-sol", Effort: "high",
		Options: []string{"read-only"}, Schema: []byte("{}")}
	if _, err := wrapper(t, spy, folder).Run(context.Background(), turn, discard); err != nil {
		t.Fatal(err)
	}
	if len(spy.asked) != 1 {
		t.Fatalf("asked %+v, want one program", spy.asked)
	}
	args := spy.asked[0].Args
	i := slices.Index(args, "--output-schema")
	if i < 0 || i+1 >= len(args) {
		t.Fatalf("arguments %q, want --output-schema and its file", args)
	}
	file := args[i+1]
	if got := filepath.Dir(filepath.Dir(file)); got != folder {
		t.Errorf("the schema's file %s, want it in a folder of its own under %s", file, folder)
	}
	want := codex.Program{Name: "codex", Dir: "/r", Env: []string{"goal=g"}, Stdin: "<instructions>\ni\n</instructions>\n\nm", Args: []string{
		"exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "--config", `approval_policy="never"`,
		"--ignore-user-config", "--ignore-rules", "--model", "gpt-6.1-sol", "--config", `model_reasoning_effort="high"`,
		"--output-schema", file, "-"}}
	if !reflect.DeepEqual(spy.asked[0], want) {
		t.Errorf("asked\n got %+v\nwant %+v", spy.asked[0], want)
	}
	if string(spy.schema) != "{}" {
		t.Errorf("the schema's file held %q, want {}", spy.schema)
	}
	empty(t, folder)
}

// turn.feature, "What is not given is left out".
func TestWhatIsNotGivenIsLeftOut(t *testing.T) {
	t.Parallel()
	folder := t.TempDir()
	spy := &supervisorSpy{}
	if _, err := wrapper(t, spy, folder).Run(context.Background(), codex.Turn{Message: "m", Options: []string{"read-only"}}, discard); err != nil {
		t.Fatal(err)
	}
	want := []codex.Program{{Name: "codex", Stdin: "m", Args: []string{
		"exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "--config", `approval_policy="never"`,
		"--ignore-user-config", "--ignore-rules", "-"}}}
	if !reflect.DeepEqual(spy.asked, want) {
		t.Errorf("asked\n got %+v\nwant %+v", spy.asked, want)
	}
	empty(t, folder)
}

// turn.feature, "A turn is given exactly one option": no schema's folder
// is made either.
func TestATurnIsGivenExactlyOneOption(t *testing.T) {
	t.Parallel()
	for _, options := range [][]string{nil, {"read-only", "workspace-write"}} {
		t.Run(fmt.Sprintf("%q", options), func(t *testing.T) {
			t.Parallel()
			folder := t.TempDir()
			spy := &supervisorSpy{}
			got, err := wrapper(t, spy, folder).Run(context.Background(), codex.Turn{Message: "m", Options: options, Schema: []byte("{}")}, discard)
			if err == nil || !reflect.DeepEqual(got, codex.Result{}) {
				t.Errorf("turn gave %+v, %v; want nothing and an error", got, err)
			}
			if len(spy.asked) > 0 {
				t.Errorf("asked %+v, want nothing", spy.asked)
			}
			empty(t, folder)
		})
	}
}

// turn.feature, "A completed turn is the reply", among lines the reply
// does not read.
func TestACompletedTurnIsTheReply(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{
		threadLine, turnLine, notJSONLine, "", errorLine, commandLine, message("first"), reasoningLine, message("last"), completedLine,
	}}
	want := codex.Reply{Text: "last", Session: "t1",
		Usage: codex.Usage{Input: ptr(int64(10)), CacheRead: ptr(int64(4)), Output: ptr(int64(3)), Reasoning: ptr(int64(2))}}
	if got := reply(t, spy, nil); !reflect.DeepEqual(got, want) {
		t.Errorf("reply\n got %+v\nwant %+v", got, want)
	}
}

// The usage reports each count it gives, none where turn.completed gives
// no usage.
func TestTheUsageReportsEachCountItGives(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		line string
		want codex.Usage
	}{
		{`{"type":"turn.completed","usage":{"input_tokens":0,"output_tokens":5}}`, codex.Usage{Input: ptr(int64(0)), Output: ptr(int64(5))}},
		{`{"type":"turn.completed"}`, codex.Usage{}},
	} {
		t.Run(c.line, func(t *testing.T) {
			t.Parallel()
			if got := reply(t, &supervisorSpy{lines: []string{c.line}}, nil); !reflect.DeepEqual(got.Usage, c.want) || got.Failure != "" {
				t.Errorf("reply %+v, want the usage %+v and no failure", got, c.want)
			}
		})
	}
}

// turn.feature, "With a schema, the last message is the structured output".
func TestWithASchemaTheLastMessageIsTheStructuredOutput(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{message("draft"), message(`{"ok":true}` + "\n"), `{"type":"turn.completed"}`}}
	got := reply(t, spy, []byte(`{"type":"object"}`))
	if string(got.Output) != `{"ok":true}` || got.Failure != "" {
		t.Errorf("reply %+v, want the output {\"ok\":true} and no failure", got)
	}
}

// turn.feature, "A turn.failed is classed by its words", each of them.
func TestATurnFailedIsClassedByItsWords(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		message string
		class   codex.Class
	}{
		{"Selected model is at capacity", codex.Capacity},
		{"You've hit your usage limit", codex.RateLimited},
		{"Rate limit reached", codex.RateLimited},
		{"unexpected status 429 Too Many Requests", codex.RateLimited},
		{"401 Unauthorized", codex.Auth},
		{"Unauthorized", codex.Auth},
		{"Please Login again", codex.Auth},
		{"exceeds the context window", codex.ContextOverflow},
		{"input exceeds the Context Length", codex.ContextOverflow},
		{"stream disconnected", codex.RuntimeError},
	} {
		t.Run(c.message, func(t *testing.T) {
			t.Parallel()
			got := reply(t, &supervisorSpy{lines: []string{threadLine, failed(c.message)}}, nil)
			if got.Failure != c.class || got.Reason != c.message || got.Session != "t1" {
				t.Errorf("reply %+v, want %q, reason %q, session t1", got, c.class, c.message)
			}
		})
	}
}

// turn.feature, "A schema given and no JSON message is invalid output".
func TestASchemaGivenAndNoJSONMessageIsInvalidOutput(t *testing.T) {
	t.Parallel()
	for _, lines := range [][]string{
		{threadLine, `{"type":"turn.completed"}`},
		{threadLine, message("not json"), `{"type":"turn.completed"}`},
	} {
		t.Run(lines[1], func(t *testing.T) {
			t.Parallel()
			got := reply(t, &supervisorSpy{lines: lines}, []byte(`{"type":"object"}`))
			if got.Failure != codex.InvalidOutput || got.Output != nil || got.Reason == "" {
				t.Errorf("reply %+v, want %q, its reason, and no output", got, codex.InvalidOutput)
			}
		})
	}
}

// turn.feature, "With no deciding event, how the program exited decides".
func TestWithNoDecidingEventHowTheProgramExitedDecides(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name   string
		ended  codex.Ended
		class  codex.Class
		reason string
	}{
		{"exited 1", codex.Ended{Code: 1, Stderr: codex.Stream{Head: "boom\n", Tail: "boom\n", Size: 5}}, codex.RuntimeError, "boom"},
		{"exited 0", codex.Ended{}, codex.NoResult, ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got := reply(t, &supervisorSpy{lines: []string{threadLine, errorLine}, result: c.ended}, nil)
			if got.Failure != c.class || got.Reason != c.reason || got.Session != "t1" {
				t.Errorf("reply %+v, want %q, reason %q, session t1", got, c.class, c.reason)
			}
		})
	}
}

// turn.feature, "A turn.failed with a schema given is the runtime's
// failure".
func TestATurnFailedWithASchemaGivenIsTheRuntimesFailure(t *testing.T) {
	t.Parallel()
	got := reply(t, &supervisorSpy{lines: []string{failed("401 Unauthorized")}}, []byte(`{"type":"object"}`))
	if got.Failure != codex.Auth {
		t.Errorf("failure %q, want %q", got.Failure, codex.Auth)
	}
}

// A program ended by a signal is the turn's, with no reply.
func TestWhatTheSupervisorGivesBesidesIsTheTurns(t *testing.T) {
	t.Parallel()
	given := codex.Ended{Signal: "killed", Stderr: codex.Stream{Head: "e", Tail: "e", Size: 1, Digest: "ed"}}
	spy := &supervisorSpy{lines: []string{threadLine, completedLine}, result: given}
	got, err := wrapper(t, spy, t.TempDir()).Run(context.Background(), codex.Turn{Message: "m", Options: []string{"read-only"}}, discard)
	if err != nil {
		t.Fatal(err)
	}
	if want := (codex.Result{Ended: given, Session: "t1"}); !reflect.DeepEqual(got, want) {
		t.Errorf("turn gave %+v, want %+v", got, want)
	}
}

// turn.feature, "A program that could not start is the turn's", and any
// other error of the supervisor; the schema's file is gone either way.
func TestAProgramThatCouldNotStartIsTheTurns(t *testing.T) {
	t.Parallel()
	for _, given := range []error{fmt.Errorf("%w: codex: not found", codex.ErrNotStarted), errors.New("observing codex exiting")} {
		t.Run(given.Error(), func(t *testing.T) {
			t.Parallel()
			folder := t.TempDir()
			spy := &supervisorSpy{err: given}
			got, err := wrapper(t, spy, folder).Run(context.Background(), codex.Turn{Message: "m", Options: []string{"read-only"}, Schema: []byte("{}")}, discard)
			if !errors.Is(err, given) || !reflect.DeepEqual(got, codex.Result{}) {
				t.Errorf("turn gave %+v, %v; want nothing, %v", got, err, given)
			}
			if string(spy.schema) != "{}" {
				t.Errorf("the schema's file held %q, want {}", spy.schema)
			}
			empty(t, folder)
		})
	}
}

// A schema's folder that cannot be made is the turn's error; one that
// cannot be removed once the turn has returned is left, the turn's end
// unchanged.
func TestASchemasFolderThatCannotBeMadeIsTheTurnsErrorAndOneNotRemovedIsLeft(t *testing.T) {
	t.Parallel()
	t.Run("made", func(t *testing.T) {
		t.Parallel()
		spy := &supervisorSpy{}
		missing := filepath.Join(t.TempDir(), "missing")
		got, err := wrapper(t, spy, missing).Run(context.Background(), codex.Turn{Message: "m", Options: []string{"read-only"}, Schema: []byte("{}")}, discard)
		if err == nil || !reflect.DeepEqual(got, codex.Result{}) || len(spy.asked) > 0 {
			t.Errorf("turn gave %+v, %v, asked %+v; want nothing, an error, and nothing asked", got, err, spy.asked)
		}
	})
	t.Run("removed", func(t *testing.T) {
		t.Parallel()
		folder := t.TempDir()
		t.Cleanup(func() {
			if err := os.Chmod(folder, 0o700); err != nil {
				t.Error(err)
			}
		})
		spy := &supervisorSpy{lines: []string{message(`{"ok":true}`), completedLine}, during: func() {
			if err := os.Chmod(folder, 0o500); err != nil {
				t.Error(err)
			}
		}}
		got, err := wrapper(t, spy, folder).Run(context.Background(), codex.Turn{Message: "m", Options: []string{"read-only"}, Schema: []byte("{}")}, discard)
		if err != nil {
			t.Fatalf("turn gave the error %v, want none", err)
		}
		want := codex.Reply{Text: `{"ok":true}`, Output: []byte(`{"ok":true}`),
			Usage: codex.Usage{Input: ptr[int64](10), Output: ptr[int64](3), CacheRead: ptr[int64](4), Reasoning: ptr[int64](2)}}
		if got.Ended != spy.result || got.Reply == nil || !reflect.DeepEqual(*got.Reply, want) {
			t.Errorf("turn gave %+v, reply %+v; want %+v, reply %+v", got.Ended, got.Reply, spy.result, want)
		}
		entries, err := os.ReadDir(folder)
		if err != nil {
			t.Fatal(err)
		}
		if len(entries) != 1 {
			t.Errorf("%s holds %v, want the schema's folder left", folder, entries)
		}
	})
}

// The codex wrapper is built with its supervisor and its schemas' folder.
func TestTheWrapperNeedsASupervisorAndAFolder(t *testing.T) {
	t.Parallel()
	if _, err := codex.New(nil, t.TempDir()); err == nil {
		t.Error("a codex wrapper built with no supervisor, want an error")
	}
	if _, err := codex.New(&supervisorSpy{}, ""); err == nil {
		t.Error("a codex wrapper built with no folder, want an error")
	}
}

// A turn runs on the supervisor in the context it is given: one ended
// before its program starts reaches the supervisor ended, so the
// supervisor ends the program as it ends any.
func TestATurnsContextReachesTheSupervisor(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	spy := &supervisorSpy{}
	if _, err := wrapper(t, spy, t.TempDir()).Run(ctx, codex.Turn{Message: "m", Options: []string{"read-only"}}, discard); err != nil {
		t.Fatal(err)
	}
	if want := []error{context.Canceled}; !reflect.DeepEqual(spy.ended, want) {
		t.Errorf("the supervisor's contexts ended by %v, want %v", spy.ended, want)
	}
}
