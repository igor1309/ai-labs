package call_test

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// modelCaller is a caller over spy, which takes the inputs in its message,
// its output checked by validator, in "/r", over env.
func modelCaller(t *testing.T, spy *runtimeSpy, validator *validatorSpy, env ...string) *call.Caller {
	t.Helper()
	clock := clocktest.NewClock(start)
	c, err := call.New(spy, call.InMessage, validator, &stalenessSpy{}, clock, clock.Timer, "/r", env)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// replies is a turn that exits 0 at once with reply.
func replies(reply call.Reply) func(context.Context) (call.Ended, error) {
	return exits(call.Ended{Reply: &reply})
}

// model.feature, "The message is each input, then each document, in
// sections": the inputs in the order the step gives them, not by name, and
// none of them in the environment.
func TestTheMessageIsEachInputThenEachDocumentInSections(t *testing.T) {
	t.Parallel()
	spy := &runtimeSpy{turn: replies(call.Reply{Text: "t"})}
	modelCaller(t, spy, &validatorSpy{}, "PATH=/bin").Call(context.Background(), call.Step{
		Prompt:      "not the message",
		Environment: map[string]string{"A": "1"},
		Inputs:      []call.Named{{Name: "goal", Text: "g"}, {Name: "brief", Text: "a\nb"}},
		Documents:   []call.Named{{Name: "prompt", Text: "p"}},
	}, discard)
	want := []call.Turn{{
		SessionCostBefore: dollars(0),
		Prompt:            "## goal\n\ng\n\n## brief\n\n```\na\nb\n```\n\n## prompt\n\np",
		Dir:               "/r",
		Env:               []string{"PATH=/bin", "A=1"},
	}}
	if !reflect.DeepEqual(spy.given, want) {
		t.Errorf("turns\n got %+v\nwant %+v", spy.given, want)
	}
}

// model.feature, "A text with a newline is fenced, longer than any
// backtick run in it".
func TestATextWithANewlineIsFenced(t *testing.T) {
	t.Parallel()
	cases := []struct{ text, message string }{
		{"x\n````y", "## diff\n\n`````\nx\n````y\n`````"},
		{"hi\n", "## diff\n\n```\nhi\n```"},
		{"one line", "## diff\n\none line"},
	}
	for _, c := range cases {
		t.Run(c.text, func(t *testing.T) {
			t.Parallel()
			spy := &runtimeSpy{turn: replies(call.Reply{Text: "t"})}
			modelCaller(t, spy, &validatorSpy{}).Call(context.Background(), call.Step{
				Inputs: []call.Named{{Name: "diff", Text: c.text}},
			}, discard)
			if len(spy.given) != 1 || spy.given[0].Prompt != c.message {
				t.Errorf("turns %+v, want the message %q", spy.given, c.message)
			}
		})
	}
}

// model.feature, "The turn is given what the step gives of the model".
func TestTheTurnIsGivenWhatTheStepGivesOfTheModel(t *testing.T) {
	t.Parallel()
	spy := &runtimeSpy{turn: replies(call.Reply{Output: []byte(`{}`)})}
	modelCaller(t, spy, &validatorSpy{}).Call(context.Background(), call.Step{
		Instruction: "i", Model: "opus", Effort: "high", Options: []string{"Read", "Grep"}, Schema: []byte("s"),
	}, discard)
	want := []call.Turn{{
		SessionCostBefore: dollars(0),
		Dir:               "/r", Instruction: "i", Model: "opus", Effort: "high", Options: []string{"Read", "Grep"}, Schema: []byte("s"),
	}}
	if !reflect.DeepEqual(spy.given, want) {
		t.Errorf("turns\n got %+v\nwant %+v", spy.given, want)
	}
}

// model.feature, "The reply decides the status and class": the runtime's
// failure before the schema, a turn that failed not checked; and the
// validator given the schema and the structured output. Output the
// validator accepts that is not a JSON object is not a call's output.
func TestTheReplyDecidesTheStatusAndClass(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name      string
		schema    []byte
		reply     call.Reply
		rejects   error
		status    call.Status
		class     call.Class
		validated bool
	}{
		{"no schema, the text", nil, call.Reply{Text: "t"}, nil, call.Completed, "", false},
		{"a schema the validator accepts", []byte("s"), call.Reply{Output: []byte(`{"ok":true}`)}, nil, call.Completed, "", true},
		{"a schema the validator rejects", []byte("s"), call.Reply{Output: []byte(`{"ok":1}`)}, errors.New("ok: want boolean"), call.Failed, call.InvalidOutput, true},
		{"a schema, the failure invalid_output", []byte("s"), call.Reply{Failure: "invalid_output"}, nil, call.Failed, call.InvalidOutput, false},
		{"a schema, the failure auth, no structured output", []byte("s"), call.Reply{Failure: "auth"}, nil, call.Failed, call.Auth, false},
		{"no schema, the failure rate_limited", nil, call.Reply{Failure: "rate_limited"}, nil, call.Failed, call.RateLimited, false},
		{"no schema, the failure no_result", nil, call.Reply{Failure: "no_result"}, nil, call.Lost, call.NoResult, false},
		{"no schema, the failure overloaded", nil, call.Reply{Failure: "overloaded"}, nil, call.Failed, call.RuntimeError, false},
		{"a schema the validator accepts, an array", []byte("s"), call.Reply{Output: []byte(`[1]`)}, nil, call.Failed, call.InvalidOutput, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			validator := &validatorSpy{err: c.rejects}
			got := modelCaller(t, &runtimeSpy{turn: replies(c.reply)}, validator).Call(context.Background(), call.Step{Schema: c.schema}, discard)
			if got.Status != c.status || got.Class != c.class {
				t.Errorf("ended %q, class %q; want %q, class %q", got.Status, got.Class, c.status, c.class)
			}
			if c.status != call.Completed && got.Output != nil {
				t.Errorf("output of a call ended %q: %v, want none", got.Status, got.Output)
			}
			var want [][2]string
			if c.validated {
				want = [][2]string{{string(c.schema), string(c.reply.Output)}}
			}
			if !reflect.DeepEqual(validator.given, want) {
				t.Errorf("validated %q, want %q", validator.given, want)
			}
		})
	}
}

