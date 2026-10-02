package claudecode_test

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// The transport is handed the turn as the runner builds it, fresh or
// resumed: the command, the turn's arguments, directory, prompt on stdin,
// timeout and the runner's kill grace.
func TestTheTransportIsHandedTheTurn(t *testing.T) {
	for name, resume := range map[string]string{"fresh": "", "resumed": session} {
		spy := &runtimetest.Transport{}
		runner := &claudecode.Runner{Transport: spy, Command: "/opt/claude", KillGrace: 3 * time.Second}
		r := request("hello")
		r.Cwd = "/work"
		r.ResumeSessionID = resume
		runner.RunTurn(context.Background(), r, &runtimetest.Recorder{})

		args, err := claudecode.Arguments(r)
		if err != nil {
			t.Fatal(err)
		}
		if resumed := slices.Contains(args, "--resume"); resumed != (resume != "") {
			t.Errorf("%s: --resume in %q", name, args)
		}
		want := []supervisor.Spec{{Command: "/opt/claude", Args: args, Dir: "/work", Stdin: "hello", Timeout: time.Minute, KillGrace: 3 * time.Second}}
		if specs := spy.Specs(); !reflect.DeepEqual(specs, want) {
			t.Errorf("%s: specs =\n%+v\nwant\n%+v", name, specs, want)
		}
	}
}

// A turn the runtime reported nothing for is decided by the transport's
// evidence: Agister's timeout, or a signal Agister did not send.
func TestATurnIsDecidedByTheTransportsEvidence(t *testing.T) {
	for name, c := range map[string]struct {
		evidence supervisor.Evidence
		status   run.Status
		class    run.Class
	}{
		"timeout": {supervisor.Evidence{TimedOut: true, Exit: &run.Exit{Signal: "signal: terminated"}}, run.Interrupted, run.ClassTimeout},
		"signal":  {supervisor.Evidence{Exit: &run.Exit{Signal: "signal: killed"}}, run.Lost, run.ClassKilled},
	} {
		spy := &runtimetest.Transport{Answer: func(supervisor.Spec) ([]string, supervisor.Evidence) { return nil, c.evidence }}
		runner := &claudecode.Runner{Transport: spy, Command: "claude"}
		turn := runner.RunTurn(context.Background(), request("hello"), &runtimetest.Recorder{})
		if turn.Status != c.status || turn.Error == nil || turn.Error.Class != c.class {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

func TestIdentityAsksTheTransportForTheVersion(t *testing.T) {
	spy := &runtimetest.Transport{Output: "2.1.286 (Claude Code)"}
	identity, err := (&claudecode.Runner{Transport: spy, Command: "/opt/claude"}).Identity(context.Background())
	if err != nil || identity.Version != "2.1.286" || identity.Contract != claudecode.Contract {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
	if versions := spy.Versions(); !reflect.DeepEqual(versions, []string{"/opt/claude"}) {
		t.Fatalf("versions = %q", versions)
	}
	failing := &runtimetest.Transport{Err: errors.New("not found")}
	if _, err := (&claudecode.Runner{Transport: failing, Command: "claude"}).Identity(context.Background()); err == nil {
		t.Fatal("a failed version check must fail identity")
	}
}
