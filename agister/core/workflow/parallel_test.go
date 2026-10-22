package workflow_test

import (
	"context"
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/workflow"
)

// parallel is the parallel name of steps.
func parallel(name string, steps ...workflow.Step) workflow.Step {
	return workflow.Step{Name: name, Parallel: steps}
}

// after is a call that waits until ended is closed, then answers by
// answer.
func after(ended <-chan struct{}, answer func() workflow.Result) func() workflow.Result {
	return func() workflow.Result {
		<-ended
		return answer()
	}
}

// closing is a call that answers by answer, closing ended as it does.
func closing(ended chan struct{}, answer func() workflow.Result) func() workflow.Result {
	return func() workflow.Result {
		defer close(ended)
		return answer()
	}
}

// parallel.feature, "Each step of a parallel is called before any has
// ended": each call waits until both have been called, which only calls
// made at once get past; each step is bound by its own bindings.
func TestEachStepOfAParallelIsCalledBeforeAnyHasEnded(t *testing.T) {
	t.Parallel()
	var both sync.WaitGroup
	both.Add(2)
	meets := func() workflow.Result {
		both.Done()
		both.Wait()
		return completes(0)()
	}
	f := newFixture(t, workflow.Boundary{Params: map[string]string{"goal": "x"}},
		map[string]func() workflow.Result{"a": meets, "b": meets})
	got := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
		parallel("p",
			workflow.Step{Name: "a", Bindings: []workflow.Binding{bind("g", param("goal"))}},
			workflow.Step{Name: "b", Bindings: []workflow.Binding{bind("h", text("2"))}}),
	}}, map[string]string{"goal": "x"})
	if got.Status != workflow.Completed || got.Class != "" {
		t.Errorf("ended %q, class %q; want completed", got.Status, got.Class)
	}
	if len(f.trail) != 3 || f.trail[0] != "resolve" || !slices.Equal(slices.Sorted(slices.Values(f.trail[1:])), []string{"a", "b"}) {
		t.Errorf("asked %q, want resolve, then a and b", f.trail)
	}
	if want := map[string]map[string]string{"a": {"g": "x"}, "b": {"h": "2"}}; !reflect.DeepEqual(f.caller.bound, want) {
		t.Errorf("params by step %v, want %v", f.caller.bound, want)
	}
}

// parallel.feature, "A join reads each step's end, in declaration order".
func TestAJoinReadsEachStepsEndInDeclarationOrder(t *testing.T) {
	t.Parallel()
	bEnded, cEnded := make(chan struct{}), make(chan struct{})
	output := func(v int) func() workflow.Result {
		return func() workflow.Result {
			return workflow.Result{Status: workflow.Completed, Output: map[string]any{"v": v}}
		}
	}
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
		"a": after(cEnded, output(1)),
		"b": closing(bEnded, output(2)),
		"c": closing(cEnded, after(bEnded, func() workflow.Result {
			return workflow.Result{Status: workflow.Failed, Class: "rate_limited", Reason: "r"}
		})),
		"j": completes(0),
	})
	f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
		parallel("p", workflow.Step{Name: "a"}, workflow.Step{Name: "b"}, workflow.Step{Name: "c"}),
		{Name: "j", Bindings: []workflow.Binding{bind("all", outputs("p", ""))}},
	}}, nil)
	all, ok := f.caller.bound["j"]["all"]
	if !ok {
		t.Fatalf("j called with %v, want all", f.caller.bound["j"])
	}
	var got any
	if err := json.Unmarshal([]byte(all), &got); err != nil {
		t.Fatalf("all %q: %v", all, err)
	}
	want := []any{
		map[string]any{"status": "completed", "class": nil, "output": map[string]any{"v": float64(1)}},
		map[string]any{"status": "completed", "class": nil, "output": map[string]any{"v": float64(2)}},
		map[string]any{"status": "failed", "class": "rate_limited", "output": nil},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("all\n got %v\nwant %v", got, want)
	}
}

// parallel.feature, "A step that does not complete does not end the run":
// the join is called, and the run ends as it ends, not as "b" did.
func TestAStepThatDoesNotCompleteDoesNotEndTheRun(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		status workflow.Status
		class  workflow.Class
	}{
		{"failed", "runtime_error"},
		{"interrupted", "timeout"},
		{"lost", "no_result"},
	} {
		t.Run(string(c.status)+" "+string(c.class), func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
				"a": completes(0),
				"b": func() workflow.Result { return workflow.Result{Status: c.status, Class: c.class, Reason: "rb"} },
				"j": func() workflow.Result { return workflow.Result{Status: workflow.Failed, Class: "auth", Reason: "rj"} },
			})
			got := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
				parallel("p", workflow.Step{Name: "a"}, workflow.Step{Name: "b"}),
				{Name: "j", Bindings: []workflow.Binding{bind("all", outputs("p", ""))}},
			}}, nil)
			if !slices.Contains(f.trail, "j") {
				t.Errorf("asked %q, want j called", f.trail)
			}
			if got.Status != workflow.Failed || got.Class != "auth" || got.Reason != "rj" {
				t.Errorf("ended %q, class %q, reason %q; want j's: failed, auth, rj", got.Status, got.Class, got.Reason)
			}
		})
	}
}

