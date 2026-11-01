package cli_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
)

// run.feature, "A request names a workflow or a step, with its params".
// A param's value runs to the end of its argument, "=" and all, and is
// given after "=" too.
func TestARequestNamesAWorkflowOrAStepWithItsParams(t *testing.T) {
	t.Parallel()
	cases := []struct {
		args   string
		run    cli.Request
		launch string
	}{
		{"run w", cli.Request{Workflow: "w"}, "/work"},
		{"run w --param a=1 --param b=x=y", cli.Request{Workflow: "w", Params: map[string]string{"a": "1", "b": "x=y"}}, "/work"},
		{"run --process p --agent a --dir /d", cli.Request{Process: "p", Agent: "a"}, "/d"},
		{"--param=a= run --dir d --agent=a --process p", cli.Request{Process: "p", Agent: "a", Params: map[string]string{"a": ""}}, "/work/d"},
	}
	for _, c := range cases {
		t.Run(c.args, func(t *testing.T) {
			t.Parallel()
			spy := &portSpy{result: cli.Result{Status: cli.RunCompleted}}
			run(t, spy, strings.Fields(c.args)...)
			if want := []request{{op: "run", launch: c.launch, run: c.run}}; !reflect.DeepEqual(spy.requests, want) {
				t.Errorf("requests %+v, want %+v", spy.requests, want)
			}
		})
	}
}

// run.feature, "A request may continue a run": with params and --dir
// too, the last --continue given the one.
func TestARequestMayContinueARun(t *testing.T) {
	t.Parallel()
	cases := []struct {
		args   string
		run    cli.Request
		launch string
	}{
		{"run w --continue R1", cli.Request{Workflow: "w", Continue: "R1"}, "/work"},
		{"run --process p --agent a --continue R1", cli.Request{Process: "p", Agent: "a", Continue: "R1"}, "/work"},
		{"--continue=R0 run w --param a=1 --dir /d --continue R1", cli.Request{Workflow: "w", Params: map[string]string{"a": "1"}, Continue: "R1"}, "/d"},
	}
	for _, c := range cases {
		t.Run(c.args, func(t *testing.T) {
			t.Parallel()
			spy := &portSpy{result: cli.Result{Status: cli.RunCompleted}}
			run(t, spy, strings.Fields(c.args)...)
			if want := []request{{op: "run", launch: c.launch, run: c.run}}; !reflect.DeepEqual(spy.requests, want) {
				t.Errorf("requests %+v, want %+v", spy.requests, want)
			}
		})
	}
}

// run.feature, "A request may reuse a run": with params and --dir too,
// the last --reuse given the one.
func TestARequestMayReuseARun(t *testing.T) {
	t.Parallel()
	cases := []struct {
		args   string
		run    cli.Request
		launch string
	}{
		{"run w --reuse R1", cli.Request{Workflow: "w", Reuse: "R1"}, "/work"},
		{"run --process p --agent a --reuse R1", cli.Request{Process: "p", Agent: "a", Reuse: "R1"}, "/work"},
		{"--reuse=R0 run w --param a=1 --dir /d --reuse R1", cli.Request{Workflow: "w", Params: map[string]string{"a": "1"}, Reuse: "R1"}, "/d"},
	}
	for _, c := range cases {
		t.Run(c.args, func(t *testing.T) {
			t.Parallel()
			spy := &portSpy{result: cli.Result{Status: cli.RunCompleted}}
			run(t, spy, strings.Fields(c.args)...)
			if want := []request{{op: "run", launch: c.launch, run: c.run}}; !reflect.DeepEqual(spy.requests, want) {
				t.Errorf("requests %+v, want %+v", spy.requests, want)
			}
		})
	}
}