// model.feature, "How the program ended comes before the reply".
func TestHowTheProgramEndedComesBeforeTheReply(t *testing.T) {
	t.Parallel()
	reply := &call.Reply{Text: "t"}
	cases := []struct {
		ended  string
		turn   func(cancel context.CancelFunc) func(context.Context) (call.Ended, error)
		status call.Status
		class  call.Class
	}{
		{"is cancelled by the caller, then exits 0", func(cancel context.CancelFunc) func(context.Context) (call.Ended, error) {
			return func(ctx context.Context) (call.Ended, error) {
				cancel()
				<-ctx.Done()
				return call.Ended{Reply: reply}, nil
			}
		}, call.Interrupted, call.Cancelled},
		{"is ended by a signal Agister did not send", func(context.CancelFunc) func(context.Context) (call.Ended, error) {
			return exits(call.Ended{Signal: "terminated", Reply: reply})
		}, call.Failed, call.Killed},
		{"gives another error", func(context.CancelFunc) func(context.Context) (call.Ended, error) {
			return func(context.Context) (call.Ended, error) { return call.Ended{Reply: reply}, errors.New("broken pipe") }
		}, call.Failed, call.RuntimeError},
	}
	for _, c := range cases {
		t.Run(c.ended, func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancel(context.Background())
			t.Cleanup(cancel)
			got := modelCaller(t, &runtimeSpy{turn: c.turn(cancel)}, &validatorSpy{}).Call(ctx, call.Step{}, discard)
			if got.Status != c.status || got.Class != c.class || got.Output != nil {
				t.Errorf("ended %q, class %q, output %v; want %q, class %q, none", got.Status, got.Class, got.Output, c.status, c.class)
			}
		})
	}
}

// model.feature, "A completed call's output is what the reply gives": a
// number as it was written.
func TestACompletedCallsOutputIsWhatTheReplyGives(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		schema []byte
		want   map[string]any
	}{
		{"with a schema", []byte("s"), map[string]any{"ok": true, "n": json.Number("12345678901234567890")}},
		{"with no schema", nil, map[string]any{"text": "t"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &runtimeSpy{turn: replies(call.Reply{Text: "t", Output: []byte(`{"ok":true,"n":12345678901234567890}`)})}
			got := modelCaller(t, spy, &validatorSpy{}).Call(context.Background(), call.Step{Schema: c.schema}, discard)
			if got.Status != call.Completed || !reflect.DeepEqual(got.Output, c.want) {
				t.Errorf("ended %q, output %v; want completed, %v", got.Status, got.Output, c.want)
			}
		})
	}
}

