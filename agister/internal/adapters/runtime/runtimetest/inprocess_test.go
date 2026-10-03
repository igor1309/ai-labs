package runtimetest

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeproc"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
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

// A fake runtime is picked by the command's name, or by the base name of
// its path, the CLI's or the built fake's; a command that names none fails
// to start.
func TestInProcessPicksTheFakeByTheCommandsName(t *testing.T) {
	for command, want := range map[string]string{
		"claude":               "2.1.283 (Claude Code)\n",
		"/builds/fakeclaude":   "2.1.283 (Claude Code)\n",
		"codex":                "codex-cli 0.158.0\n",
		"/builds/fakecodex":    "codex-cli 0.158.0\n",
		"opencode":             "1.18.33\n",
		"/builds/fakeopencode": "1.18.33\n",
		"pi":                   "0.85.1\n",
		"/builds/fakepi":       "0.85.1\n",
	} {
		out, exit := output(t, InProcess{}, supervisor.Command{Name: command, Args: []string{"--version"}})
		if out != want || exit.Code == nil || *exit.Code != 0 || exit.Signal != "" {
			t.Errorf("%s --version printed %q and exited %+v, want %q", command, out, exit, want)
		}
	}
	for _, command := range []string{"ccusage", "/nonexistent/runtime"} {
		if process, err := (InProcess{}).Start(supervisor.Command{Name: command}); err == nil {
			t.Errorf("%s started: %+v", command, process)
		}
	}
}

// A test's own program is picked before a fake runtime, by the command as
// given or by its base name.
func TestInProcessPicksTheTestsOwnProgramFirst(t *testing.T) {
	says := func(text string) Fake {
		return func(p fakeproc.Process) int {
			fmt.Fprint(p.Stdout, text)
			return 0
		}
	}
	starter := InProcess{Fakes: map[string]Fake{"ccusage": says("by name"), "/bin/claude": says("by path"), "claude": says("by base")}}
	for command, want := range map[string]string{"ccusage": "by name", "/usr/bin/ccusage": "by name", "/bin/claude": "by path", "/opt/claude": "by base"} {
		if out, _ := output(t, starter, supervisor.Command{Name: command}); out != want {
			t.Errorf("%s ran the program %q, want %q", command, out, want)
		}
	}
}

// The fake's environment is the starter's, with the command's own over
// it, and never the test process's.
func TestInProcessTakesTheEnvironmentFromTheStarterAndTheCommand(t *testing.T) {
	// Serial: t.Setenv, to show the process's environment is not read.
	t.Setenv("FAKE_VERSION", "9.9.9")
	version := func(starter InProcess, env ...string) string {
		out, _ := output(t, starter, supervisor.Command{Name: "pi", Args: []string{"--version"}, Env: env})
		return out
	}
	if got := version(InProcess{}); got != "0.85.1\n" {
		t.Errorf("with no environment given, the version is %q: the process's was read", got)
	}
	inherited := InProcess{Env: []string{"FAKE_VERSION=1.0.0"}}
	if got := version(inherited); got != "1.0.0\n" {
		t.Errorf("the starter's environment gave %q", got)
	}
	if got := version(inherited, "FAKE_VERSION=2.0.0"); got != "2.0.0\n" {
		t.Errorf("the command's environment gave %q, want it over the starter's", got)
	}
}

// The fake runs as the process the command describes: in its directory,
// with its arguments and stdin, its stderr apart from stdout when the
// command says where, and its exit code the fake's.
func TestInProcessRunsTheFakeAsTheCommandsProcess(t *testing.T) {
	dir := t.TempDir()
	starter := InProcess{Fakes: map[string]Fake{"echo": func(p fakeproc.Process) int {
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
	reports := make(chan Report)
	process, err := InProcess{Reports: reports}.Start(supervisor.Command{Name: "claude", Stdin: strings.NewReader("SCENARIO:hang")})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"started", "blocked"} {
		if report := <-reports; report != (Report{Command: "claude", Point: want}) {
			t.Fatalf("report %+v, want %s", report, want)
		}
	}
	if err := process.Signal(syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	// Stdout ends once the fake has returned.
	defer process.Stdout().Close()
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

// Each fake leads a group of its own, whose number no real group has: a
// reference to it, signalled by number as a reap does, reaches no process.
func TestInProcessGroupsAreNoRealGroups(t *testing.T) {
	seen := map[int]bool{}
	for range 3 {
		process, err := InProcess{}.Start(supervisor.Command{Name: "claude", Args: []string{"--version"}})
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

// The fake Pi reports the npm install it would run for each package its
// working directory's settings list and .pi/npm lacks, and leaves the
// package there; offline it installs nothing. A test that sees no such
// report has seen Pi install nothing.
func TestInProcessFakePiReportsThePackagesItInstalls(t *testing.T) {
	settings := func(t *testing.T) string {
		dir := t.TempDir()
		if err := os.MkdirAll(filepath.Join(dir, ".pi"), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, ".pi", "settings.json"), []byte(`{"packages": ["npm:pi-tracer", {"source": "npm:pi-extras"}, "git:other"]}`), 0o600); err != nil {
			t.Fatal(err)
		}
		return dir
	}
	// installs runs a turn of the fake in dir and returns the installs it
	// reported.
	installs := func(t *testing.T, dir string, args ...string) []string {
		reports := make(chan Report)
		var points []string
		read := make(chan struct{})
		go func() {
			defer close(read)
			for report := range reports {
				if strings.HasPrefix(report.Point, "npm install") {
					points = append(points, report.Point)
				}
			}
		}()
		output(t, InProcess{Reports: reports}, supervisor.Command{Name: "pi", Args: args, Dir: dir, Stdin: strings.NewReader("SCENARIO:approve")})
		close(reports)
		<-read
		return points
	}

	dir := settings(t)
	if got, want := installs(t, dir), []string{"npm install pi-tracer", "npm install pi-extras"}; !slices.Equal(got, want) {
		t.Fatalf("installs %q, want %q", got, want)
	}
	if _, err := os.Stat(filepath.Join(dir, ".pi", "npm", "node_modules", "pi-extras")); err != nil {
		t.Fatal(err)
	}
	// Installed, they are not installed again.
	if got := installs(t, dir); len(got) != 0 {
		t.Fatalf("installed again: %q", got)
	}
	dir = settings(t)
	if got := installs(t, dir, "--offline"); len(got) != 0 {
		t.Fatalf("installed offline: %q", got)
	}
	if _, err := os.Stat(filepath.Join(dir, ".pi", "npm")); !os.IsNotExist(err) {
		t.Fatalf(".pi/npm offline: %v", err)
	}
}