// parallel.feature, "A run whose last item is a parallel completes".
func TestARunWhoseLastItemIsAParallelCompletes(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
		"a": completes(0),
		"b": func() workflow.Result {
			return workflow.Result{Status: workflow.Failed, Class: "runtime_error", Reason: "r"}
		},
	})
	got := f.runner.Run(context.Background(), workflow.Workflow{
		Steps:   []workflow.Step{parallel("p", workflow.Step{Name: "a"}, workflow.Step{Name: "b"})},
		Outputs: []workflow.Binding{bind("all", outputs("p", ""))},
	}, nil)
	want := map[string]any{"all": []any{
		map[string]any{"status": "completed", "class": nil, "output": map[string]any{"exit_code": 0}},
		map[string]any{"status": "failed", "class": "runtime_error", "output": nil},
	}}
	if got.Status != workflow.Completed || got.Class != "" || got.Reason != "" || !reflect.DeepEqual(got.Output, want) {
		t.Errorf("ended %q, class %q, reason %q, output %v; want completed, no class, no reason, %v",
			got.Status, got.Class, got.Reason, got.Output, want)
	}
}

// parallel.feature, "A cancelled run ends after its parallel's steps have
// ended": whether the steps end cancelled or complete after the run's
// cancellation, the run ends cancelled, the join not called; and a run
// cancelled before its parallel calls none of its steps.
func TestACancelledRunEndsAfterItsParallelsStepsHaveEnded(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name   string
		before bool
		end    workflow.Result
	}{
		{"the steps end cancelled", false, workflow.Result{Status: "interrupted", Class: "cancelled"}},
		{"the steps complete after the cancellation", false, workflow.Result{Status: workflow.Completed, Output: map[string]any{}}},
		{"cancelled before the parallel", true, workflow.Result{}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			var started sync.WaitGroup
			started.Add(2)
			runs := func() workflow.Result {
				started.Done()
				<-ctx.Done()
				return c.end
			}
			answers := map[string]func() workflow.Result{"a": runs, "b": runs, "j": completes(0)}
			if c.before {
				answers = map[string]func() workflow.Result{}
			}
			f := newFixture(t, workflow.Boundary{}, answers)
			w := workflow.Workflow{Steps: []workflow.Step{
				parallel("p", workflow.Step{Name: "a"}, workflow.Step{Name: "b"}),
				{Name: "j"},
			}}
			var got workflow.Result
			if c.before {
				cancel()
				got = f.runner.Run(ctx, w, nil)
			} else {
				done := make(chan workflow.Result)
				go func() { done <- f.runner.Run(ctx, w, nil) }()
				started.Wait()
				cancel()
				got = <-done
			}
			if got.Status != "interrupted" || got.Class != "cancelled" || got.Output != nil {
				t.Errorf("ended %q, class %q, output %v; want interrupted, cancelled, no output", got.Status, got.Class, got.Output)
			}
			if slices.Contains(f.trail, "j") {
				t.Errorf("asked %q, want j not called", f.trail)
			}
			var ended []string
			for _, told := range f.events.told {
				if step, ok := strings.CutSuffix(told, ` ended `+string(c.end.Status)+` "`+string(c.end.Class)+`" in 0s`); ok {
					ended = append(ended, step)
				}
			}
			want := []string{"a", "b"}
			if c.before {
				want = nil
			}
			if slices.Sort(ended); !slices.Equal(ended, want) {
				t.Errorf("told %q, want the ends of %q before the run ended", f.events.told, want)
			}
		})
	}
}