// run.feature, "The result is printed as JSON, and the exit code says
// whether the run completed". The run's id, a cost, each count of usage, 0
// included, a session and a reason the run reports are printed as they
// are, and a run with no output, no sessions or no warnings prints them as
// none.
func TestTheResultIsPrintedAsJSONAndTheExitCodeSaysWhetherTheRunCompleted(t *testing.T) {
	t.Parallel()
	started := time.Date(2026, 10, 16, 10, 0, 0, 0, time.UTC)
	timing := cli.Timing{Started: started, Ended: started.Add(1500 * time.Millisecond), Duration: 1500 * time.Millisecond}
	const printedTiming = `  "timing": {
    "started": "2026-10-16T10:00:00Z",
    "ended": "2026-10-16T10:00:01.5Z",
    "duration_ms": 1500
  },
`
	const unknown = `  "cost": null,
  "usage": {
    "input_tokens": null,
    "output_tokens": null,
    "cache_read_tokens": null,
    "cache_write_tokens": null,
    "reasoning_tokens": null
  },
  "sessions": {},
  "reason": null,
`
	cost := 0.25
	input, output := int64(10), int64(3)
	count := func(n int64) *int64 { return &n }
	cases := []struct {
		name   string
		result cli.Result
		stdout string
		code   int
	}{
		{"completed", cli.Result{RunID: "r1", Status: cli.RunCompleted,
			Output:   map[string]any{"exit_code": 0, "stdout": map[string]any{"head": "<hi> & bye\n", "size": 11}},
			Timing:   timing,
			Warnings: []string{`its plan grants "network"`}}, `{
  "run_id": "r1",
  "status": "completed",
  "class": null,
  "output": {
    "exit_code": 0,
    "stdout": {
      "head": "<hi> & bye\n",
      "size": 11
    }
  },
` + printedTiming + unknown + `  "warnings": [
    "its plan grants \"network\""
  ]
}
`, 0},
		{"failed, killed", cli.Result{RunID: "r1", Status: cli.RunFailed, Class: "killed", Timing: timing}, `{
  "run_id": "r1",
  "status": "failed",
  "class": "killed",
  "output": null,
` + printedTiming + unknown + `  "warnings": []
}
`, 1},
		{"interrupted, timeout", cli.Result{RunID: "r1", Status: cli.RunInterrupted, Class: "timeout", Output: map[string]any{}, Timing: timing}, `{
  "run_id": "r1",
  "status": "interrupted",
  "class": "timeout",
  "output": {},
` + printedTiming + unknown + `  "warnings": []
}
`, 1},
		{"lost, no_result", cli.Result{RunID: "r1", Status: cli.RunLost, Class: "no_result", Timing: timing}, `{
  "run_id": "r1",
  "status": "lost",
  "class": "no_result",
  "output": null,
` + printedTiming + unknown + `  "warnings": []
}
`, 1},
		{"completed, a cost, usage and a session reported", cli.Result{RunID: "r1", Status: cli.RunCompleted, Output: map[string]any{}, Timing: timing, Cost: &cost,
			Usage: cli.Usage{Input: &input, Output: &output}, Sessions: map[string]string{"ask": "s1"}}, `{
  "run_id": "r1",
  "status": "completed",
  "class": null,
  "output": {},
` + printedTiming + `  "cost": 0.25,
  "usage": {
    "input_tokens": 10,
    "output_tokens": 3,
    "cache_read_tokens": null,
    "cache_write_tokens": null,
    "reasoning_tokens": null
  },
  "sessions": {
    "ask": "s1"
  },
  "reason": null,
  "warnings": []
}
`, 0},
		{"completed, every count of usage reported", cli.Result{RunID: "r1", Status: cli.RunCompleted, Output: map[string]any{}, Timing: timing,
			Usage: cli.Usage{Input: count(10), Output: count(3), CacheRead: count(7), CacheWrite: count(5), Reasoning: count(2)}}, `{
  "run_id": "r1",
  "status": "completed",
  "class": null,
  "output": {},
` + printedTiming + `  "cost": null,
  "usage": {
    "input_tokens": 10,
    "output_tokens": 3,
    "cache_read_tokens": 7,
    "cache_write_tokens": 5,
    "reasoning_tokens": 2
  },
  "sessions": {},
  "reason": null,
  "warnings": []
}
`, 0},
		{"completed, every count of usage 0", cli.Result{RunID: "r1", Status: cli.RunCompleted, Output: map[string]any{}, Timing: timing,
			Usage: cli.Usage{Input: count(0), Output: count(0), CacheRead: count(0), CacheWrite: count(0), Reasoning: count(0)}}, `{
  "run_id": "r1",
  "status": "completed",
  "class": null,
  "output": {},
` + printedTiming + `  "cost": null,
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "reasoning_tokens": 0
  },
  "sessions": {},
  "reason": null,
  "warnings": []
}
`, 0},
		{"failed, a reason reported", cli.Result{RunID: "r1", Status: cli.RunFailed, Class: "auth", Timing: timing, Reason: "not logged in"}, `{
  "run_id": "r1",
  "status": "failed",
  "class": "auth",
  "output": null,
` + printedTiming + `  "cost": null,
  "usage": {
    "input_tokens": null,
    "output_tokens": null,
    "cache_read_tokens": null,
    "cache_write_tokens": null,
    "reasoning_tokens": null
  },
  "sessions": {},
  "reason": "not logged in",
  "warnings": []
}
`, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			run(t, &portSpy{result: c.result}, "run", "w").expect(t, c.stdout, c.code)
		})
	}
}

// run.feature, "A refusal is printed to stderr and exits 1".
func TestARefusalIsPrintedToStderrAndExits1(t *testing.T) {
	t.Parallel()
	got := run(t, &portSpy{err: errors.New(`the process "p" is blocked`)}, "run", "w")
	if want := (ran{stderr: "agister: the process \"p\" is blocked\n", code: 1}); got != want {
		t.Errorf("ran %+v, want %+v", got, want)
	}
}

// run.feature, "A bad run command prints its usage and exits 2". So do an
// agent with no process, a param with no name or given twice, a run flag
// with no value, a run flag on another command, --continue or --reuse
// with no request, and --reuse with --continue in either order.
func TestABadRunCommandPrintsItsUsageAndExits2(t *testing.T) {
	t.Parallel()
	cases := []string{
		"run",
		"run w --process p",
		"run --process p",
		"run w --param a",
		"run w x",
		"run --agent a",
		"run w --agent a",
		"run w --param =1",
		"run w --param a=1 --param a=2",
		"run w --param",
		"run --process= --agent a",
		"run w --continue",
		"run --continue R1",
		"run --agent a --continue R1",
		"run w --reuse",
		"run --reuse R1",
		"run w --continue R1 --reuse R2",
		"run w --reuse R1 --continue R2",
		"run --process p --agent a --continue R1 --reuse R2",
		"check --param a=1",
		"check --continue R1",
		"check --reuse R1",
		"inspect agents --agent a",
	}
	for _, args := range cases {
		t.Run(args, func(t *testing.T) {
			t.Parallel()
			spy := &portSpy{}
			got := run(t, spy, strings.Fields(args)...)
			if got.code != 2 {
				t.Errorf("exit %d, want 2", got.code)
			}
			if !strings.Contains(got.stderr, "\n  agister run <workflow> [--param <name>=<value>]... [--continue <run id> | --reuse <run id>] [--dir <directory>]\n") {
				t.Errorf("stderr %q, want the usage", got.stderr)
			}
			if got.stdout != "" {
				t.Errorf("stdout %q, want none", got.stdout)
			}
			if spy.requests != nil {
				t.Errorf("the port is asked %+v, want nothing", spy.requests)
			}
		})
	}
}
