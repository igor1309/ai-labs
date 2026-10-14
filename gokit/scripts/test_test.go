// Package scripts tests gokit's check script, test.sh, run by sh on a copy
// of it, with spies for the go and gofmt it runs.
package scripts

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/gokit/fakeproc"
)

// spyEnv set makes the test binary a spy, the one its name picks (go or
// gofmt), instead of running tests.
const spyEnv = "GOKIT_CHECK_SPY"

// What a spy is told by its environment: the copy's root, the log of the
// steps it ran, and the step that fails.
const (
	rootEnv = "GOKIT_CHECK_ROOT"
	logEnv  = "GOKIT_CHECK_LOG"
	failEnv = "GOKIT_CHECK_FAIL"
)

func TestMain(m *testing.M) {
	if os.Getenv(spyEnv) == "" {
		os.Exit(m.Run())
	}
	spies := map[string]func(fakeproc.Process) int{"go": goSpy, "gofmt": gofmtSpy}
	spy, ok := spies[filepath.Base(os.Args[0])]
	if !ok {
		fmt.Fprintln(os.Stderr, "no spy is named", os.Args[0])
		os.Exit(2)
	}
	fakeproc.Run(spy)
}

// goSpy plays go: list, vet, test, and run of gokit's testreport.
func goSpy(p fakeproc.Process) int {
	args := strings.Join(p.Args, " ")
	switch {
	case args == "list ./...":
		return step(p, "go list", func() { fmt.Fprintln(p.Stdout, "example.com/m") })
	case args == "vet ./...":
		return step(p, "go vet", func() {})
	case args == "test -race -count=1 -timeout 1m -json ./...":
		return step(p, "go test", func() {})
	case len(p.Args) == 4 && p.Args[0] == "-C" && p.Args[2] == "run" && p.Args[3] == "./cmd/testreport":
		if module(p, p.Path(p.Args[1])) != "gokit" {
			fmt.Fprintln(p.Stderr, "testreport is run outside gokit:", p.Args[1])
			return 2
		}
		return step(p, "testreport", func() { _, _ = io.Copy(io.Discard, p.Stdin) })
	}
	fmt.Fprintln(p.Stderr, "go spy: unexpected arguments:", args)
	return 2
}

// gofmtSpy plays gofmt -l on formatted files: it lists none.
func gofmtSpy(p fakeproc.Process) int {
	if len(p.Args) == 0 || p.Args[0] != "-l" {
		fmt.Fprintln(p.Stderr, "gofmt spy: unexpected arguments:", p.Args)
		return 2
	}
	return step(p, "gofmt", func() {})
}

// step logs the step as "<module> <name>", the module being the one its
// working directory is, and then does it: it exits 1 when it is the step
// that fails, 0 otherwise.
func step(p fakeproc.Process, name string, do func()) int {
	ran := module(p, p.Dir) + " " + name
	log, err := os.OpenFile(p.Getenv(logEnv), os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		fmt.Fprintln(p.Stderr, err)
		return 2
	}
	defer log.Close()
	if _, err := fmt.Fprintln(log, ran); err != nil {
		fmt.Fprintln(p.Stderr, err)
		return 2
	}
	do()
	if ran == p.Getenv(failEnv) {
		return 1
	}
	return 0
}

// module names the module of directory dir in the copy: "gokit" at its
// root, "gokit/<path>" below it. The paths are resolved first, as the
// temporary directory may be reached through a link.
func module(p fakeproc.Process, dir string) string {
	root, err := filepath.EvalSymlinks(p.Getenv(rootEnv))
	if err != nil {
		return "unknown: " + err.Error()
	}
	resolved, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return "unknown: " + err.Error()
	}
	rel, err := filepath.Rel(root, resolved)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "unknown: " + dir
	}
	return filepath.ToSlash(filepath.Join("gokit", rel))
}

// The check fails when go test or testreport fails in either module, and
// still runs every stage of both; it passes when none fails.
//
// Contract test: test.sh run by sh, with the test binary as its go and
// gofmt.
func TestTheCheckFailsWhenTestsOrTheirReportFail(t *testing.T) {
	t.Parallel()
	every := []string{
		"gokit gofmt", "gokit go list", "gokit go vet", "gokit go test", "gokit testreport",
		"gokit/tree gofmt", "gokit/tree go list", "gokit/tree go vet", "gokit/tree go test", "gokit/tree testreport",
	}
	cases := map[string]struct {
		fail   string
		failed bool
	}{
		"none fails":              {"", false},
		"gokit's go test":         {"gokit go test", true},
		"gokit's testreport":      {"gokit testreport", true},
		"gokit/tree's go test":    {"gokit/tree go test", true},
		"gokit/tree's testreport": {"gokit/tree testreport", true},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ran, out, err := runCheck(t, c.fail)
			if failed := err != nil; failed != c.failed {
				t.Errorf("the check failed: %v, want %v (%v); its output:\n%s", failed, c.failed, err, out)
			}
			if !slices.Equal(ran, every) {
				t.Errorf("the check ran:\n%s\nwant:\n%s", strings.Join(ran, "\n"), strings.Join(every, "\n"))
			}
		})
	}
}

// runCheck runs a copy of test.sh in a copy of gokit's layout, a module
// with tree a module inside it, with the step fail failing, and returns
// the steps the spies ran, the script's output and its error.
func runCheck(t *testing.T, fail string) (ran []string, out []byte, err error) {
	t.Helper()
	root := t.TempDir()
	script, err := os.ReadFile("test.sh")
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		"scripts/test.sh": string(script),
		"go.mod":          "module example.com/m\n",
		"m.go":            "package m\n",
		"tree/go.mod":     "module example.com/m/tree\n",
		"tree/tree.go":    "package tree\n",
	}
	for name, content := range files {
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	spies := t.TempDir()
	for _, name := range []string{"go", "gofmt"} {
		if err := os.Symlink(self, filepath.Join(spies, name)); err != nil {
			t.Fatal(err)
		}
	}
	log := filepath.Join(t.TempDir(), "steps")
	if err := os.WriteFile(log, nil, 0o600); err != nil {
		t.Fatal(err)
	}

	command := exec.Command("sh", filepath.Join(root, "scripts", "test.sh"))
	// Built with -race, each spy would otherwise sleep a second as it
	// exits, ten times a run.
	command.Env = append(os.Environ(), "GORACE=atexit_sleep_ms=0",
		"PATH="+spies+string(os.PathListSeparator)+os.Getenv("PATH"),
		spyEnv+"=1", rootEnv+"="+root, logEnv+"="+log, failEnv+"="+fail,
	)
	out, err = command.CombinedOutput()

	steps, readErr := os.Open(log)
	if readErr != nil {
		t.Fatal(readErr)
	}
	defer steps.Close()
	lines := bufio.NewScanner(steps)
	for lines.Scan() {
		ran = append(ran, lines.Text())
	}
	if lines.Err() != nil {
		t.Fatal(lines.Err())
	}
	return ran, out, err
}
