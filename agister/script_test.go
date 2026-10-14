package agister_test

import (
	"bytes"
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
// answer to each call its test expects. A call with no answer fails.
type spyConfig struct {
	Log     string
	Answers []spyAnswer
}

// spyAnswer answers the call whose arguments, the program's name first,
// are Args, each kept whole.
type spyAnswer struct {
	Args   []string
	Stdout string
	Code   int
}

// spyCall is a call as the spy logs it: one JSON object a line, so each
// argument keeps its bounds.
type spyCall struct {
	Dir  string
	Args []string
}

// noAnswer is the code of a call the spy's config has no answer for.
const noAnswer = 125

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

// spy logs its call and gives the answer its config has for it, returning
// the exit code; a call without one fails with noAnswer.
func spy(config, dir string, args []string, stdout, stderr io.Writer) int {
	var c spyConfig
	if err := json.Unmarshal([]byte(config), &c); err != nil {
		fmt.Fprintln(stderr, "spy:", err)
		return 125
	}
	call, err := json.Marshal(spyCall{Dir: dir, Args: args})
	if err != nil {
		fmt.Fprintln(stderr, "spy:", err)
		return 125
	}
	log, err := os.OpenFile(c.Log, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		fmt.Fprintln(stderr, "spy:", err)
		return 125
	}
	_, err = fmt.Fprintf(log, "%s\n", call)
	if closeErr := log.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		fmt.Fprintln(stderr, "spy:", err)
		return 125
	}
	at := slices.IndexFunc(c.Answers, func(a spyAnswer) bool { return slices.Equal(a.Args, args) })
	if at < 0 {
		fmt.Fprintf(stderr, "spy: no answer for %q\n", args)
		return noAnswer
	}
	answer := c.Answers[at]
	io.WriteString(stdout, answer.Stdout)
	if answer.Code != 0 {
		fmt.Fprintf(stderr, "spy: %q fails\n", args)
	}
	return answer.Code
}

// logged reads the calls the spies logged to log, in order.
func logged(t *testing.T, log string) []spyCall {
	t.Helper()
	content, err := os.ReadFile(log)
	if err != nil {
		t.Fatal(err)
	}
	var calls []spyCall
	for _, line := range bytes.Split(bytes.TrimSuffix(content, []byte("\n")), []byte("\n")) {
		var call spyCall
		if err := json.Unmarshal(line, &call); err != nil {
			t.Fatalf("logged call %q: %v", line, err)
		}
		calls = append(calls, call)
	}
	return calls
}

// The spy answers only the call its test gave an answer for, argument by
// argument: an omitted call, or the same words grouped into other
// arguments, fails with noAnswer and prints nothing. Each call is logged
// with its arguments whole.
func TestTheSpyAnswersOnlyTheCallsItWasGiven(t *testing.T) {
	t.Parallel()
	race := []string{"go", "test", "-race", "-count=1", "./..."}
	cases := []struct {
		name    string
		answers []spyAnswer
		args    []string
		code    int
		stdout  string
	}{
		{"a call it was given", []spyAnswer{{Args: race, Stdout: "ok\n", Code: 7}}, race, 7, "ok\n"},
		{"a call it was not given", nil, race, noAnswer, ""},
		{"the same words grouped otherwise", []spyAnswer{{Args: race, Stdout: "ok\n"}},
			[]string{"go", "test", "-race -count=1 ./..."}, noAnswer, ""},
		{"the same words split otherwise", []spyAnswer{{Args: race, Stdout: "ok\n"}},
			[]string{"go", "test", "-race", "-count=1", ".", "/..."}, noAnswer, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			log := filepath.Join(t.TempDir(), "calls.log")
			config, err := json.Marshal(spyConfig{Log: log, Answers: c.answers})
			if err != nil {
				t.Fatal(err)
			}
			var stdout, stderr strings.Builder
			if code := spy(string(config), "/work", c.args, &stdout, &stderr); code != c.code {
				t.Errorf("exit code %d, want %d; stderr %q", code, c.code, stderr.String())
			}
			if got := stdout.String(); got != c.stdout {
				t.Errorf("stdout %q, want %q", got, c.stdout)
			}
			want := []spyCall{{Dir: "/work", Args: c.args}}
			if got := logged(t, log); !slices.EqualFunc(got, want, sameCall) {
				t.Errorf("calls\n got %q\nwant %q", got, want)
			}
		})
	}
}

func sameCall(a, b spyCall) bool { return a.Dir == b.Dir && slices.Equal(a.Args, b.Args) }

// listFiles is the go list the check script runs for the files gofmt is to
// check.
var listFiles = []string{"go", "list", "-f",
	`{{range .GoFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}` +
		`{{range .CgoFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}` +
		`{{range .TestGoFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}` +
		`{{range .XTestGoFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}` +
		`{{range .IgnoredGoFiles}}{{$.Dir}}/{{.}}{{"\n"}}{{end}}`,
	"./..."}

