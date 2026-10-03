package supervisortest

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"strings"
	"syscall"
	"testing"

	"github.com/igor1309/ai-labs/gokit/fakeproc"
	"github.com/igor1309/ai-labs/gokit/supervisor"
)

// output starts command through starter and returns what it wrote to
// stdout and how it exited.
func output(t *testing.T, starter InProcess, command supervisor.Command) (string, supervisor.Exit) {
	t.Helper()
	process, err := starter.Start(command)
	if err != nil {
		t.Fatal(err)
	}
	defer process.Stdout().Close()
	out, err := io.ReadAll(process.Stdout())
	if err != nil {
		t.Fatal(err)
	}
	return string(out), process.Wait()
}

// says is a fake that prints text.
func says(text string) Fake {
	return func(p fakeproc.Process) int {
		fmt.Fprint(p.Stdout, text)
		return 0
	}
}

// printsEnv is a fake that prints the value of name in its environment.
func printsEnv(name string) Fake {
	return func(p fakeproc.Process) int {
		fmt.Fprint(p.Stdout, p.Getenv(name))
		return 0
	}
}

// The fake is picked by the command as given, else by its base name; a
// command that names none fails to start.
func TestInProcessPicksTheFakeByTheCommandAsGivenThenByItsBaseName(t *testing.T) {
	t.Parallel()
	starter := InProcess{Groups: NewGroups(), Fakes: map[string]Fake{"tool": says("by name"), "/bin/runtime": says("by path"), "runtime": says("by base")}}
	for command, want := range map[string]string{"tool": "by name", "/usr/bin/tool": "by name", "/bin/runtime": "by path", "/opt/runtime": "by base", "runtime": "by base"} {
		if out, _ := output(t, starter, supervisor.Command{Name: command}); out != want {
			t.Errorf("%s ran the program %q, want %q", command, out, want)
		}
	}
	for _, command := range []string{"other", "/nonexistent/other", "bash"} {
		if process, err := starter.Start(supervisor.Command{Name: command}); err == nil {
			t.Errorf("%s started: %+v", command, process)
		}
	}
}

// The fake's environment is the starter's, with the command's own over
// it, and never the test process's.
//
// Serial: t.Setenv, to show the process's environment is not read.
func TestInProcessTakesTheEnvironmentFromTheStarterAndTheCommand(t *testing.T) {
	t.Setenv("SUPERVISORTEST_VALUE", "process")
	fakes := map[string]Fake{"print": printsEnv("SUPERVISORTEST_VALUE")}
	value := func(starter InProcess, env ...string) string {
		out, _ := output(t, starter, supervisor.Command{Name: "print", Env: env})
		return out
	}
	if got := value(InProcess{Groups: NewGroups(), Fakes: fakes}); got != "" {
		t.Errorf("with no environment given, the value is %q: the process's was read", got)
	}
	inherited := InProcess{Groups: NewGroups(), Env: []string{"SUPERVISORTEST_VALUE=starter"}, Fakes: fakes}
	if got := value(inherited); got != "starter" {
		t.Errorf("the starter's environment gave %q", got)
	}
	if got := value(inherited, "SUPERVISORTEST_VALUE=command"); got != "command" {
		t.Errorf("the command's environment gave %q, want it over the starter's", got)
	}
}

// The fake runs as the process the command describes: in its directory,
// with its arguments and stdin, its stderr apart from stdout when the
// command says where, and its exit code the fake's.
func TestInProcessRunsTheFakeAsTheCommandsProcess(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	starter := InProcess{Groups: NewGroups(), Fakes: map[string]Fake{"echo": func(p fakeproc.Process) int {
		input, _ := io.ReadAll(p.Stdin)
		fmt.Fprintf(p.Stdout, "%s %q %s %s", p.Dir, p.Args, input, p.Path("file"))
		fmt.Fprint(p.Stderr, "complaint")
		return 7
	}}}
	want := fmt.Sprintf("%s %q typed %s/file", dir, []string{"a", "b"}, dir)

	var stderr bytes.Buffer
	out, exit := output(t, starter, supervisor.Command{Name: "echo", Args: []string{"a", "b"}, Dir: dir, Stdin: strings.NewReader("typed"), Stderr: &stderr})
	if out != want || stderr.String() != "complaint" || exit.Code == nil || *exit.Code != 7 {
		t.Fatalf("stdout %q, stderr %q, exit %+v", out, stderr.String(), exit)
	}
	// With nowhere of its own, stderr goes where stdout goes.
	out, _ = output(t, starter, supervisor.Command{Name: "echo", Args: []string{"a", "b"}, Dir: dir, Stdin: strings.NewReader("typed")})
	if out != want+"complaint" {
		t.Fatalf("stdout %q, want stderr in it", out)
	}
}

