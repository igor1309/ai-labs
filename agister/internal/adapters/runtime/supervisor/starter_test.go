package supervisor_test

import (
	"context"
	"errors"
	"fmt"
	"io"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeproc"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/adapters/system/systemtest"
)

// starts is a starter that keeps each command it is asked to start, with
// what the command would read on stdin, and starts it in process.
type starts struct {
	runtimetest.InProcess

	mu       sync.Mutex
	commands []supervisor.Command
	stdin    []string
}

func (s *starts) Start(command supervisor.Command) (supervisor.Process, error) {
	var typed []byte
	if command.Stdin != nil {
		typed, _ = io.ReadAll(command.Stdin)
		command.Stdin = strings.NewReader(string(typed))
	}
	s.mu.Lock()
	s.commands, s.stdin = append(s.commands, command), append(s.stdin, string(typed))
	s.mu.Unlock()
	return s.InProcess.Start(command)
}

// program is a starter whose only command, runtime, is fake.
func program(fake runtimetest.Fake) *starts {
	return &starts{InProcess: runtimetest.InProcess{Fakes: map[string]runtimetest.Fake{"runtime": fake}}}
}

// A turn's process is started by the runtime's starter, as the spec says,
// and supervised as any process is: its lines, its stderr, its exit and
// the reference to the group the starter gave it.
func TestATurnStartsThroughTheRuntimesStarter(t *testing.T) {
	dir := t.TempDir()
	starter := program(func(p fakeproc.Process) int {
		fmt.Fprintln(p.Stdout, "first")
		fmt.Fprintln(p.Stdout, "second")
		fmt.Fprintln(p.Stderr, "complaint")
		return 7
	})
	sink := &events{}
	var lines []string
	const grace = 3 * time.Second
	evidence := supervisor.Runtime{Starter: starter, Timer: systemtest.NewClock(start).Timer}.Run(context.Background(), supervisor.Spec{
		Command: "runtime", Args: []string{"-p", "x"}, Dir: dir, Env: []string{"KEY=value"}, Stdin: "the prompt", Timeout: time.Minute, KillGrace: grace,
	}, sink, func(line string) { lines = append(lines, line) })

	if len(starter.commands) != 1 {
		t.Fatalf("started %+v", starter.commands)
	}
	command := starter.commands[0]
	if command.Name != "runtime" || !reflect.DeepEqual(command.Args, []string{"-p", "x"}) || command.Dir != dir ||
		!reflect.DeepEqual(command.Env, []string{"KEY=value"}) || starter.stdin[0] != "the prompt" || command.Stderr == nil || command.WaitDelay != grace {
		t.Fatalf("started %+v reading %q", command, starter.stdin[0])
	}
	if evidence.SpawnError != "" || evidence.Exit == nil || evidence.Exit.Code == nil || *evidence.Exit.Code != 7 ||
		evidence.StderrTail != "complaint" || !reflect.DeepEqual(lines, []string{"first", "second"}) {
		t.Fatalf("evidence = %+v, lines %q", evidence, lines)
	}
	// The group is reported, then the group with its token, both the
	// starter's.
	if len(sink.started) != 2 {
		t.Fatalf("references %q", sink.started)
	}
	group, token, err := supervisor.ParseRef(sink.started[1])
	if err != nil || token == "" || sink.started[0] != supervisor.Ref(group, "") {
		t.Fatalf("references %q: %v", sink.started, err)
	}
}

// A process the starter cannot start is a spawn failure, with the
// starter's reason.
func TestAStartThatFailsIsASpawnFailure(t *testing.T) {
	sink := &events{}
	evidence := supervisor.Runtime{Starter: program(nil)}.Run(context.Background(), supervisor.Spec{Command: "missing", Timeout: time.Minute}, sink, func(string) {})
	if evidence.SpawnError == "" || evidence.Exit != nil || !sink.has("SPAWN_FAILED") || len(sink.started) != 0 {
		t.Fatalf("evidence = %+v, events %v, references %q", evidence, sink.kinds, sink.started)
	}
}

