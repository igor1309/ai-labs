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
)

// spyTransport and spyRuns are the runtimetest spies over the transport types claudecode
// declares.
type (
	spyTransport = runtimetest.Transport[claudecode.Spec, claudecode.Sink, claudecode.Evidence]
	spyRuns      = runtimetest.Runs[claudecode.Spec, claudecode.Sink, claudecode.Evidence]
)

// The transport is handed the turn as the runner builds it, fresh or
// resumed: the command, the turn's arguments, directory, prompt on stdin,
// timeout and the runner's kill grace.
func TestTheTransportIsHandedTheTurn(t *testing.T) {
	for name, resume := range map[string]string{"fresh": "", "resumed": session} {
		spy := &spyTransport{}
		runner := &claudecode.Runner{Transport: spy, Command: "/opt/claude", KillGrace: 3 * time.Second}
		r := request("hello")
		r.Cwd = "/work"
		r.ResumeSessionID = resume
		runner.RunTurn(context.Background(), r, &sink{})

		args, err := claudecode.Arguments(r)
		if err != nil {
			t.Fatal(err)
		}
		if resumed := slices.Contains(args, "--resume"); resumed != (resume != "") {
			t.Errorf("%s: --resume in %q", name, args)
		}
		want := []claudecode.Spec{{Command: "/opt/claude", Args: args, Dir: "/work", Stdin: "hello", Timeout: time.Minute, KillGrace: 3 * time.Second}}
		if specs := spy.Specs(); !reflect.DeepEqual(specs, want) {
			t.Errorf("%s: specs =\n%+v\nwant\n%+v", name, specs, want)
		}
	}
}

// A turn the runtime reported nothing for is decided by the transport's
// evidence: Agister's timeout, or a signal Agister did not send.
func TestATurnIsDecidedByTheTransportsEvidence(t *testing.T) {
	for name, c := range map[string]struct {
		evidence claudecode.Evidence
		status   claudecode.Status
		class    claudecode.Class
	}{
		"timeout": {claudecode.Evidence{TimedOut: true, Exit: &claudecode.Exit{Signal: "signal: terminated"}}, claudecode.Interrupted, claudecode.ClassTimeout},
		"signal":  {claudecode.Evidence{Exit: &claudecode.Exit{Signal: "signal: killed"}}, claudecode.Lost, claudecode.ClassKilled},
	} {
		spy := &spyTransport{Runs: spyRuns{Answer: func(claudecode.Spec) ([]string, claudecode.Evidence) { return nil, c.evidence }}}
		runner := &claudecode.Runner{Transport: spy, Command: "claude"}
		turn := runner.RunTurn(context.Background(), request("hello"), &sink{})
		if turn.Status != c.status || turn.Error == nil || turn.Error.Class != c.class {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

func TestIdentityAsksTheTransportForTheVersion(t *testing.T) {
	spy := &spyTransport{Output: "2.1.286 (Claude Code)"}
	identity, err := (&claudecode.Runner{Transport: spy, Command: "/opt/claude"}).Identity(context.Background())
	if err != nil || identity.Version != "2.1.286" || identity.Contract != claudecode.Contract {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
	if versions := spy.Versions(); !reflect.DeepEqual(versions, []string{"/opt/claude"}) {
		t.Fatalf("versions = %q", versions)
	}
	failing := &spyTransport{Err: errors.New("not found")}
	if _, err := (&claudecode.Runner{Transport: failing, Command: "claude"}).Identity(context.Background()); err == nil {
		t.Fatal("a failed version check must fail identity")
	}
}

// Classification still quotes the process's bounded stderr, including a tail
// with a cut marker, and preserves the full retained tail as evidence.
func TestTheTransportStderrDecidesASilentFailure(t *testing.T) {
	for _, c := range []struct {
		code    int
		tail    string
		omitted int64
		message string
	}{
		{1, "[100 earlier bytes of stderr cut]\nolder line\nError: too large!", 100, "exit code 1: Error: too large!"},
		{2, "", 0, "exit code 2"},
	} {
		spy := &spyTransport{Runs: spyRuns{Answer: func(claudecode.Spec) ([]string, claudecode.Evidence) {
			return nil, claudecode.Evidence{Exit: &claudecode.Exit{Code: &c.code}, StderrTail: c.tail, StderrOmitted: c.omitted}
		}}}
		runner := &claudecode.Runner{Transport: spy, Command: "claudecode"}
		result := runner.RunTurn(context.Background(), request("hello"), &sink{})
		if result.Status != claudecode.Failed || result.Error == nil || result.Error.Class != claudecode.ClassRuntimeError || result.Error.Message != c.message || result.StderrTail != c.tail || result.StderrOmitted != c.omitted {
			t.Fatalf("turn = %+v", result)
		}
	}
}
