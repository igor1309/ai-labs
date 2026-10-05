package codex_test

import (
	"context"
	"errors"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/codex"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
)

// spyTransport and spyRuns are the runtimetest spies over the transport types codex
// declares.
type (
	spyTransport = runtimetest.Transport[codex.Spec, codex.Sink, codex.Evidence]
	spyRuns      = runtimetest.Runs[codex.Spec, codex.Sink, codex.Evidence]
)

// The transport is handed the turn as the runner builds it, fresh or
// resumed: the command, the turn's arguments, directory, prompt on stdin,
// timeout and the runner's kill grace.
func TestTheTransportIsHandedTheTurn(t *testing.T) {
	t.Parallel()
	for name, resume := range map[string]string{"fresh": "", "resumed": "t-1"} {
		spy := &spyTransport{}
		runner := &codex.Runner{Transport: spy, Command: "/opt/codex", KillGrace: 3 * time.Second}
		r := request("hello")
		r.OutputSchema = nil
		r.Cwd = "/work"
		r.ResumeSessionID = resume
		runner.RunTurn(context.Background(), r, &sink{})

		args, err := codex.Arguments(r, "")
		if err != nil {
			t.Fatal(err)
		}
		if resumed := slices.Contains(args, "resume"); resumed != (resume != "") {
			t.Errorf("%s: resume in %q", name, args)
		}
		want := []codex.Spec{{Command: "/opt/codex", Args: args, Dir: "/work", Stdin: codex.Prompt(r), Timeout: time.Minute, KillGrace: 3 * time.Second}}
		if specs := spy.Specs(); !reflect.DeepEqual(specs, want) {
			t.Errorf("%s: specs =\n%+v\nwant\n%+v", name, specs, want)
		}
	}
}

// The schema is in the file the arguments name while the turn runs.
func TestTheSchemaFileIsThereWhileTheTurnRuns(t *testing.T) {
	t.Parallel()
	var schema string
	spy := &spyTransport{Runs: spyRuns{Answer: func(spec codex.Spec) ([]string, codex.Evidence) {
		if i := slices.Index(spec.Args, "--output-schema"); i >= 0 && i+1 < len(spec.Args) {
			data, _ := os.ReadFile(spec.Args[i+1])
			schema = string(data)
		}
		return nil, codex.Evidence{}
	}}}
	(&codex.Runner{Transport: spy, Command: "codex"}).RunTurn(context.Background(), request("hello"), &sink{})
	if schema != `{"type":"object"}` {
		t.Fatalf("schema = %q", schema)
	}
}

