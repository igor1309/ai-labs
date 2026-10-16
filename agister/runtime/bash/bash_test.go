package bash_test

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/supervisor"
)

// supervisorSpy answers in place of the supervisor: it keeps each program
// it is asked to run, and gives the result and the error its test gives.
type supervisorSpy struct {
	result supervisor.Result
	err    error
	asked  []supervisor.Program
}

func (s *supervisorSpy) Run(_ context.Context, program supervisor.Program) (supervisor.Result, error) {
	s.asked = append(s.asked, program)
	return s.result, s.err
}

// wrapper is the bash wrapper over spy.
func wrapper(t *testing.T, spy *supervisorSpy) *bash.Wrapper {
	t.Helper()
	w, err := bash.New(spy)
	if err != nil {
		t.Fatal(err)
	}
	return w
}

// facts.feature, "Its facts".
func TestItsFacts(t *testing.T) {
	t.Parallel()
	want := bash.Facts{
		Contract:     "bash/1",
		Schema:       false,
		Session:      false,
		Skills:       false,
		Model:        false,
		Efforts:      nil,
		ToolCalls:    false,
		ToolCommands: false,
	}
	if got := wrapper(t, &supervisorSpy{}).Facts(); !reflect.DeepEqual(got, want) {
		t.Errorf("facts\n got %+v\nwant %+v", got, want)
	}
}

// run.feature, "A turn asks the supervisor for bash -c and the script".
func TestATurnAsksTheSupervisorForBashCAndTheScript(t *testing.T) {
	t.Parallel()
	spy := &supervisorSpy{}
	if _, err := wrapper(t, spy).Run(context.Background(), bash.Turn{Script: "echo hi", Dir: "/r", Env: []string{"goal=g"}}); err != nil {
		t.Fatal(err)
	}
	want := []supervisor.Program{{Name: "bash", Args: []string{"-c", "echo hi"}, Dir: "/r", Env: []string{"goal=g"}}}
	if !reflect.DeepEqual(spy.asked, want) {
		t.Errorf("asked\n got %+v\nwant %+v", spy.asked, want)
	}
}

// run.feature, "What the supervisor gives is the turn's", for a program
// that exited and one a signal ended.
func TestWhatTheSupervisorGivesIsTheTurns(t *testing.T) {
	t.Parallel()
	for _, given := range []supervisor.Result{
		{
			Code:   4,
			Stdout: supervisor.Stream{Head: "o", Tail: "o", Size: 1, Digest: "od"},
			Stderr: supervisor.Stream{Head: "e", Tail: "e", Size: 1, Digest: "ed"},
		},
		{
			Signal: "terminated",
			Stdout: supervisor.Stream{Head: "oh", Tail: "ot", Size: 3, Digest: "od"},
			Stderr: supervisor.Stream{Head: "eh", Tail: "et", Size: 5, Digest: "ed"},
		},
	} {
		t.Run(fmt.Sprintf("code %d, signal %q", given.Code, given.Signal), func(t *testing.T) {
			t.Parallel()
			got, err := wrapper(t, &supervisorSpy{result: given}).Run(context.Background(), bash.Turn{Script: "s"})
			if err != nil {
				t.Fatal(err)
			}
			if got != given {
				t.Errorf("turn gave %+v, want %+v", got, given)
			}
		})
	}
}

// run.feature, "A program that could not start is the turn's".
func TestAProgramThatCouldNotStartIsTheTurns(t *testing.T) {
	t.Parallel()
	given := fmt.Errorf("%w: bash: not found", supervisor.ErrNotStarted)
	_, err := wrapper(t, &supervisorSpy{err: given}).Run(context.Background(), bash.Turn{Script: "s"})
	if !errors.Is(err, supervisor.ErrNotStarted) {
		t.Errorf("turn gave %v, want %v", err, supervisor.ErrNotStarted)
	}
}

// The bash wrapper is built with its supervisor.
func TestTheWrapperNeedsASupervisor(t *testing.T) {
	t.Parallel()
	if _, err := bash.New(nil); err == nil {
		t.Error("a bash wrapper built with no supervisor, want an error")
	}
}
