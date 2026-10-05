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
)

// spyTransport and spyRuns are the runtimetest spies over the transport types opencode
// declares.
type (
	spyTransport = runtimetest.Transport[opencode.Spec, opencode.Sink, opencode.Evidence]
	spyRuns      = runtimetest.Runs[opencode.Spec, opencode.Sink, opencode.Evidence]
)

// The transport is handed the turn as the runner builds it, fresh or
// resumed: the command, the turn's arguments with its generated agent, that
// agent's config in the environment, directory, prompt on stdin, timeout and
// the runner's kill grace.
func TestTheTransportIsHandedTheTurn(t *testing.T) {
	t.Parallel()
	for name, resume := range map[string]string{"fresh": "", "resumed": fresh} {
		spy := &spyTransport{}
		runner := &opencode.Runner{Transport: spy, Command: "/opt/opencode", KillGrace: 3 * time.Second}
		r := request("hello")
		r.Cwd = "/work"
		r.ResumeSessionID = resume
		runner.RunTurn(context.Background(), r, &sink{})

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
		want := opencode.Spec{
			Command: "/opt/opencode", Args: args, Dir: "/work",
			Env:   []string{opencode.ConfigVariable + "=" + opencode.Config(r, agent, "")},
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
	t.Parallel()
	for name, c := range map[string]struct {
		evidence opencode.Evidence
		status   opencode.Status
		class    opencode.Class
	}{
		"timeout": {opencode.Evidence{TimedOut: true, Exit: &opencode.Exit{Signal: "signal: terminated"}}, opencode.Interrupted, opencode.ClassTimeout},
		"signal":  {opencode.Evidence{Exit: &opencode.Exit{Signal: "signal: killed"}}, opencode.Lost, opencode.ClassKilled},
	} {
		spy := &spyTransport{Runs: spyRuns{Answer: func(opencode.Spec) ([]string, opencode.Evidence) { return nil, c.evidence }}}
		runner := &opencode.Runner{Transport: spy, Command: "opencode"}
		turn := runner.RunTurn(context.Background(), request("hello"), &sink{})
		if turn.Status != c.status || turn.Error == nil || turn.Error.Class != c.class {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

func TestIdentityAsksTheTransportForTheVersion(t *testing.T) {
	t.Parallel()
	spy := &spyTransport{Output: "1.14.2"}
	identity, err := opencode.New("/opt/opencode", spy).Identity(context.Background())
	if err != nil || identity.Version != "1.14.2" || identity.Contract != opencode.Contract {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
	// The adapter gives a call its skills (ADR-021 rule 6).
	if !identity.Skills {
		t.Fatalf("identity = %+v, which gives no skills", identity)
	}
	if versions := spy.Versions(); !reflect.DeepEqual(versions, []string{"/opt/opencode"}) {
		t.Fatalf("versions = %q", versions)
	}
	failing := &spyTransport{Err: errors.New("not found")}
	if _, err := opencode.New("opencode", failing).Identity(context.Background()); err == nil {
		t.Fatal("a failed version check must fail identity")
	}
}

// Classification still quotes the process's bounded stderr, including a tail
// with a cut marker, and preserves the full retained tail as evidence.
func TestTheTransportStderrDecidesASilentFailure(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		code    int
		tail    string
		omitted int64
		message string
	}{
		{1, "[100 earlier bytes of stderr cut]\nolder line\nError: too large!", 100, "exit code 1: Error: too large!"},
		{2, "", 0, "exit code 2"},
	} {
		spy := &spyTransport{Runs: spyRuns{Answer: func(opencode.Spec) ([]string, opencode.Evidence) {
			return nil, opencode.Evidence{Exit: &opencode.Exit{Code: &c.code}, StderrTail: c.tail, StderrOmitted: c.omitted}
		}}}
		runner := &opencode.Runner{Transport: spy, Command: "opencode"}
		result := runner.RunTurn(context.Background(), request("hello"), &sink{})
		if result.Status != opencode.Failed || result.Error == nil || result.Error.Class != opencode.ClassRuntimeError || result.Error.Message != c.message || result.StderrTail != c.tail || result.StderrOmitted != c.omitted {
			t.Fatalf("turn = %+v", result)
		}
	}
}