// reply.feature, "Usage, session and cost are as the runtime reported
// them", whatever the call's status: each of the five counts as reported,
// each its own, 0 kept as 0, and one not reported unknown, printed as null.
func TestUsageSessionAndCostAreAsTheRuntimeReportedThem(t *testing.T) {
	t.Parallel()
	count := func(n int64) *int64 { return &n }
	cost := 0.25
	usages := []struct {
		name    string
		usage   call.Usage
		printed string
	}{
		{"input and output", call.Usage{Input: count(10), Output: count(3)},
			`{"Input":10,"Output":3,"CacheRead":null,"CacheWrite":null,"Reasoning":null}`},
		{"every count", call.Usage{Input: count(10), Output: count(3), CacheRead: count(7), CacheWrite: count(5), Reasoning: count(2)},
			`{"Input":10,"Output":3,"CacheRead":7,"CacheWrite":5,"Reasoning":2}`},
		{"every count 0", call.Usage{Input: count(0), Output: count(0), CacheRead: count(0), CacheWrite: count(0), Reasoning: count(0)},
			`{"Input":0,"Output":0,"CacheRead":0,"CacheWrite":0,"Reasoning":0}`},
		{"none reported", call.Usage{},
			`{"Input":null,"Output":null,"CacheRead":null,"CacheWrite":null,"Reasoning":null}`},
	}
	statuses := []struct {
		name    string
		failure call.Class
	}{
		{"completed", ""},
		{"failed", call.Auth},
	}
	for _, u := range usages {
		for _, c := range statuses {
			t.Run(c.name+", "+u.name, func(t *testing.T) {
				t.Parallel()
				spy := &runtimeSpy{turn: replies(call.Reply{
					Text: "t", Session: "s1", Cost: &cost, Usage: u.usage, Failure: c.failure,
				})}
				got := modelCaller(t, spy, &validatorSpy{}).Call(context.Background(), call.Step{}, discard)
				if got.Session != "s1" || got.Cost == nil || *got.Cost != 0.25 {
					t.Errorf("session %q, cost %v; want s1, 0.25", got.Session, got.Cost)
				}
				if want := &u.usage; !reflect.DeepEqual(got.Usage, want) {
					t.Errorf("usage %+v, want %+v", got.Usage, want)
				}
				printed, err := json.Marshal(got.Usage)
				if err != nil {
					t.Fatal(err)
				}
				if string(printed) != u.printed {
					t.Errorf("usage printed %s, want %s", printed, u.printed)
				}
			})
		}
	}
}

// reply.feature, "A bash call has no usage".
func TestABashCallHasNoUsage(t *testing.T) {
	t.Parallel()
	got := caller(t, &runtimeSpy{turn: exits(call.Ended{Code: 0})}, clocktest.NewClock(start), "/r").Call(context.Background(), call.Step{Prompt: "s"}, discard)
	printed, err := json.Marshal(got.Usage)
	if err != nil {
		t.Fatal(err)
	}
	if got.Usage != nil || string(printed) != "null" {
		t.Errorf("usage %+v, printed %s; want none, printed null", got.Usage, printed)
	}
}

// reply.feature, "A failed call keeps the runtime's reason", and a
// rejected one the validator's; a completed call has none.
func TestAFailedCallKeepsTheRuntimesReason(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		schema  []byte
		reply   call.Reply
		rejects error
		class   call.Class
		reason  string
	}{
		{"the runtime's", nil, call.Reply{Failure: "auth", Reason: "not logged in"}, nil, call.Auth, "not logged in"},
		{"no result", nil, call.Reply{Failure: "no_result", Reason: "exited 0"}, nil, call.NoResult, "exited 0"},
		{"the validator's", []byte("s"), call.Reply{Output: []byte(`{}`), Reason: "not this"}, errors.New("ok is required"), call.InvalidOutput, "ok is required"},
		{"completed", nil, call.Reply{Text: "t", Reason: "not this"}, nil, "", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got := modelCaller(t, &runtimeSpy{turn: replies(c.reply)}, &validatorSpy{err: c.rejects}).Call(context.Background(), call.Step{Schema: c.schema}, discard)
			if got.Class != c.class || got.Reason != c.reason {
				t.Errorf("class %q, reason %q; want %q, %q", got.Class, got.Reason, c.class, c.reason)
			}
		})
	}
}