// A turn the runtime reported nothing for is decided by the transport's
// evidence: Agister's timeout, or a signal Agister did not send.
func TestATurnIsDecidedByTheTransportsEvidence(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		evidence codex.Evidence
		status   codex.Status
		class    codex.Class
	}{
		"timeout": {codex.Evidence{TimedOut: true, Exit: &codex.Exit{Signal: "signal: terminated"}}, codex.Interrupted, codex.ClassTimeout},
		"signal":  {codex.Evidence{Exit: &codex.Exit{Signal: "signal: killed"}}, codex.Lost, codex.ClassKilled},
	} {
		spy := &spyTransport{Runs: spyRuns{Answer: func(codex.Spec) ([]string, codex.Evidence) { return nil, c.evidence }}}
		runner := &codex.Runner{Transport: spy, Command: "codex"}
		turn := runner.RunTurn(context.Background(), request("hello"), &sink{})
		if turn.Status != c.status || turn.Error == nil || turn.Error.Class != c.class {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

// New looks the cost up through the transport it runs the turn with: the
// lookup is ccusage's listing, within what is left of the turn's timeout.
func TestTheCostLookupGoesThroughTheTransport(t *testing.T) {
	t.Parallel()
	code := 0
	clean := codex.Evidence{Exit: &codex.Exit{Code: &code}}
	spy := &spyTransport{Runs: spyRuns{Answer: func(spec codex.Spec) ([]string, codex.Evidence) {
		if spec.Command == "ccusage" {
			return strings.Split(listingJSON("0.25"), "\n"), clean
		}
		return []string{`{"type":"thread.started","thread_id":"` + fakeThread + `"}`, `{"type":"turn.completed"}`}, clean
	}}}
	r := request("hello")
	r.OutputSchema = nil
	turn := codex.New("/opt/codex", spy).RunTurn(context.Background(), r, &sink{})
	if turn.Status != codex.Completed || turn.Session == nil || turn.Session.CostUSD == nil || *turn.Session.CostUSD != 0.25 {
		t.Fatalf("turn = %+v", turn)
	}
	specs := spy.Specs()
	if len(specs) != 2 || specs[0].Command != "/opt/codex" {
		t.Fatalf("specs = %+v", specs)
	}
	lookup := specs[1]
	if lookup.Command != "ccusage" || !reflect.DeepEqual(lookup.Args, []string{"codex", "session", "--json"}) ||
		lookup.Timeout <= 0 || lookup.Timeout > time.Minute || lookup.Dir != "" || lookup.Stdin != "" || lookup.KillGrace != 0 {
		t.Fatalf("lookup = %+v", lookup)
	}
}

// A lookup that is not a clean exit is an error, whatever it printed. The
// lookup only runs a process: its spy has no Version.
func TestALookupThatDidNotExitCleanlyFails(t *testing.T) {
	t.Parallel()
	for name, evidence := range map[string]codex.Evidence{
		"timeout": {TimedOut: true, Exit: &codex.Exit{Signal: "signal: terminated"}},
		"signal":  {Exit: &codex.Exit{Signal: "signal: killed"}},
	} {
		spy := &spyRuns{Answer: func(codex.Spec) ([]string, codex.Evidence) {
			return strings.Split(listingJSON("0.25"), "\n"), evidence
		}}
		listing, err := codex.CCUsage(spy, "ccusage", 2*time.Second)(context.Background(), time.Minute, &sink{})
		if err == nil || listing != nil {
			t.Errorf("%s: listing %q, err %v", name, listing, err)
		}
		if specs := spy.Specs(); len(specs) != 1 || specs[0].Timeout != time.Minute || specs[0].KillGrace != 2*time.Second {
			t.Errorf("%s: specs = %+v", name, specs)
		}
	}
}

func TestIdentityAsksTheTransportForTheVersion(t *testing.T) {
	t.Parallel()
	spy := &spyTransport{Output: "codex-cli 0.130.0"}
	identity, err := codex.New("/opt/codex", spy).Identity(context.Background())
	if err != nil || identity.Version != "0.130.0" || identity.Contract != codex.Contract {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
	// No adapter gives a call its skills yet (ADR-021 rule 6).
	if identity.Skills {
		t.Fatalf("identity = %+v, which gives skills", identity)
	}
	if versions := spy.Versions(); !reflect.DeepEqual(versions, []string{"/opt/codex"}) {
		t.Fatalf("versions = %q", versions)
	}
	failing := &spyTransport{Err: errors.New("not found")}
	if _, err := codex.New("codex", failing).Identity(context.Background()); err == nil {
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
		spy := &spyTransport{Runs: spyRuns{Answer: func(codex.Spec) ([]string, codex.Evidence) {
			return nil, codex.Evidence{Exit: &codex.Exit{Code: &c.code}, StderrTail: c.tail, StderrOmitted: c.omitted}
		}}}
		runner := &codex.Runner{Transport: spy, Command: "codex"}
		result := runner.RunTurn(context.Background(), request("hello"), &sink{})
		if result.Status != codex.Failed || result.Error == nil || result.Error.Class != codex.ClassRuntimeError || result.Error.Message != c.message || result.StderrTail != c.tail || result.StderrOmitted != c.omitted {
			t.Fatalf("turn = %+v", result)
		}
	}
}
