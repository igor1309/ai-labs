package run_test

import (
	"errors"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func TestJudge(t *testing.T) {
	jsonOutput := definition.Output{Format: "json", ResultField: "verdict", Reject: []string{"request_changes"}}
	completed := func(output string) run.Turn { return run.Turn{Outcome: run.TurnCompleted, Output: []byte(output)} }
	cases := []struct {
		turn       run.Turn
		output     definition.Output
		validation error
		want       run.CallOutcome
	}{
		{completed(`{"verdict":"approve"}`), jsonOutput, nil, run.CallAccepted},
		{completed(`{"verdict":"request_changes"}`), jsonOutput, nil, run.CallRejected},
		{completed(`{"verdict":"request_changes"}`), jsonOutput, errors.New("bad"), run.CallFailed},
		{run.Turn{Outcome: run.TurnFailed, Reason: "x"}, jsonOutput, nil, run.CallFailed},
		{run.Turn{Outcome: run.TurnInterrupted}, definition.Output{Format: "text"}, nil, run.CallFailed},
		{run.Turn{Outcome: run.TurnCompleted, Text: "hi"}, definition.Output{Format: "text"}, nil, run.CallAccepted},
	}
	for i, c := range cases {
		if got, reason := run.Judge(c.turn, c.output, c.validation); got != c.want {
			t.Errorf("case %d: %s (%s), want %s", i, got, reason, c.want)
		}
	}
}
