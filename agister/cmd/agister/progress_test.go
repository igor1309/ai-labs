package main

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/igor1309/ai-labs/agister/core/call"
	"github.com/igor1309/ai-labs/agister/core/inputs"
	"github.com/igor1309/ai-labs/agister/core/workflow"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// eventsSpy is a spy of core/workflow's events: it keeps what it is told,
// in order, each a line of the step's name and what it was told of it.
type eventsSpy struct {
	told []string
}

func (s *eventsSpy) Started(step, agent string) {
	s.told = append(s.told, step+" started on "+agent)
}

func (s *eventsSpy) Tool(step string, tool workflow.Tool) {
	s.told = append(s.told, step+" "+tool.Name+" "+tool.Input)
}

func (s *eventsSpy) Stale(step string, stale workflow.Stale) {
	s.told = append(s.told, fmt.Sprintf("%s stale %s recovering %t", step, stale.What, stale.Recovering))
}

func (s *eventsSpy) Capacity(step string, capacity workflow.Capacity) {
	s.told = append(s.told, fmt.Sprintf("%s at capacity %s retrying in %v", step, capacity.Reason, capacity.Retry))
}

func (s *eventsSpy) Fallback(step, agent string) {
	s.told = append(s.told, step+" falls back to "+agent)
}

func (s *eventsSpy) Reused(step, call string) {
	s.told = append(s.told, step+" reused "+call)
}

func (s *eventsSpy) Ended(step string, ended workflow.Ended) {
	s.told = append(s.told, fmt.Sprintf("%s ended %s %s in %v", step, ended.Status, ended.Class, ended.Duration))
}

// progress.feature, "A step's start, tool calls and end, each a line".
//
// Contract test: the files home holds, as Agister ships them.
func TestAStepsStartToolCallsAndEndEachALine(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, modelSettings(t, nil), nil)
	f.runtimes.claude.reports = []claudecode.Report{
		{Tool: &claudecode.Tool{Name: "Bash", Input: `{"command":"ls"}`}}, {Tool: &claudecode.Tool{Name: "Read", Input: `{"file_path":"a.go"}`}}}
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Session: "s1", Failure: claudecode.RateLimited, Reason: "429"})
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 1 {
		t.Fatalf("stderr %q, exit %d; want nothing but progress, 1", got.stderr, got.code)
	}
	want := "· ask: started on claude-opus\n" +
		"· ask: Bash {\"command\":\"ls\"}\n" +
		"· ask: Read {\"file_path\":\"a.go\"}\n" +
		"· ask: ended failed rate_limited in 0s\n"
	if got.progress != want {
		t.Errorf("progress\n%s\nwant\n%s", got.progress, want)
	}
	decoder := json.NewDecoder(strings.NewReader(got.stdout))
	var result map[string]any
	if err := decoder.Decode(&result); err != nil || result["status"] != "failed" || decoder.More() {
		t.Errorf("stdout %q, want only the result, failed", got.stdout)
	}
}

// progress.feature, "A line is not printed; a long tool call is cut where
// printed".
//
// Contract test: the files home holds, as Agister ships them.
func TestALineIsNotPrintedALongToolCallIsCutWherePrinted(t *testing.T) {
	t.Parallel()
	f := newRunFixture(t, modelSettings(t, nil), nil)
	input := `{"content":"` + strings.Repeat("x", 486) + `"}`
	f.runtimes.claude.reports = []claudecode.Report{{}, {Tool: &claudecode.Tool{Name: "Write", Input: input}}}
	f.runtimes.claude.answer = claudeReply(claudecode.Reply{Output: []byte(`{"ok":true}`), Session: "s1"})
	got := f.run(t, "/r", "run", "--process", "ask", "--agent", "claude-opus", "--param", "q=why")
	if got.stderr != "" || got.code != 0 {
		t.Fatalf("stderr %q, exit %d; want nothing but progress, 0", got.stderr, got.code)
	}
	want := "· ask: started on claude-opus\n" +
		"· ask: Write " + input[:300] + "…\n" +
		"· ask: ended completed in 0s\n"
	if len(input) != 500 || got.progress != want {
		t.Errorf("progress\n%s\nwant\n%s", got.progress, want)
	}
}