// parallel.feature, "A parallel's steps count as steps in sequence do":
// "b" ends first, and the warnings are still in declaration order.
func TestAParallelsStepsCountAsStepsInSequenceDo(t *testing.T) {
	t.Parallel()
	count := func(n int64) *int64 { return &n }
	cost := func(c float64) *float64 { return &c }
	bEnded := make(chan struct{})
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
		"a": after(bEnded, func() workflow.Result {
			return workflow.Result{Status: workflow.Completed, Usage: workflow.Usage{Input: count(10)}, Cost: cost(1),
				Session: "s1", Warnings: []string{"w1"}}
		}),
		"b": closing(bEnded, func() workflow.Result {
			return workflow.Result{Status: workflow.Completed, Usage: workflow.Usage{Input: count(5)}, Cost: cost(2),
				Warnings: []string{"w2"}}
		}),
	})
	got := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
		parallel("p", workflow.Step{Name: "a"}, workflow.Step{Name: "b"}),
	}}, nil)
	if !reflect.DeepEqual(got.Usage, workflow.Usage{Input: count(15)}) {
		t.Errorf("usage %+v, want 15 input", got.Usage)
	}
	if got.Cost == nil || *got.Cost != 3 {
		t.Errorf("cost %v, want 3", got.Cost)
	}
	if want := map[string]string{"a": "s1"}; !reflect.DeepEqual(got.Sessions, want) {
		t.Errorf("sessions %v, want %v", got.Sessions, want)
	}
	if want := []string{"w1", "w2"}; !slices.Equal(got.Warnings, want) {
		t.Errorf("warnings %q, want %q", got.Warnings, want)
	}
}

// parallel.feature, "Each step's events name the step": each step's own,
// in order, however the two interleave.
func TestEachStepsEventsNameTheStep(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"a": completes(0), "b": completes(0)})
	f.caller.tools = map[string][]workflow.Tool{"a": {{Name: "Bash", Input: "ls"}}}
	f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
		parallel("p", workflow.Step{Name: "a", Agent: "codex-sol-61"}, workflow.Step{Name: "b", Agent: "claude-opus"}),
	}}, nil)
	of := map[string][]string{}
	for _, told := range f.events.told {
		step, _, _ := strings.Cut(told, " ")
		of[step] = append(of[step], told)
	}
	want := map[string][]string{
		"a": {"a started on codex-sol-61", "a Bash ls", `a ended completed "" in 0s`},
		"b": {"b started on claude-opus", `b ended completed "" in 0s`},
	}
	if !reflect.DeepEqual(of, want) {
		t.Errorf("told\n%q\nwant each step's own\n%q", f.events.told, want)
	}
}

// A parallel whose step's binding reads what is not there is refused before
// any of its steps is called, as is a binding that reads a field within a
// parallel's outputs, which are a list.
func TestAParallelThatCannotBeBoundIsRefused(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name   string
		steps  []workflow.Step
		called trail
	}{
		{"a step's binding reading a param not given", []workflow.Step{
			parallel("p", workflow.Step{Name: "a"}, workflow.Step{Name: "b", Bindings: []workflow.Binding{bind("x", param("missing"))}}),
		}, trail{"resolve"}},
		{"a binding reading a field within its outputs", []workflow.Step{
			parallel("p", workflow.Step{Name: "a"}, workflow.Step{Name: "b"}),
			{Name: "j", Bindings: []workflow.Binding{bind("x", outputs("p", "x"))}},
		}, trail{"resolve", "a", "b"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"a": completes(0), "b": completes(0)})
			got := f.runner.Run(context.Background(), workflow.Workflow{Steps: c.steps}, nil)
			if got.Status != workflow.Failed || got.Class != workflow.Refused {
				t.Errorf("ended %q, class %q; want failed, refused", got.Status, got.Class)
			}
			if called := slices.Concat(f.trail[:1], slices.Sorted(slices.Values(f.trail[1:]))); !slices.Equal(called, c.called) {
				t.Errorf("asked %q, want %q", f.trail, c.called)
			}
		})
	}
}

// bounded is the parallel name of steps, at most max of them at once.
func bounded(name string, max int, steps ...workflow.Step) workflow.Step {
	return workflow.Step{Name: name, Parallel: steps, Max: max}
}

// overlap counts the steps running at once, and keeps the most that ever
// did. It is safe for concurrent use.
type overlap struct {
	mu            sync.Mutex
	running, most int
}

func (o *overlap) enter() {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.running++
	o.most = max(o.most, o.running)
}

func (o *overlap) leave() {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.running--
}

// parallel.feature, "With max 1, a parallel's steps run one at a time, in
// order": each step says it entered, then runs until the test ends it,
// and the test ends each as it enters, in declaration order.
func TestWithMax1AParallelsStepsRunOneAtATimeInOrder(t *testing.T) {
	t.Parallel()
	var o overlap
	entered := make(chan string)
	release := map[string]chan struct{}{"a": make(chan struct{}), "b": make(chan struct{}), "c": make(chan struct{})}
	runs := func(name string) func() workflow.Result {
		return func() workflow.Result {
			o.enter()
			defer o.leave()
			entered <- name
			<-release[name]
			return completes(0)()
		}
	}
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"a": runs("a"), "b": runs("b"), "c": runs("c")})
	done := make(chan workflow.Result)
	go func() {
		done <- f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
			bounded("p", 1, workflow.Step{Name: "a"}, workflow.Step{Name: "b"}, workflow.Step{Name: "c"}),
		}}, nil)
	}()
	var order []string
	for range 3 {
		name := <-entered
		order = append(order, name)
		close(release[name])
	}
	got := <-done
	if !slices.Equal(order, []string{"a", "b", "c"}) || o.most != 1 {
		t.Errorf("entered %q, at most %d at once; want a, b, c, one at a time", order, o.most)
	}
	if got.Status != workflow.Completed {
		t.Errorf("ended %q, class %q; want completed", got.Status, got.Class)
	}
}

