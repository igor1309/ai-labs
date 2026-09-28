package run_test

import (
	"errors"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func TestConclude(t *testing.T) {
	jsonOutput := definition.Output{Format: "json"}
	text := definition.Output{Format: "text"}
	completed := run.Turn{Status: run.Completed, Output: []byte(`{"verdict":"request_changes"}`)}
	cases := []struct {
		name       string
		turn       run.Turn
		output     definition.Output
		validation error
		status     run.Status
		class      run.Class
	}{
		// A domain result is output of a completed node, whatever it says.
		{"verdict is output", completed, jsonOutput, nil, run.Completed, ""},
		{"invalid output", completed, jsonOutput, errors.New("bad"), run.Failed, run.ClassInvalidOutput},
		{"text needs no validation", run.Turn{Status: run.Completed, Text: "hi"}, text, nil, run.Completed, ""},
		{"runtime failure kept", run.Turn{Status: run.Failed, Error: run.Fault(run.ClassRateLimited, "")}, jsonOutput, nil, run.Failed, run.ClassRateLimited},
		{"interruption kept", run.Turn{Status: run.Interrupted, Error: run.Fault(run.ClassTimeout, "")}, text, nil, run.Interrupted, run.ClassTimeout},
		{"a failure without a reason still has a class", run.Turn{Status: run.Lost}, text, nil, run.Lost, run.ClassRuntimeError},
	}
	for _, c := range cases {
		status, fault := run.Conclude(c.turn, c.output, c.validation)
		class := run.Class("")
		if fault != nil {
			class = fault.Class
		}
		if status != c.status || class != c.class {
			t.Errorf("%s: %s/%s, want %s/%s", c.name, status, class, c.status, c.class)
		}
	}
}

func TestEveryClassBelongsToOneStatus(t *testing.T) {
	want := map[run.Class]run.Status{
		run.ClassRefused: run.Failed, run.ClassInvalidOutput: run.Failed, run.ClassBudgetExhausted: run.Failed,
		run.ClassRateLimited: run.Failed, run.ClassAuth: run.Failed, run.ClassContextOverflow: run.Failed,
		run.ClassRuntimeError: run.Failed, run.ClassRuntimeUnavailable: run.Failed, run.ClassInternal: run.Failed,
		run.ClassTimeout: run.Interrupted, run.ClassCancelled: run.Interrupted,
		run.ClassNoResult: run.Lost, run.ClassKilled: run.Lost, run.ClassAbandoned: run.Lost,
	}
	for class, status := range want {
		if got := run.StatusOf(class); got != status {
			t.Errorf("%s: %s, want %s", class, got, status)
		}
	}
}
