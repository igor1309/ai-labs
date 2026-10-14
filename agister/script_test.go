package agister_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// spyEnv, set, makes this test binary a spy of a program the check script
// runs, so the script's contract test has nothing to build. Its value is
// the spy's configuration, a spyConfig in JSON.
const spyEnv = "AGISTER_SCRIPT_SPY"

// spyConfig is what a spy is given: the file it logs each call to, and the
// answer to each call, by the call's words joined by spaces. A call with
// no answer prints nothing and succeeds.
type spyConfig struct {
	Log     string
	Answers map[string]spyAnswer
}

type spyAnswer struct {
	Stdout string
	Code   int
}

func TestMain(m *testing.M) {
	if config := os.Getenv(spyEnv); config != "" {
		dir, err := os.Getwd()
		if err != nil {
			fmt.Fprintln(os.Stderr, "spy:", err)
			os.Exit(125)
		}
		os.Exit(spy(config, dir, os.Args, os.Stdout, os.Stderr))
	}
	os.Exit(m.Run())
}

// spy logs its call, "<dir>: <args>", and gives the answer its config has
// for it, returning the exit code.
func spy(config, dir string, args []string, stdout, stderr io.Writer) int {
	var c spyConfig
	if err := json.Unmarshal([]byte(config), &c); err != nil {
		fmt.Fprintln(stderr, "spy:", err)
		return 125
	}
	call := strings.Join(args, " ")
	log, err := os.OpenFile(c.Log, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		fmt.Fprintln(stderr, "spy:", err)
		return 125
	}
	_, err = fmt.Fprintf(log, "%s: %s\n", dir, call)
	if closeErr := log.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		fmt.Fprintln(stderr, "spy:", err)
		return 125
	}
	answer := c.Answers[call]
	io.WriteString(stdout, answer.Stdout)
	if answer.Code != 0 {
		fmt.Fprintf(stderr, "spy: %s fails\n", call)
	}
	return answer.Code
}

// agister/scripts/test.sh runs, from the module's root, gokit's check, the
// format check over the module's packages as go list gives them, vet and
// the race tests, in that order, and fails with the first that fails.
//
// Contract test: agister/scripts/test.sh, run by sh over spies of gokit's
// check, go and gofmt.
func TestTheCheckScriptRunsGokitsChecksAndTheModules(t *testing.T) {
	t.Parallel()
	script, err := os.ReadFile("scripts/test.sh")
	if err != nil {
		t.Fatal(err)
	}
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	const (
		gokit    = "../gokit/scripts/test.sh"
		list     = "go list -f {{.Dir}} ./..."
		packages = "/module\n/module/settings\n"
		format   = "gofmt -l /module /module/settings"
		vet      = "go vet ./..."
		race     = "go test -race -count=1 -timeout 1m ./..."
	)
	calls := []string{gokit, list, format, vet, race}
	cases := []struct {
		name    string
		answers map[string]spyAnswer
		code    int
		made    int
		output  string
	}{
		{"every check passes", map[string]spyAnswer{list: {Stdout: packages}}, 0, 5, ""},
		{"gokit's check fails", map[string]spyAnswer{gokit: {Code: 3}}, 3, 1, ""},
		{"go list fails", map[string]spyAnswer{list: {Code: 4}}, 4, 2, ""},
		{"a file needs gofmt", map[string]spyAnswer{
			list:   {Stdout: packages},
			format: {Stdout: "/module/settings/a.go\n"},
		}, 1, 3, "gofmt needed:\n/module/settings/a.go\n"},
		{"gofmt fails", map[string]spyAnswer{list: {Stdout: packages}, format: {Code: 5}}, 5, 3, ""},
		{"vet fails", map[string]spyAnswer{list: {Stdout: packages}, vet: {Code: 6}}, 6, 4, ""},
		{"the race tests fail", map[string]spyAnswer{list: {Stdout: packages}, race: {Code: 7}}, 7, 5, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			// Resolved, so the directory the spies see is the one named here.
			root, err := filepath.EvalSymlinks(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			for _, dir := range []string{"agister/scripts", "gokit/scripts", "bin"} {
				if err := os.MkdirAll(filepath.Join(root, dir), 0o755); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.WriteFile(filepath.Join(root, "agister/scripts/test.sh"), script, 0o755); err != nil {
				t.Fatal(err)
			}
			for _, spied := range []string{"gokit/scripts/test.sh", "bin/go", "bin/gofmt"} {
				if err := os.Symlink(binary, filepath.Join(root, spied)); err != nil {
					t.Fatal(err)
				}
			}
			log := filepath.Join(root, "calls.log")
			config, err := json.Marshal(spyConfig{Log: log, Answers: c.answers})
			if err != nil {
				t.Fatal(err)
			}

			command := exec.Command(filepath.Join(root, "agister/scripts/test.sh"))
			command.Env = []string{"PATH=" + filepath.Join(root, "bin") + ":/usr/bin:/bin", spyEnv + "=" + string(config)}
			var stdout strings.Builder
			command.Stdout = &stdout
			err = command.Run()
			var exit *exec.ExitError
			if err != nil && !errors.As(err, &exit) {
				t.Fatal(err)
			}

			if code := command.ProcessState.ExitCode(); code != c.code {
				t.Errorf("exit code %d, want %d", code, c.code)
			}
			logged, err := os.ReadFile(log)
			if err != nil {
				t.Fatal(err)
			}
			var want []string
			for _, call := range calls[:c.made] {
				want = append(want, filepath.Join(root, "agister")+": "+call)
			}
			if got := strings.Split(strings.TrimSuffix(string(logged), "\n"), "\n"); !slices.Equal(got, want) {
				t.Errorf("calls\n got %q\nwant %q", got, want)
			}
			if got := stdout.String(); got != c.output {
				t.Errorf("output %q, want %q", got, c.output)
			}
		})
	}
}
