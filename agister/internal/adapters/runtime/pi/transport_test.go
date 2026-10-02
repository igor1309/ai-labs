package pi_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/pi"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// valueOf is the argument after flag in args; empty when there is none.
func valueOf(args []string, flag string) string {
	if i := slices.Index(args, flag); i >= 0 && i+1 < len(args) {
		return args[i+1]
	}
	return ""
}

// The transport is handed the turn as the runner builds it, fresh or
// resumed: the command, the turn's arguments with its session directory and
// system prompt file, directory, prompt on stdin, timeout and the runner's
// kill grace. The system prompt is in its file while the turn runs.
func TestTheTransportIsHandedTheTurn(t *testing.T) {
	const resumed = "7d1c2a4e-0000-4000-8000-000000000001"
	for name, resume := range map[string]string{"fresh": "", "resumed": resumed} {
		root, cwd := t.TempDir(), t.TempDir()
		session(t, root, resumed, cwd)
		var systemPrompt string
		spy := &runtimetest.Transport{Answer: func(spec supervisor.Spec) ([]string, supervisor.Evidence) {
			data, _ := os.ReadFile(valueOf(spec.Args, "--append-system-prompt"))
			systemPrompt = string(data)
			return nil, supervisor.Evidence{}
		}}
		runner := &pi.Runner{Transport: spy, Command: "/opt/pi", KillGrace: 3 * time.Second, Sessions: root}
		r := request("hello")
		r.Cwd = cwd
		r.ResumeSessionID = resume
		runner.RunTurn(context.Background(), r, &runtimetest.Recorder{})

		specs := spy.Specs()
		if len(specs) != 1 {
			t.Fatalf("%s: specs = %+v", name, specs)
		}
		sessionDir := valueOf(specs[0].Args, "--session-dir")
		switch {
		case resume != "" && sessionDir != filepath.Join(root, resumed):
			t.Errorf("%s: session dir %s", name, sessionDir)
		case resume == "" && filepath.Dir(sessionDir) != root:
			t.Errorf("%s: session dir %s is not a new one under %s", name, sessionDir, root)
		}
		args, err := pi.Arguments(r, sessionDir, valueOf(specs[0].Args, "--append-system-prompt"))
		if err != nil {
			t.Fatal(err)
		}
		want := supervisor.Spec{Command: "/opt/pi", Args: args, Dir: cwd, Stdin: "hello", Timeout: time.Minute, KillGrace: 3 * time.Second}
		if !reflect.DeepEqual(specs[0], want) {
			t.Errorf("%s: spec =\n%+v\nwant\n%+v", name, specs[0], want)
		}
		if systemPrompt != pi.SystemPrompt(r) {
			t.Errorf("%s: system prompt %q", name, systemPrompt)
		}
	}
}

// A turn the runtime reported nothing for is decided by the transport's
// evidence: Agister's timeout, or a signal Agister did not send. Without a
// session reported, a fresh turn keeps no session directory.
func TestATurnIsDecidedByTheTransportsEvidence(t *testing.T) {
	for name, c := range map[string]struct {
		evidence supervisor.Evidence
		status   run.Status
		class    run.Class
	}{
		"timeout": {supervisor.Evidence{TimedOut: true, Exit: &run.Exit{Signal: "signal: terminated"}}, run.Interrupted, run.ClassTimeout},
		"signal":  {supervisor.Evidence{Exit: &run.Exit{Signal: "signal: killed"}}, run.Lost, run.ClassKilled},
	} {
		root := t.TempDir()
		spy := &runtimetest.Transport{Answer: func(supervisor.Spec) ([]string, supervisor.Evidence) { return nil, c.evidence }}
		runner := &pi.Runner{Transport: spy, Command: "pi", Sessions: root}
		turn := runner.RunTurn(context.Background(), request("hello"), &runtimetest.Recorder{})
		if turn.Status != c.status || turn.Error == nil || turn.Error.Class != c.class {
			t.Errorf("%s: turn = %+v", name, turn)
		}
		if entries, _ := os.ReadDir(root); len(entries) != 0 {
			t.Errorf("%s: root holds %v", name, entries)
		}
	}
}

// A fresh turn's session directory is named after the session Pi reported,
// however its turn ended.
func TestAReportedSessionIsKeptWhateverTheEvidence(t *testing.T) {
	root, cwd := t.TempDir(), t.TempDir()
	spy := &runtimetest.Transport{Answer: func(supervisor.Spec) ([]string, supervisor.Evidence) {
		return []string{`{"type":"session","version":3,"id":"` + fresh + `","cwd":"` + cwd + `"}`},
			supervisor.Evidence{Exit: &run.Exit{Signal: "signal: killed"}}
	}}
	r := request("hello")
	r.Cwd = cwd
	turn := (&pi.Runner{Transport: spy, Command: "pi", Sessions: root}).RunTurn(context.Background(), r, &runtimetest.Recorder{})
	if turn.Error == nil || turn.Error.Class != run.ClassKilled {
		t.Fatalf("turn = %+v", turn)
	}
	if entries, _ := os.ReadDir(root); len(entries) != 1 || entries[0].Name() != fresh {
		t.Fatalf("root holds %v", entries)
	}
}

func TestIdentityAsksTheTransportForTheVersion(t *testing.T) {
	spy := &runtimetest.Transport{Output: "0.70.2"}
	identity, err := pi.New("/opt/pi", t.TempDir(), spy).Identity(context.Background())
	if err != nil || identity.Version != "0.70.2" || identity.Contract != pi.Contract {
		t.Fatalf("identity = %+v, %v", identity, err)
	}
	if versions := spy.Versions(); !reflect.DeepEqual(versions, []string{"/opt/pi"}) {
		t.Fatalf("versions = %q", versions)
	}
	failing := &runtimetest.Transport{Err: errors.New("not found")}
	if _, err := pi.New("pi", t.TempDir(), failing).Identity(context.Background()); err == nil {
		t.Fatal("a failed version check must fail identity")
	}
}