// A fake that hangs blocks until its group is signalled: it reports its
// start and that it is blocked, the signal ends it, and it exited by that
// signal. Its group is then gone, as a real one is.
func TestInProcessSignallingTheGroupEndsABlockedFake(t *testing.T) {
	t.Parallel()
	reports := make(chan Report)
	process, err := InProcess{Groups: NewGroups(), Fakes: map[string]Fake{"hang": fakeproc.Process.Block}, Reports: reports}.Start(supervisor.Command{Name: "hang"})
	if err != nil {
		t.Fatal(err)
	}
	// However the test ends, the fake is ended and joined on its exit: a
	// signal to a group that has ended already does nothing.
	t.Cleanup(func() {
		_ = process.Signal(syscall.SIGKILL)
		process.Wait()
		process.Stdout().Close()
	})
	for _, want := range []string{"started", "blocked"} {
		if report := <-reports; report != (Report{Command: "hang", Point: want}) {
			t.Fatalf("report %+v, want %s", report, want)
		}
	}
	if err := process.Signal(syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	// Stdout ends once the fake has returned.
	if _, err := io.ReadAll(process.Stdout()); err != nil {
		t.Fatal(err)
	}
	if exit := process.Wait(); exit.Code != nil || exit.Signal != syscall.SIGTERM.String() {
		t.Fatalf("exit = %+v, want the signal", exit)
	}
	if err := process.Signal(syscall.SIGKILL); !errors.Is(err, syscall.ESRCH) {
		t.Fatalf("signalling the ended group: %v, want ESRCH", err)
	}
}

// group is the group of a fake started through starter, which has ended.
func group(t *testing.T, starter InProcess) int {
	t.Helper()
	process, err := starter.Start(supervisor.Command{Name: "version"})
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.ReadAll(process.Stdout())
	process.Wait()
	process.Stdout().Close()
	return process.Group()
}

// Each fake leads a group of its own, whose number no real group has: a
// reference to it, signalled by number as a reap does, reaches no process.
// Starters given one Groups to share never give a group twice.
func TestInProcessGroupsAreNoRealGroups(t *testing.T) {
	t.Parallel()
	groups := NewGroups()
	seen := map[int]bool{}
	for range 3 {
		process, err := InProcess{Groups: groups, Fakes: map[string]Fake{"version": says("1.0.0")}}.Start(supervisor.Command{Name: "version"})
		if err != nil {
			t.Fatal(err)
		}
		group := process.Group()
		if token, err := process.Token(t.Context()); err != nil || token == "" {
			t.Fatalf("token %q, %v", token, err)
		}
		if seen[group] {
			t.Fatalf("group %d was given twice", group)
		}
		seen[group] = true
		if err := syscall.Kill(-group, 0); !errors.Is(err, syscall.ESRCH) {
			t.Fatalf("signalling group %d by number: %v, want no such process", group, err)
		}
		_, _ = io.ReadAll(process.Stdout())
		process.Wait()
		process.Stdout().Close()
	}
}

// Two Groups number their groups apart: the groups one has given do not
// move the other on, which gives its first group as a fresh Groups does.
func TestInProcessGroupsOfSeparateGroupsAreIndependent(t *testing.T) {
	t.Parallel()
	fakes := map[string]Fake{"version": says("1.0.0")}
	one := InProcess{Groups: NewGroups(), Fakes: fakes}
	first := group(t, one)
	if first <= 1<<30 {
		t.Fatalf("group %d is in the range of the system's process IDs", first)
	}
	if again := group(t, one); again == first {
		t.Fatalf("one Groups gave group %d twice", first)
	}
	if other := group(t, InProcess{Groups: NewGroups(), Fakes: fakes}); other != first {
		t.Fatalf("a second Groups gave group %d first, want %d: it moved on with the first", other, first)
	}
}

// A starter given no Groups starts nothing: no group is numbered from
// anywhere it was not given.
func TestInProcessWithNoGroupsFailsToStart(t *testing.T) {
	t.Parallel()
	if process, err := (InProcess{Fakes: map[string]Fake{"version": says("1.0.0")}}).Start(supervisor.Command{Name: "version"}); err == nil {
		t.Fatalf("started with no Groups: %+v", process)
	}
}