// The version is what `<command> --version` prints, started by the
// runtime's starter; a command that does not start, or exits non-zero, has
// none.
func TestVersionStartsThroughTheRuntimesStarter(t *testing.T) {
	starter := program(func(p fakeproc.Process) int {
		fmt.Fprintln(p.Stderr, "a warning")
		fmt.Fprintln(p.Stdout, " 1.2.3 ")
		return 0
	})
	runtime := supervisor.Runtime{Starter: starter, Timer: systemtest.NewClock(start).Timer}
	version, err := runtime.Version(context.Background(), "runtime")
	if err != nil || version != "1.2.3" {
		t.Fatalf("version %q, %v", version, err)
	}
	if len(starter.commands) != 1 || starter.commands[0].Name != "runtime" || !reflect.DeepEqual(starter.commands[0].Args, []string{"--version"}) {
		t.Fatalf("started %+v", starter.commands)
	}
	if version, err := runtime.Version(context.Background(), "missing"); err == nil {
		t.Fatalf("a command that did not start has version %q", version)
	}
	failing := supervisor.Runtime{Starter: program(func(p fakeproc.Process) int {
		fmt.Fprintln(p.Stdout, "1.2.3")
		return 2
	})}
	if version, err := failing.Version(context.Background(), "runtime"); err == nil || err.Error() != "exit status 2" {
		t.Fatalf("a command that exited 2 has version %q, %v", version, err)
	}
}

// A command that never prints its version is killed once twenty seconds
// have passed on the runtime's timer, or when the call is cancelled, and
// has no version.
func TestAVersionThatNeverEndsIsKilled(t *testing.T) {
	const timeout = 20 * time.Second
	t.Run("timeout", func(t *testing.T) {
		clock := systemtest.NewClock(start)
		runtime := supervisor.Runtime{Starter: program(fakeproc.Process.Block), Timer: clock.Timer}
		go func() { clock.Started(timeout); clock.Advance(timeout) }()
		version, err := runtime.Version(context.Background(), "runtime")
		if err == nil || err.Error() != "runtime --version did not end within 20s" {
			t.Fatalf("version %q, %v", version, err)
		}
	})
	t.Run("cancelled", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		// Cancel once the command waits to be ended: it says so.
		reports := make(chan runtimetest.Report)
		starter := program(fakeproc.Process.Block)
		starter.Reports = reports
		read := make(chan struct{})
		go func() {
			defer close(read)
			for report := range reports {
				if report.Point == "blocked" {
					cancel()
				}
			}
		}()
		version, err := supervisor.Runtime{Starter: starter, Timer: systemtest.NewClock(start).Timer}.Version(ctx, "runtime")
		close(reports)
		<-read
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("version %q, %v", version, err)
		}
	})
}

// A command is bash started by the commands' starter in the request's
// directory, its stderr with its stdout, and supervised as any command is.
func TestACommandStartsThroughTheCommandsStarter(t *testing.T) {
	dir := t.TempDir()
	starter := &starts{InProcess: runtimetest.InProcess{Fakes: map[string]runtimetest.Fake{"bash": func(p fakeproc.Process) int {
		fmt.Fprint(p.Stdout, "out ")
		fmt.Fprint(p.Stderr, "err")
		return 4
	}}}}
	var refs []string
	result := supervisor.Commands{Starter: starter, Timer: systemtest.NewClock(start).Timer}.Run(context.Background(),
		supervisor.CommandRequest{Command: "make test", Dir: dir, Timeout: time.Minute, Bound: 64},
		func(ref string) error { refs = append(refs, ref); return nil })

	if len(starter.commands) != 1 {
		t.Fatalf("started %+v", starter.commands)
	}
	command := starter.commands[0]
	if command.Name != "bash" || !reflect.DeepEqual(command.Args, []string{"-c", "make test"}) || command.Dir != dir || command.Stderr != nil || command.Stdin != nil {
		t.Fatalf("started %+v", command)
	}
	if result.Error != "" || result.ExitCode == nil || *result.ExitCode != 4 || result.Signal != "" || string(result.Head) != "out err" {
		t.Fatalf("result = %+v, head %q", result, result.Head)
	}
	if len(refs) != 2 {
		t.Fatalf("references %q", refs)
	}
}
