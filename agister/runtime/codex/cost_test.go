package codex_test

import (
	"context"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/codex"
)

// priced is a lookup that exits 0 and gives the JSON object of fields,
// over many lines as ccusage writes it.
func priced(fields ...string) lookup {
	return lookup{lines: append(append([]string{"{"}, fields...), "}")}
}

// ran is each program spy was asked to run of the name.
func ran(spy *supervisorSpy, name string) []codex.Program {
	var programs []codex.Program
	for _, program := range spy.asked {
		if program.Name == name {
			programs = append(programs, program)
		}
	}
	return programs
}

// names is the name of each program spy was asked to run, in order.
func names(spy *supervisorSpy) []string {
	var got []string
	for _, program := range spy.asked {
		got = append(got, program.Name)
	}
	return got
}

// turned is the reply of a turn over spy, resuming session, "" for none.
func turned(t *testing.T, spy *supervisorSpy, session string) codex.Reply {
	t.Helper()
	turn := codex.Turn{Message: "m", Dir: "/r", Env: []string{"A=1"}, Options: []string{"read-only"}, Session: session}
	got, err := wrapper(t, spy, t.TempDir()).Run(context.Background(), turn, discard)
	if err != nil {
		t.Fatal(err)
	}
	if got.Reply == nil {
		t.Fatal("no reply")
	}
	return *got.Reply
}

// lookupOf is the program a lookup of thread runs, in the turned turn's
// directory with its environment.
func lookupOf(thread string) codex.Program {
	return codex.Program{Name: "ccusage", Args: []string{"codex", "session", "--json", "-O", "--id", thread}, Dir: "/r", Env: []string{"A=1"}}
}

const (
	// resumedLine is a resumed turn's turn.completed, its usage the
	// thread's to date.
	resumedLine = `{"type":"turn.completed","usage":{"input_tokens":2500,"cached_input_tokens":1500,"output_tokens":80,"reasoning_output_tokens":30}}`
	// inputLine is a turn.completed of the input 100 alone.
	inputLine = `{"type":"turn.completed","usage":{"input_tokens":100}}`
)

// cost.feature, "A turn's cost is the thread's after it": the lookup's
// lines are read joined, as one object.
func TestATurnsCostIsTheThreadsAfterIt(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{threadLine, completedLine}, lookups: []lookup{priced(`"sessionId": "t1",`, `"totalCost": 0.25`)}}
	got := turned(t, spy, "")
	if want := []string{"codex", "ccusage"}; !reflect.DeepEqual(names(spy), want) {
		t.Fatalf("ran %q, want %q", names(spy), want)
	}
	if want := lookupOf("t1"); !reflect.DeepEqual(spy.asked[1], want) {
		t.Errorf("looked up\n got %+v\nwant %+v", spy.asked[1], want)
	}
	if !reflect.DeepEqual(got.Cost, ptr(0.25)) || got.CostSource != "ccusage" || !reflect.DeepEqual(got.SessionCost, ptr(0.25)) || got.CostUnknown != "" {
		t.Errorf("reply %+v, want the cost 0.25 from ccusage, its session's cost 0.25", got)
	}
}

// cost.feature, "A resumed turn's cost and usage are the thread's after it
// less before": codex's input counts ccusage's input and cache reads.
func TestAResumedTurnsCostAndUsageAreTheThreadsAfterItLessBefore(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{threadLine, resumedLine}, lookups: []lookup{
		priced(`"totalCost": 1, "inputTokens": 1000, "cacheReadTokens": 600, "outputTokens": 50, "reasoningOutputTokens": 20`),
		priced(`"totalCost": 1.25`),
	}}
	got := turned(t, spy, "t1")
	if want := []string{"ccusage", "codex", "ccusage"}; !reflect.DeepEqual(names(spy), want) {
		t.Fatalf("ran %q, want %q", names(spy), want)
	}
	if want := lookupOf("t1"); !reflect.DeepEqual(spy.asked[0], want) || !reflect.DeepEqual(spy.asked[2], want) {
		t.Errorf("looked up %+v and %+v, want %+v each", spy.asked[0], spy.asked[2], want)
	}
	if !reflect.DeepEqual(got.Cost, ptr(0.25)) || got.CostSource != "ccusage" || !reflect.DeepEqual(got.SessionCost, ptr(1.25)) {
		t.Errorf("reply %+v, want the cost 0.25 from ccusage, its session's cost 1.25", got)
	}
	want := codex.Usage{Input: ptr(int64(900)), CacheRead: ptr(int64(900)), Output: ptr(int64(30)), Reasoning: ptr(int64(10))}
	if !reflect.DeepEqual(got.Usage, want) {
		t.Errorf("usage %+v, want %+v", got.Usage, want)
	}
}