// A step's call reports its start, then gives each tool call its turns
// report, each stale turn and each turn at capacity on to core/workflow's
// report, in core/workflow's words, in order, and no other line, a tool's
// result among them.
func TestAStepsCallGivesItsToolCallsOn(t *testing.T) {
	t.Parallel()
	resolver, err := inputs.New(map[string]inputs.Source{"param": inputs.ParamSource{}}, briefPaths{paths: &sourcesSpy{}})
	if err != nil {
		t.Fatal(err)
	}
	spy := &turnSpy{result: call.Result{Status: call.Completed}, reports: []call.Report{
		{Tool: &call.Tool{Name: "Bash", Input: "ls"}}, {Result: true}, {}, {Stale: &call.StaleTurn{What: "no event for 1m", Recovering: true}},
		{Tool: &call.Tool{Name: "Read", Input: "a.go"}}, {}, {Stale: &call.StaleTurn{What: "no event for 1m"}},
		{Capacity: &call.CapacityTurn{Reason: "Overloaded", Retry: 30 * time.Second}}, {Capacity: &call.CapacityTurn{Reason: "Overloaded"}}}}
	steps, err := newStepCalls(resolver, &admissionSpy{}, map[string]turnCaller{"bash/1": spy}, clocktest.NewClock(runStart), map[string]plannedCall{"a": sayCall("x")}, &callsSpy{}, noDailyBudget)
	if err != nil {
		t.Fatal(err)
	}
	var reported []workflow.Report
	steps.Call(context.Background(), "a", map[string]string{"what": "hi"}, "", func(r workflow.Report) { reported = append(reported, r) })
	want := []workflow.Report{{Started: true},
		{Tool: &workflow.Tool{Name: "Bash", Input: "ls"}}, {Stale: &workflow.Stale{What: "no event for 1m", Recovering: true}},
		{Tool: &workflow.Tool{Name: "Read", Input: "a.go"}}, {Stale: &workflow.Stale{What: "no event for 1m"}},
		{Capacity: &workflow.Capacity{Reason: "Overloaded", Retry: 30 * time.Second}}, {Capacity: &workflow.Capacity{Reason: "Overloaded"}}}
	if !reflect.DeepEqual(reported, want) {
		t.Errorf("reported %+v, want %+v", reported, want)
	}
}

