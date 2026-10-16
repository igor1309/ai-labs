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

// run.feature, "The result is printed as JSON, and the exit code says
// whether the run completed". A cost the run reports is printed as it is,
// and a run with no output or no warnings prints them as none.
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
	cost := 0.25
	cases := []struct {
		name   string
		result cli.Result
		stdout string
		code   int
	}{
		{"completed", cli.Result{Status: cli.RunCompleted,
			Output:   map[string]any{"exit_code": 0, "stdout": map[string]any{"head": "<hi> & bye\n", "size": 11}},
			Timing:   timing,
			Warnings: []string{`its plan grants "network"`}}, `{
  "status": "completed",
  "class": null,
  "output": {
    "exit_code": 0,
    "stdout": {
      "head": "<hi> & bye\n",
      "size": 11
    }
  },
` + printedTiming + `  "cost": null,
  "warnings": [
    "its plan grants \"network\""
  ]
}
`, 0},
		{"failed, killed", cli.Result{Status: cli.RunFailed, Class: "killed", Timing: timing}, `{
  "status": "failed",
  "class": "killed",
  "output": null,
` + printedTiming + `  "cost": null,
  "warnings": []
}
`, 1},
		{"interrupted, timeout", cli.Result{Status: cli.RunInterrupted, Class: "timeout", Output: map[string]any{}, Timing: timing}, `{
  "status": "interrupted",
  "class": "timeout",
  "output": {},
` + printedTiming + `  "cost": null,
  "warnings": []
}
`, 1},
		{"completed, a cost reported", cli.Result{Status: cli.RunCompleted, Output: map[string]any{}, Timing: timing, Cost: &cost}, `{
  "status": "completed",
  "class": null,
  "output": {},
` + printedTiming + `  "cost": 0.25,
  "warnings": []
}
`, 0},
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
// with no value, and a run flag on another command.
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
		"check --param a=1",
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
			if !strings.Contains(got.stderr, "\n  agister run <workflow> [--param <name>=<value>]... [--dir <directory>]\n") {
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