// cost.feature, "A lookup that fails leaves the cost unknown".
func TestALookupThatFailsLeavesTheCostUnknown(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name   string
		lookup lookup
		why    string
	}{
		{"cannot start", lookup{err: codex.ErrNotStarted}, "the program could not start"},
		{"ended by SIGTERM", lookup{result: codex.Ended{Signal: "SIGTERM"}}, "it was ended by SIGTERM"},
		{"exits 1", lookup{result: codex.Ended{Code: 1, Stderr: codex.Stream{Tail: "No Codex session found with ID: t1\n"}}},
			"exit 1: No Codex session found with ID: t1"},
		{"not json", lookup{lines: []string{"not json"}}, "no totalCost"},
		{"no totalCost", priced(`"sessionId": "t1"`), "no totalCost"},
		{"a fallback", priced(`"totalCost": 0.25,`, `"models": {"gpt-6": {"isFallback": false}, "gpt-x": {"isFallback": true}}`),
			"the model gpt-x is priced as a fallback"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			got := turned(t, &supervisorSpy{lines: []string{threadLine, inputLine}, lookups: []lookup{c.lookup}}, "")
			if got.Failure != "" || got.Cost != nil || got.SessionCost != nil || got.CostSource != "" ||
				!reflect.DeepEqual(got.Usage, codex.Usage{Input: ptr(int64(100))}) {
				t.Errorf("reply %+v, want it completed, its cost and session's cost unknown, its usage the input 100", got)
			}
			if want := "ccusage could not price the thread t1: " + c.why; got.CostUnknown != want {
				t.Errorf("why %q, want %q", got.CostUnknown, want)
			}
		})
	}
}

// cost.feature, "A lookup before that fails leaves the cost and usage
// unknown".
func TestALookupBeforeThatFailsLeavesTheCostAndUsageUnknown(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{threadLine, resumedLine}, lookups: []lookup{{err: codex.ErrNotStarted}, priced(`"totalCost": 1.25`)}}
	got := turned(t, spy, "t1")
	if got.Cost != nil || !reflect.DeepEqual(got.SessionCost, ptr(1.25)) || got.Usage != (codex.Usage{}) {
		t.Errorf("reply %+v, want its cost and usage unknown, its session's cost 1.25", got)
	}
	if !strings.HasPrefix(got.CostUnknown, "ccusage could not price the thread t1: ") {
		t.Errorf("why %q, want the lookup's", got.CostUnknown)
	}
}

// cost.feature, "A turn at capacity is looked up as well".
func TestATurnAtCapacityIsLookedUpAsWell(t *testing.T) {
	t.Parallel()
	got := turned(t, &supervisorSpy{lines: []string{threadLine, failed("Selected model is at capacity")}, lookups: []lookup{priced(`"totalCost": 0.25`)}}, "")
	if got.Failure != codex.Capacity || !reflect.DeepEqual(got.Cost, ptr(0.25)) {
		t.Errorf("reply %+v, want it failed at capacity, its cost 0.25", got)
	}
}

// cost.feature, "A cost or a count less than before is unknown".
func TestACostOrACountLessThanBeforeIsUnknown(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{lines: []string{threadLine, `{"type":"turn.completed","usage":{"input_tokens":500,"output_tokens":10}}`}, lookups: []lookup{
		priced(`"totalCost": 1, "inputTokens": 1000, "cacheReadTokens": 0, "outputTokens": 0, "reasoningOutputTokens": 0`),
		priced(`"totalCost": 0.5`),
	}}
	got := turned(t, spy, "t1")
	if got.Cost != nil || got.CostSource != "" || !reflect.DeepEqual(got.SessionCost, ptr(0.5)) {
		t.Errorf("reply %+v, want its cost unknown, its session's cost 0.5", got)
	}
	if got.Usage.Input != nil || !reflect.DeepEqual(got.Usage.Output, ptr(int64(10))) {
		t.Errorf("usage %+v, want the input unknown, the output 10", got.Usage)
	}
	if want := "ccusage could not price the thread t1: the cost fell from 1 to 0.5"; got.CostUnknown != want {
		t.Errorf("why %q, want %q", got.CostUnknown, want)
	}
}

// cost.feature, "A turn with no reply or thread has no lookup after".
func TestATurnWithNoReplyOrThreadHasNoLookupAfter(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name  string
		spy   *supervisorSpy
		reply bool
	}{
		{"ended by SIGTERM", &supervisorSpy{lines: []string{threadLine, completedLine}, result: codex.Ended{Signal: "terminated"}}, false},
		{"no thread.started", &supervisorSpy{lines: []string{completedLine}}, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			turn := codex.Turn{Message: "m", Options: []string{"read-only"}}
			got, err := wrapper(t, c.spy, t.TempDir()).Run(context.Background(), turn, discard)
			if err != nil {
				t.Fatal(err)
			}
			if want := []string{"codex"}; !reflect.DeepEqual(names(c.spy), want) {
				t.Errorf("ran %q, want %q", names(c.spy), want)
			}
			if (got.Reply != nil) != c.reply || got.Reply != nil && (got.Reply.Cost != nil || got.Reply.SessionCost != nil) {
				t.Errorf("turn gave %+v, reply %+v; want a reply %v, its cost unknown", got, got.Reply, c.reply)
			}
		})
	}
}