// Each event is printed as a line: "· ", the step's name, and what it
// tells; a status with its class where it has one; a tool call's name, then
// its input where it has one; what went stale of a turn, then whether a
// recovery turn follows; a turn at capacity, then its wait where it is made
// again; the agent a call falls back to; a duration to the second from a second on,
// to the millisecond below; and a text that would break the line quoted.
func TestEachEventIsPrintedAsALine(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name string
		tell func(*progress)
		want string
	}{
		{"started", func(p *progress) { p.Started("a", "bash") }, "· a: started on bash\n"},
		{"a tool call", func(p *progress) { p.Tool("a", workflow.Tool{Name: "Bash", Input: `{"command":"ls"}`}) }, "· a: Bash {\"command\":\"ls\"}\n"},
		{"a tool call with no input", func(p *progress) { p.Tool("a", workflow.Tool{Name: "Glob"}) }, "· a: Glob\n"},
		{"an input of two lines", func(p *progress) { p.Tool("a", workflow.Tool{Name: "command", Input: "a\nb"}) }, "· a: command \"a\\nb\"\n"},
		{"stale, recovering", func(p *progress) { p.Stale("a", workflow.Stale{What: "no event for 1m", Recovering: true}) },
			"· a: stale: no event for 1m; recovering\n"},
		{"stale", func(p *progress) { p.Stale("a", workflow.Stale{What: `the tool command "Bash" ran over 1m`}) },
			"· a: stale: the tool command \"Bash\" ran over 1m\n"},
		{"at capacity, retrying", func(p *progress) { p.Capacity("a", workflow.Capacity{Reason: "Overloaded", Retry: 30 * time.Second}) },
			"· a: at capacity; retrying in 30s\n"},
		{"at capacity", func(p *progress) { p.Capacity("a", workflow.Capacity{Reason: "Overloaded"}) }, "· a: at capacity\n"},
		{"falling back", func(p *progress) { p.Fallback("a", "claude-opus") }, "· a: falling back to claude-opus\n"},
		{"completed", func(p *progress) {
			p.Ended("a", workflow.Ended{Status: workflow.Completed, Duration: 3*time.Minute + 2*time.Second + 400*time.Millisecond})
		}, "· a: ended completed in 3m2s\n"},
		{"failed", func(p *progress) {
			p.Ended("a", workflow.Ended{Status: workflow.Failed, Class: "killed", Duration: 1234567 * time.Microsecond})
		}, "· a: ended failed killed in 1s\n"},
		{"under a second", func(p *progress) {
			p.Ended("a", workflow.Ended{Status: workflow.Completed, Duration: 1234567 * time.Nanosecond})
		}, "· a: ended completed in 1ms\n"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			var out strings.Builder
			p, err := newProgress(&out)
			if err != nil {
				t.Fatal(err)
			}
			c.tell(p)
			if out.String() != c.want {
				t.Errorf("printed %q, want %q", out.String(), c.want)
			}
		})
	}
}

// Events told at once are printed each a whole line: a turn's tool calls
// come from another goroutine than its step's start and end.
func TestEventsToldAtOnceArePrintedWhole(t *testing.T) {
	t.Parallel()
	var out strings.Builder
	p, err := newProgress(&out)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p.Tool(fmt.Sprint(i), workflow.Tool{Name: "Bash", Input: "ls"})
		}()
	}
	wg.Wait()
	lines := strings.Split(strings.TrimSuffix(out.String(), "\n"), "\n")
	if len(lines) != 8 {
		t.Fatalf("printed %q, want 8 lines", out.String())
	}
	for _, line := range lines {
		if !strings.HasPrefix(line, "· ") || !strings.HasSuffix(line, ": Bash ls") {
			t.Errorf("printed the line %q, want a whole one", line)
		}
	}
}

// A tool call's input is printed short: at most 300 bytes of it, cut at
// the start of a character and marked where it was cut; one that fits is
// whole.
func TestAToolCallsInputIsPrintedShort(t *testing.T) {
	t.Parallel()
	for _, n := range []int{10, 150, 151, 400} {
		t.Run(fmt.Sprint(n), func(t *testing.T) {
			t.Parallel()
			input := strings.Repeat("é", n)
			var out strings.Builder
			p, err := newProgress(&out)
			if err != nil {
				t.Fatal(err)
			}
			p.Tool("a", workflow.Tool{Name: "Write", Input: input})
			printed, ok := strings.CutPrefix(out.String(), "· a: Write ")
			printed, ended := strings.CutSuffix(printed, "\n")
			if !ok || !ended {
				t.Fatalf("printed %q, want one line of the call", out.String())
			}
			if len(input) <= 300 {
				if printed != input {
					t.Errorf("printed %q, want it whole", printed)
				}
				return
			}
			cut, marked := strings.CutSuffix(printed, "…")
			if !marked || !strings.HasPrefix(input, cut) || len(cut) > 300 || len(cut) < 299 || !utf8.ValidString(cut) {
				t.Errorf("printed %q, want at most 300 bytes of the input, whole characters, then …", printed)
			}
		})
	}
}

// The progress is built with its writer.
func TestTheProgressNeedsAWriter(t *testing.T) {
	t.Parallel()
	if _, err := newProgress(nil); err == nil {
		t.Error("progress built with no writer, want an error")
	}
}