// parallel.feature, "With max 2, two steps run at once, never three":
// "a" and "b" meet, which only steps called at once get past.
func TestWithMax2TwoStepsRunAtOnceNeverThree(t *testing.T) {
	t.Parallel()
	var o overlap
	var both sync.WaitGroup
	both.Add(2)
	meets := func() workflow.Result {
		o.enter()
		defer o.leave()
		both.Done()
		both.Wait()
		return completes(0)()
	}
	runs := func() workflow.Result {
		o.enter()
		defer o.leave()
		return completes(0)()
	}
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{"a": meets, "b": meets, "c": runs})
	got := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
		bounded("p", 2, workflow.Step{Name: "a"}, workflow.Step{Name: "b"}, workflow.Step{Name: "c"}),
	}}, nil)
	if got.Status != workflow.Completed || o.most != 2 {
		t.Errorf("ended %q, at most %d at once; want completed, two", got.Status, o.most)
	}
	if f.trail[len(f.trail)-1] != "c" {
		t.Errorf("asked %q, want c last", f.trail)
	}
}

// parallel.feature, "With max 1, a step that does not complete does not
// stop the next".
func TestWithMax1AStepThatDoesNotCompleteDoesNotStopTheNext(t *testing.T) {
	t.Parallel()
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
		"a": func() workflow.Result {
			return workflow.Result{Status: workflow.Failed, Class: "capacity", Reason: "r"}
		},
		"b": func() workflow.Result {
			return workflow.Result{Status: workflow.Completed, Output: map[string]any{"v": 2}}
		},
		"c": func() workflow.Result { return workflow.Result{Status: workflow.Interrupted, Class: "timeout"} },
		"j": completes(0),
	})
	got := f.runner.Run(context.Background(), workflow.Workflow{Steps: []workflow.Step{
		bounded("p", 1, workflow.Step{Name: "a"}, workflow.Step{Name: "b"}, workflow.Step{Name: "c"}),
		{Name: "j", Bindings: []workflow.Binding{bind("all", outputs("p", ""))}},
	}}, nil)
	if want := (trail{"resolve", "a", "b", "c", "j"}); !slices.Equal(f.trail, want) || got.Status != workflow.Completed {
		t.Errorf("asked %q, ended %q; want %q, completed", f.trail, got.Status, want)
	}
	var all any
	if err := json.Unmarshal([]byte(f.caller.bound["j"]["all"]), &all); err != nil {
		t.Fatalf("all %q: %v", f.caller.bound["j"]["all"], err)
	}
	want := []any{
		map[string]any{"status": "failed", "class": "capacity", "output": nil},
		map[string]any{"status": "completed", "class": nil, "output": map[string]any{"v": float64(2)}},
		map[string]any{"status": "interrupted", "class": "timeout", "output": nil},
	}
	if !reflect.DeepEqual(all, want) {
		t.Errorf("all\n got %v\nwant %v", all, want)
	}
}

// parallel.feature, "With max 1, a cancelled run calls no further step":
// "b", not called, spends nothing, so the run's cost stays known.
func TestWithMax1ACancelledRunCallsNoFurtherStep(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	started := make(chan struct{})
	f := newFixture(t, workflow.Boundary{}, map[string]func() workflow.Result{
		"a": func() workflow.Result {
			close(started)
			<-ctx.Done()
			return workflow.Result{Status: workflow.Interrupted, Class: workflow.Cancelled, Cost: new(float64)}
		},
	})
	done := make(chan workflow.Result)
	go func() {
		done <- f.runner.Run(ctx, workflow.Workflow{Steps: []workflow.Step{
			bounded("p", 1, workflow.Step{Name: "a"}, workflow.Step{Name: "b"}),
			{Name: "j"},
		}}, nil)
	}()
	<-started
	cancel()
	got := <-done
	if want := (trail{"resolve", "a"}); !slices.Equal(f.trail, want) {
		t.Errorf("asked %q, want %q", f.trail, want)
	}
	if got.Status != workflow.Interrupted || got.Class != workflow.Cancelled || got.Cost == nil {
		t.Errorf("ended %q, class %q, cost %v; want interrupted, cancelled, a known cost", got.Status, got.Class, got.Cost)
	}
}
