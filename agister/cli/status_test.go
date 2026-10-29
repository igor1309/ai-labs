package cli_test

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
)

func TestStatusPrintsEveryStateAndParallelActivity(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	until := at.Add(time.Minute)
	for _, c := range []struct {
		name  string
		state cli.RunState
		text  string
	}{
		{"running", cli.RunState{Status: "running", Active: []cli.RunActivity{{Step: "build", Since: at}}}, "running build since 2026-10-29T12:00:00Z"},
		{"startup", cli.RunState{Status: "running", Since: at}, "running since 2026-10-29T12:00:00Z"},
		{"capacity", cli.RunState{Status: "waiting", Active: []cli.RunActivity{{Step: "review", Since: at, WaitingOn: "capacity", Until: &until}}}, "waiting on capacity since 2026-10-29T12:00:00Z until 2026-10-29T12:01:00Z (review)"},
		{"fallback", cli.RunState{Status: "waiting", Active: []cli.RunActivity{{Step: "review", Since: at, WaitingOn: "fallback"}}}, "waiting on fallback since 2026-10-29T12:00:00Z (review)"},
		{"recovery", cli.RunState{Status: "waiting", Active: []cli.RunActivity{{Step: "review", Since: at, WaitingOn: "recovery"}}}, "waiting on recovery since 2026-10-29T12:00:00Z (review)"},
		{"parallel", cli.RunState{Status: "running", Active: []cli.RunActivity{{Step: "a", Since: at}, {Step: "b", Since: at, WaitingOn: "capacity", Until: &until}}}, "running a since 2026-10-29T12:00:00Z; waiting on capacity since 2026-10-29T12:00:00Z until 2026-10-29T12:01:00Z (b)"},
		{"stalled", cli.RunState{Status: "writer stalled", Since: at}, "writer stalled since 2026-10-29T12:00:00Z"},
		{"failed", cli.RunState{Status: "failed", Class: "persistence", Reason: "disk\n full"}, "failed: persistence: disk full"},
		{"interrupted", cli.RunState{Status: "interrupted", Class: "cancelled", Reason: "signal"}, "failed: cancelled: signal"},
		{"lost", cli.RunState{Status: "lost"}, "lost (process gone)"},
		{"unknown", cli.RunState{Status: "unknown"}, "unknown"},
		{"completed", cli.RunState{Status: "completed"}, "completed"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			c.state.ID = "R1"
			spy := &portSpy{states: []cli.RunState{c.state}}
			run(t, spy, "status", "R1").expect(t, "R1: "+c.text+"\n", 0)
			if !reflect.DeepEqual(spy.requests, []request{{op: "states", id: "R1"}}) {
				t.Fatalf("requests %+v", spy.requests)
			}
		})
	}
}

func TestStatusSelectorsAndJSON(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		args    string
		request request
	}{
		{"status", request{op: "states"}},
		{"status R1 --json", request{op: "states", id: "R1"}},
		{"--json status --last", request{op: "last"}},
		{"runs list --json", request{op: "states"}},
		{"runs list", request{op: "states"}},
	} {
		t.Run(c.args, func(t *testing.T) {
			t.Parallel()
			states := []cli.RunState{{ID: "new", Status: "unknown"}, {ID: "old", Status: "completed"}}
			spy := &portSpy{states: states}
			got := run(t, spy, strings.Fields(c.args)...)
			if got.code != 0 || got.stderr != "" {
				t.Fatalf("result %+v", got)
			}
			if strings.Contains(c.args, "--json") {
				var decoded []cli.RunState
				if err := json.Unmarshal([]byte(got.stdout), &decoded); err != nil || !reflect.DeepEqual(decoded, states) {
					t.Fatalf("JSON %q, %v", got.stdout, err)
				}
			} else if got.stdout != "new: unknown\nold: completed\n" {
				t.Fatalf("output %q", got.stdout)
			}
			if !reflect.DeepEqual(spy.requests, []request{c.request}) {
				t.Fatalf("requests %+v", spy.requests)
			}
		})
	}
	got := run(t, &portSpy{}, "status", "--json")
	got.expect(t, "[]\n", 0)
}

func TestStatusRejectsBadSelectorsAndFlags(t *testing.T) {
	t.Parallel()
	for _, args := range []string{"status R1 --last", "status R1 R2", "status --last=x", "status --json=true", "status --to /out", "status --dir /work", "check --last", "run w --json", "runs list --last", "runs list R1"} {
		t.Run(args, func(t *testing.T) {
			t.Parallel()
			spy := &portSpy{}
			got := run(t, spy, strings.Fields(args)...)
			if got.code != 2 || got.stdout != "" || len(spy.requests) != 0 {
				t.Fatalf("result %+v, requests %+v", got, spy.requests)
			}
		})
	}
}

func TestHelpListsStatusAndRunsList(t *testing.T) {
	t.Parallel()
	for _, arg := range []string{"--help", "-h"} {
		t.Run(arg, func(t *testing.T) {
			t.Parallel()
			spy := &portSpy{}
			got := run(t, spy, arg)
			if got.code != 0 || got.stderr != "" || !strings.Contains(got.stdout, "agister status [<run-id>|--last] [--json]") || !strings.Contains(got.stdout, "agister runs list") || len(spy.requests) != 0 {
				t.Fatalf("help %+v, requests %+v", got, spy.requests)
			}
		})
	}
}

func TestStatusReportsInspectionAndOutputErrors(t *testing.T) {
	t.Parallel()
	got := run(t, &portSpy{err: errors.New("corrupt log")}, "status", "R1")
	if got.code != 1 || got.stderr != "agister: corrupt log\n" || got.stdout != "" {
		t.Fatalf("result %+v", got)
	}
	for _, args := range [][]string{{"status"}, {"status", "--json"}} {
		var stderr strings.Builder
		spy := &portSpy{states: []cli.RunState{{ID: "R1", Status: "completed"}}}
		c, err := cli.New(spy, spy, spy, spy, &failingWriter{err: errors.New("broken pipe")}, &stderr)
		if err != nil {
			t.Fatal(err)
		}
		if code := c.Run(args, "/work"); code != 1 || !strings.Contains(stderr.String(), "broken pipe") {
			t.Fatalf("exit %d, stderr %q", code, stderr.String())
		}
	}
}