// agister/scripts/test.sh runs, from the module's root, gokit's check, the
// format check over each Go file go list gives, one argument a file, vet
// and the race tests, in that order, and fails with the first that fails.
// The checkout's path and the files' paths hold spaces.
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
		root      = "/Agister work/repo/agister"
		documents = root + "/settings/documents"
		listed    = root + "/architecture_test.go\n\n" +
			documents + "/format.go\n" + documents + "/format_test.go\n\n"
	)
	var (
		gokit  = []string{"../gokit/scripts/test.sh"}
		format = []string{"gofmt", "-l", root + "/architecture_test.go", documents + "/format.go", documents + "/format_test.go"}
		vet    = []string{"go", "vet", "./..."}
		race   = []string{"go", "test", "-race", "-count=1", "-timeout", "1m", "./..."}
	)
	calls := [][]string{gokit, listFiles, format, vet, race}
	cases := []struct {
		name    string
		answers []spyAnswer
		code    int
		made    int
		output  string
	}{
		{"every check passes", []spyAnswer{
			{Args: gokit}, {Args: listFiles, Stdout: listed}, {Args: format}, {Args: vet}, {Args: race},
		}, 0, 5, ""},
		{"gokit's check fails", []spyAnswer{{Args: gokit, Code: 3}}, 3, 1, ""},
		{"go list fails", []spyAnswer{{Args: gokit}, {Args: listFiles, Code: 4}}, 4, 2, ""},
		{"a file needs gofmt", []spyAnswer{
			{Args: gokit}, {Args: listFiles, Stdout: listed}, {Args: format, Stdout: documents + "/format.go\n"},
		}, 1, 3, "gofmt needed:\n" + documents + "/format.go\n"},
		{"gofmt fails", []spyAnswer{
			{Args: gokit}, {Args: listFiles, Stdout: listed}, {Args: format, Code: 5},
		}, 5, 3, ""},
		{"vet fails", []spyAnswer{
			{Args: gokit}, {Args: listFiles, Stdout: listed}, {Args: format}, {Args: vet, Code: 6},
		}, 6, 4, ""},
		{"the race tests fail", []spyAnswer{
			{Args: gokit}, {Args: listFiles, Stdout: listed}, {Args: format}, {Args: vet}, {Args: race, Code: 7},
		}, 7, 5, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			// Resolved, so the directory the spies see is the one named here.
			temp, err := filepath.EvalSymlinks(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			checkout := filepath.Join(temp, "Agister work")
			for _, dir := range []string{"agister/scripts", "gokit/scripts", "bin"} {
				if err := os.MkdirAll(filepath.Join(checkout, dir), 0o755); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.WriteFile(filepath.Join(checkout, "agister/scripts/test.sh"), script, 0o755); err != nil {
				t.Fatal(err)
			}
			for _, spied := range []string{"gokit/scripts/test.sh", "bin/go", "bin/gofmt"} {
				if err := os.Symlink(binary, filepath.Join(checkout, spied)); err != nil {
					t.Fatal(err)
				}
			}
			log := filepath.Join(temp, "calls.log")
			config, err := json.Marshal(spyConfig{Log: log, Answers: c.answers})
			if err != nil {
				t.Fatal(err)
			}

			command := exec.Command(filepath.Join(checkout, "agister/scripts/test.sh"))
			command.Env = []string{"PATH=" + filepath.Join(checkout, "bin") + ":/usr/bin:/bin", spyEnv + "=" + string(config)}
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
			var want []spyCall
			for _, args := range calls[:c.made] {
				want = append(want, spyCall{Dir: filepath.Join(checkout, "agister"), Args: args})
			}
			if got := logged(t, log); !slices.EqualFunc(got, want, sameCall) {
				t.Errorf("calls\n got %q\nwant %q", got, want)
			}
			if got := stdout.String(); got != c.output {
				t.Errorf("output %q, want %q", got, c.output)
			}
		})
	}
}

// The go list the check script runs gives each Go file of the module's
// packages, its tests' and those its build constraints leave out included,
// and none of a module beneath it, such as the archive.
//
// Contract test: go list, run with the check script's arguments over a
// module made for the test, in a checkout whose path holds a space.
func TestTheCheckScriptsGoListGivesEachGoFileOfTheModule(t *testing.T) {
	t.Parallel()
	temp, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(temp, "Agister work", "agister")
	files := map[string]string{
		"go.mod":                       "module " + module + "\n\ngo 1.24\n",
		"settings/a/a.go":              "package a\n",
		"settings/a/a_test.go":         "package a\n",
		"settings/a/a_x_test.go":       "package a_test\n",
		"settings/a/tagged.go":         "//go:build architecture_case\n\npackage a\n",
		"settings/a/tagged_test.go":    "//go:build architecture_case\n\npackage a\n",
		"settings/a/tagged_x_test.go":  "//go:build architecture_case\n\npackage a_test\n",
		"settings/a/a_plan9.go":        "package a\n",
		"settings/b/b.go":              "package b\n",
		"archive/go.mod":               "module example.com/archive\n\ngo 1.24\n",
		"archive/old.go":               "package archive\n",
		"archive/settings/old/old.go":  "package old\n",
		"settings/b/testdata/fixed.go": "package fixed\n",
	}
	for name, content := range files {
		path := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	command := exec.Command(listFiles[0], listFiles[1:]...)
	command.Dir = dir
	out, err := command.Output()
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			t.Fatalf("go list: %v: %s", err, exit.Stderr)
		}
		t.Fatal(err)
	}

	var got []string
	for _, line := range strings.Split(string(out), "\n") {
		if line != "" {
			got = append(got, line)
		}
	}
	slices.Sort(got)
	var want []string
	for _, name := range []string{
		"settings/a/a.go", "settings/a/a_test.go", "settings/a/a_x_test.go",
		"settings/a/tagged.go", "settings/a/tagged_test.go", "settings/a/tagged_x_test.go",
		"settings/a/a_plan9.go", "settings/b/b.go",
	} {
		want = append(want, filepath.Join(dir, name))
	}
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Errorf("files\n got %q\nwant %q", got, want)
	}
}
