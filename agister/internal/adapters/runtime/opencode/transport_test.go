package opencode_test

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/opencode"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// The transport is handed the turn as the runner builds it, fresh or
// resumed: the command, the turn's arguments with its generated agent, that
// agent's config in the environment, directory, prompt on stdin, timeout and
// the runner's kill grace.
func TestTheTransportIsHandedTheTurn(t *testing.T) {
	for name, resume := range map[string]string{"fresh": "", "resumed": fresh} {
		spy := &runtimetest.Transport{}
		runner := &opencode.Runner{Transport: spy, Command: "/opt/opencode", KillGrace: 3 * time.Second}
		r := request("hello")
		r.Cwd = "/work"
		r.ResumeSessionID = resume
		runner.RunTurn(context.Background(), r, &runtimetest.Recorder{})

		specs := spy.Specs()
		if len(specs) != 1 {
			t.Fatalf("%s: specs = %+v", name, specs)
		}
		i := slices.Index(specs[0].Args, "--agent")
		if i < 0 || i+1 >= len(specs[0].Args) || !strings.HasPrefix(specs[0].Args[i+1], "agister-") {
			t.Fatalf("%s: no generated agent in %q", name, specs[0].Args)
		}
		agent := specs[0].Args[i+1]
		args, err := opencode.Arguments(r, agent)
		if err != nil {
			t.Fatal(err)
		}
		if resumed := follows(args, "-s", fresh); resumed != (resume != "") {
			t.Errorf("%s: -s in %q", name, args)
		}
		want := supervisor.Spec{
			Command: "/opt/opencode", Args: args, Dir: "/work",
			Env:   []string{opencode.ConfigVariable + "=" + opencode.Config(r, agent)},
			Stdin: "hello", Timeout: time.Minute, KillGrace: 3 * time.Second,
		}
		if !reflect.DeepEqual(specs[0], want) {
			t.Errorf("%s: spec =\n%+v\nwant\n%+v", name, specs[0], want)
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
		runner := &opencode.Runner{Transport: spy, Command: "opencode"}
		turn := runner.RunTurn(context.Background(), request("hello"), &runtimetest.Recorder{})
		if turn.Status != c.status || turn.Error == nil || turn.Error.Class != c.class {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

func TestIdentityAsksTheTransportForTheVersion(t *testing.T) {
	spy := &runtimetest.Transport{Output: "1.14.2"}
	identity, err := opencode.New("/opt/opencode", spy).Identity(context.Background())
	if err != nil || identity.Version != "1.14.2" || identity.Contract != opencode.Contract {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
	if versions := spy.Versions(); !reflect.DeepEqual(versions, []string{"/opt/opencode"}) {
		t.Fatalf("versions = %q", versions)
	}
	failing := &runtimetest.Transport{Err: errors.New("not found")}
	if _, err := opencode.New("opencode", failing).Identity(context.Background()); err == nil {
		t.Fatal("a failed version check must fail identity")
	}
}
