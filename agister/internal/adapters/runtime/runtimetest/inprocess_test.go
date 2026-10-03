package runtimetest

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/gokit/fakeproc"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
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
	t.Parallel()
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

// bash is the fake shell: a command run under it runs in process, in the
// command's directory, its stderr with its stdout.
func TestInProcessRunsBashAsTheFakeShell(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	out, exit := output(t, InProcess{}, supervisor.Command{Name: "bash", Args: []string{"-c", "echo made > new.txt; cat new.txt missing.txt; exit 3"}, Dir: dir})
	if out != "made\ncat: missing.txt: No such file or directory\n" || exit.Code == nil || *exit.Code != 3 || exit.Signal != "" {
		t.Fatalf("printed %q and exited %+v", out, exit)
	}
	if made, err := os.ReadFile(filepath.Join(dir, "new.txt")); err != nil || string(made) != "made\n" {
		t.Fatalf("new.txt = %q, %v", made, err)
	}
}

// A test's own program is picked before a fake runtime, by the command as
// given or by its base name.
func TestInProcessPicksTheTestsOwnProgramFirst(t *testing.T) {
	t.Parallel()
	says := func(text string) supervisortest.Fake {
		return func(p fakeproc.Process) int {
			fmt.Fprint(p.Stdout, text)
			return 0
		}
	}
	starter := InProcess{Fakes: map[string]supervisortest.Fake{"ccusage": says("by name"), "/bin/claude": says("by path"), "claude": says("by base")}}
	for command, want := range map[string]string{"ccusage": "by name", "/usr/bin/ccusage": "by name", "/bin/claude": "by path", "/opt/claude": "by base"} {
		if out, _ := output(t, starter, supervisor.Command{Name: command}); out != want {
			t.Errorf("%s ran the program %q, want %q", command, out, want)
		}
	}
}

// The fake Pi reports the npm install it would run for each package its
// working directory's settings list and .pi/npm lacks, and leaves the
// package there; offline it installs nothing. A test that sees no such
// report has seen Pi install nothing.
func TestInProcessFakePiReportsThePackagesItInstalls(t *testing.T) {
	t.Parallel()
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
		reports := make(chan supervisortest.Report)
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