// reply.feature, "A reason is cut to 1 KiB": the runtime's and the
// validator's, never within a character.
func TestAReasonIsCutTo1KiB(t *testing.T) {
	t.Parallel()
	long := strings.Repeat("r", 2048)
	cases := []struct {
		name    string
		schema  []byte
		reply   call.Reply
		rejects error
		want    string
	}{
		{"the runtime's", nil, call.Reply{Failure: "runtime_error", Reason: long}, nil, long[:1024]},
		{"the validator's", []byte("s"), call.Reply{Output: []byte(`{}`)}, errors.New(long), long[:1024]},
		{"a character across the cut", nil, call.Reply{Failure: "runtime_error", Reason: long[:1023] + "é"}, nil, long[:1023]},
		{"exactly 1 KiB", nil, call.Reply{Failure: "runtime_error", Reason: long[:1024]}, nil, long[:1024]},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got := modelCaller(t, &runtimeSpy{turn: replies(c.reply)}, &validatorSpy{err: c.rejects}).Call(context.Background(), call.Step{Schema: c.schema}, discard)
			if got.Reason != c.want {
				t.Errorf("reason of %d bytes, want the first %d", len(got.Reason), len(c.want))
			}
		})
	}
}

// model.feature, "A step continuing a session gives its turn the
// session".
func TestAStepContinuingASessionGivesItsTurnTheSession(t *testing.T) {
	t.Parallel()
	spy := &runtimeSpy{turn: replies(call.Reply{Text: "t", Session: "s1"})}
	step := call.Step{Inputs: []call.Named{{Name: "goal", Text: "g"}}, Documents: []call.Named{{Name: "prompt", Text: "p"}}}
	continuing := step
	continuing.Session = "s1"
	got := modelCaller(t, spy, &validatorSpy{}).Call(context.Background(), continuing, discard)
	want := []call.Turn{{Prompt: "## goal\n\ng\n\n## prompt\n\np", Dir: "/r", Session: "s1"}}
	if !reflect.DeepEqual(spy.given, want) {
		t.Errorf("turns\n got %+v\nwant %+v", spy.given, want)
	}
	if got.Status != call.Completed || got.Session != "s1" {
		t.Errorf("ended %q, session %q; want completed, s1", got.Status, got.Session)
	}
}

// model.feature, "A turn that reports another session fails the call":
// before the reply's failure and its schema, the session reported kept.
// A turn that reports none, or a step that continues none, is ended by
// its reply.
func TestATurnThatReportsAnotherSessionFailsTheCall(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name      string
		continues string
		reply     call.Reply
		status    call.Status
		class     call.Class
		reason    string
	}{
		{"another session", "s1", call.Reply{Text: "t", Session: "s2"}, call.Failed, call.RuntimeError,
			`the turn reported the session "s2", not "s1"`},
		{"another session, failed", "s1", call.Reply{Session: "s2", Failure: call.Auth, Reason: "not logged in"}, call.Failed, call.RuntimeError,
			`the turn reported the session "s2", not "s1"`},
		{"another session, with a schema", "s1", call.Reply{Output: []byte(`{}`), Session: "s2"}, call.Failed, call.RuntimeError,
			`the turn reported the session "s2", not "s1"`},
		{"the same session", "s1", call.Reply{Text: "t", Session: "s1"}, call.Completed, "", ""},
		{"no session reported", "s1", call.Reply{Failure: call.Auth, Reason: "not logged in"}, call.Failed, call.Auth, "not logged in"},
		{"no session continued", "", call.Reply{Text: "t", Session: "s2"}, call.Completed, "", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			validator := &validatorSpy{}
			var schema []byte
			if c.reply.Output != nil {
				schema = []byte("s")
			}
			got := modelCaller(t, &runtimeSpy{turn: replies(c.reply)}, validator).Call(context.Background(), call.Step{Session: c.continues, Schema: schema}, discard)
			if got.Status != c.status || got.Class != c.class || got.Reason != c.reason {
				t.Errorf("ended %q, class %q, reason %q; want %q, class %q, reason %q", got.Status, got.Class, got.Reason, c.status, c.class, c.reason)
			}
			if got.Session != c.reply.Session {
				t.Errorf("session %q, want the one reported, %q", got.Session, c.reply.Session)
			}
			if c.status != call.Completed && (got.Output != nil || validator.given != nil) {
				t.Errorf("output %v, validated %q; want none", got.Output, validator.given)
			}
		})
	}
}
