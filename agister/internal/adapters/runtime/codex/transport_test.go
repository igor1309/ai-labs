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
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// The transport is handed the turn as the runner builds it, fresh or
// resumed: the command, the turn's arguments, directory, prompt on stdin,
// timeout and the runner's kill grace.
func TestTheTransportIsHandedTheTurn(t *testing.T) {
	for name, resume := range map[string]string{"fresh": "", "resumed": "t-1"} {
		spy := &runtimetest.Transport{}
		runner := &codex.Runner{Transport: spy, Command: "/opt/codex", KillGrace: 3 * time.Second}
		r := request("hello")
		r.OutputSchema = nil
		r.Cwd = "/work"
		r.ResumeSessionID = resume
		runner.RunTurn(context.Background(), r, &runtimetest.Recorder{})

		args, err := codex.Arguments(r, "")
		if err != nil {
			t.Fatal(err)
		}
		if resumed := slices.Contains(args, "resume"); resumed != (resume != "") {
			t.Errorf("%s: resume in %q", name, args)
		}
		want := []supervisor.Spec{{Command: "/opt/codex", Args: args, Dir: "/work", Stdin: codex.Prompt(r), Timeout: time.Minute, KillGrace: 3 * time.Second}}
		if specs := spy.Specs(); !reflect.DeepEqual(specs, want) {
			t.Errorf("%s: specs =\n%+v\nwant\n%+v", name, specs, want)
		}
	}
}

// The schema is in the file the arguments name while the turn runs.
func TestTheSchemaFileIsThereWhileTheTurnRuns(t *testing.T) {
	var schema string
	spy := &runtimetest.Transport{Answer: func(spec supervisor.Spec) ([]string, supervisor.Evidence) {
		if i := slices.Index(spec.Args, "--output-schema"); i >= 0 && i+1 < len(spec.Args) {
			data, _ := os.ReadFile(spec.Args[i+1])
			schema = string(data)
		}
		return nil, supervisor.Evidence{}
	}}
	(&codex.Runner{Transport: spy, Command: "codex"}).RunTurn(context.Background(), request("hello"), &runtimetest.Recorder{})
	if schema != `{"type":"object"}` {
		t.Fatalf("schema = %q", schema)
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
		runner := &codex.Runner{Transport: spy, Command: "codex"}
		turn := runner.RunTurn(context.Background(), request("hello"), &runtimetest.Recorder{})
		if turn.Status != c.status || turn.Error == nil || turn.Error.Class != c.class {
			t.Errorf("%s: turn = %+v", name, turn)
		}
	}
}

// New looks the cost up through the transport it runs the turn with: the
// lookup is ccusage's listing, within what is left of the turn's timeout.
func TestTheCostLookupGoesThroughTheTransport(t *testing.T) {
	code := 0
	clean := supervisor.Evidence{Exit: &run.Exit{Code: &code}}
	spy := &runtimetest.Transport{Answer: func(spec supervisor.Spec) ([]string, supervisor.Evidence) {
		if spec.Command == "ccusage" {
			return strings.Split(listingJSON("0.25"), "\n"), clean
		}
		return []string{`{"type":"thread.started","thread_id":"` + fakeThread + `"}`, `{"type":"turn.completed"}`}, clean
	}}
	r := request("hello")
	r.OutputSchema = nil
	turn := codex.New("/opt/codex", spy).RunTurn(context.Background(), r, &runtimetest.Recorder{})
	if turn.Status != run.Completed || turn.Session == nil || turn.Session.CostUSD == nil || *turn.Session.CostUSD != 0.25 {
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

// A lookup that is not a clean exit is an error, whatever it printed.
func TestALookupThatDidNotExitCleanlyFails(t *testing.T) {
	for name, evidence := range map[string]supervisor.Evidence{
		"timeout": {TimedOut: true, Exit: &run.Exit{Signal: "signal: terminated"}},
		"signal":  {Exit: &run.Exit{Signal: "signal: killed"}},
	} {
		spy := &runtimetest.Transport{Answer: func(supervisor.Spec) ([]string, supervisor.Evidence) {
			return strings.Split(listingJSON("0.25"), "\n"), evidence
		}}
		listing, err := codex.CCUsage(spy, "ccusage", 2*time.Second)(context.Background(), time.Minute, &runtimetest.Recorder{})
		if err == nil || listing != nil {
			t.Errorf("%s: listing %q, err %v", name, listing, err)
		}
		if specs := spy.Specs(); len(specs) != 1 || specs[0].Timeout != time.Minute || specs[0].KillGrace != 2*time.Second {
			t.Errorf("%s: specs = %+v", name, specs)
		}
	}
}

func TestIdentityAsksTheTransportForTheVersion(t *testing.T) {
	spy := &runtimetest.Transport{Output: "codex-cli 0.130.0"}
	identity, err := codex.New("/opt/codex", spy).Identity(context.Background())
	if err != nil || identity.Version != "0.130.0" || identity.Contract != codex.Contract {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
	if versions := spy.Versions(); !reflect.DeepEqual(versions, []string{"/opt/codex"}) {
		t.Fatalf("versions = %q", versions)
	}
	failing := &runtimetest.Transport{Err: errors.New("not found")}
	if _, err := codex.New("codex", failing).Identity(context.Background()); err == nil {
		t.Fatal("a failed version check must fail identity")
	}
}
