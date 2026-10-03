package fakebash

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest/fakeproc"
)

// script is a command and the files it finds in its directory.
type script struct {
	command string
	files   map[string]string
}

// in writes the script's files into a new directory and returns it.
func (s script) in(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	for name, content := range s.files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// left is what a script left in dir: each file's content by name, and
// "<dir>" for a directory.
func left(t *testing.T, dir string) map[string]string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{}
	for _, entry := range entries {
		if entry.IsDir() {
			files[entry.Name()] = "<dir>"
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			t.Fatal(err)
		}
		files[entry.Name()] = string(data)
	}
	return files
}

// fake runs command in dir under the fake, its stderr with its stdout as a
// command's is, and returns the code and the output.
func fake(ctx context.Context, dir, command string, report func(string)) (int, string) {
	var output bytes.Buffer
	code := Main(fakeproc.Process{
		Context: ctx, Dir: dir, Args: []string{"-c", command}, Getenv: func(string) string { return "" },
		Stdin: strings.NewReader(""), Stdout: &output, Stderr: &output, Report: report,
	})
	return code, output.String()
}

// Contract test: the real bash. Every form of command the tests run under
// the fake ends under bash with the same code, the same output and the
// same files left behind.
func TestTheFakeRunsACommandAsBashDoes(t *testing.T) {
	for name, c := range map[string]struct {
		script
		// wording is set where the output is a system tool's own complaint:
		// only the code and the files are compared.
		wording bool
	}{
		"list, last code, failing":        {script: script{"cat state; grep -qx pass state", map[string]string{"state": "one\n"}}},
		"list, last code, passing":        {script: script{"cat state; grep -qx pass state", map[string]string{"state": "pass\n"}}},
		"or group, taken":                 {script: script{`grep -qx pass state || { echo "not yet"; exit 1; }`, map[string]string{"state": "one\n"}}},
		"or group, skipped":               {script: script{`grep -qx pass state || { echo "not yet"; exit 1; }`, map[string]string{"state": "pass\n"}}},
		"and redirect, taken":             {script: script{"grep -qx pass state && echo ran > ran.txt", map[string]string{"state": "pass\n"}}},
		"and redirect, skipped":           {script: script{"grep -qx pass state && echo ran > ran.txt", map[string]string{"state": "one\n"}}},
		"append to a new file":            {script: script{"echo prepared >> config.log", nil}},
		"append to a file":                {script: script{"echo prepared >> config.log", map[string]string{"config.log": "prepared\n"}}},
		"overwrite a file":                {script: script{"echo changed > state", map[string]string{"state": "one\n"}}},
		"negated test, exits":             {script: script{"test ! -e config.log || exit 9; cat state; grep -qx pass state", map[string]string{"config.log": "", "state": "pass\n"}}},
		"negated test, goes on":           {script: script{"test ! -e config.log || exit 9; cat state; grep -qx pass state", map[string]string{"state": "pass\n"}}},
		"exit ends the list":              {script: script{"echo broken; exit 3; echo unreached", nil}},
		"exit in a group ends the script": {script: script{"{ echo in; exit 4; }; echo unreached", nil}},
		"true":                            {script: script{"true", nil}},
		"touch a new file":                {script: script{"touch marker", nil}},
		"touch keeps a file":              {script: script{"touch marker", map[string]string{"marker": "kept\n"}}},
		"test -f, a file":                 {script: script{"test -f new.log", map[string]string{"new.log": "made\n"}}},
		"test -f, missing":                {script: script{"test -f new.log", nil}},
		"test -f, a directory":            {script: script{"test -f .", nil}},
		"test -e, a directory":            {script: script{"test -e .", nil}},
		"grep, a later line":              {script: script{"grep -qx two change.txt", map[string]string{"change.txt": "one\ntwo\n"}}},
		"grep, the whole line only":       {script: script{"grep -qx two change.txt", map[string]string{"change.txt": "twofold\n"}}},
		"words and quotes":                {script: script{`echo one   two "three   four" ""`, nil}},
		"a job waited for":                {script: script{"echo job > job.txt & wait", nil}},
		"a failed and then an or":         {script: script{"test -e missing && echo no || echo neither", nil}},
		"cat, missing":                    {script: script{"cat state; echo after", nil}, wording: true},
		"grep, missing":                   {script: script{"grep -qx pass state", nil}, wording: true},
		"redirect, no directory":          {script: script{"echo made > missing/new.txt; echo after", nil}, wording: true},
	} {
		t.Run(name, func(t *testing.T) {
			dir := c.in(t)
			code, output := fake(context.Background(), dir, c.command, func(string) {})

			real := c.in(t)
			bash := exec.Command("bash", "-c", c.command)
			bash.Dir = real
			out, err := bash.CombinedOutput()
			var exit *exec.ExitError
			if err != nil && !errors.As(err, &exit) {
				t.Fatal(err)
			}
			if want := bash.ProcessState.ExitCode(); code != want {
				t.Errorf("code %d, bash's %d", code, want)
			}
			if !c.wording && output != string(out) {
				t.Errorf("output %q, bash's %q", output, out)
			}
			if got, want := left(t, dir), left(t, real); !reflect.DeepEqual(got, want) {
				t.Errorf("files %v, bash's %v", got, want)
			}
		})
	}
}

// A command that blocks reports it and ends only when the process is
// ended, alone or as a job the script waits for: nothing after it runs.
func TestABlockingCommandEndsOnlyWhenTheProcessIsEnded(t *testing.T) {
	for _, command := range []string{"tail -f /dev/null", "tail -f /dev/null & wait", "tail -f /dev/null; echo after > after.txt"} {
		dir := t.TempDir()
		ctx, end := context.WithCancel(context.Background())
		points, ended := make(chan string), make(chan struct{})
		go func() {
			defer close(ended)
			fake(ctx, dir, command, func(point string) { points <- point })
		}()
		if point := <-points; point != "blocked" {
			t.Fatalf("%s: reported %q", command, point)
		}
		select {
		case <-ended:
			t.Fatalf("%s: ended by itself", command)
		default:
		}
		end()
		<-ended
		if files := left(t, dir); len(files) != 0 {
			t.Fatalf("%s: ran on after it was ended: %v", command, files)
		}
	}
}

// Shell the fake does not run ends the script with a message that names
// it, and runs none of it: a test never passes on a guess at what bash
// would have done.
func TestTheFakeRefusesTheShellItDoesNotRun(t *testing.T) {
	for command, want := range map[string]int{
		"echo made > new.txt; echo $HOME":        2,
		"echo made > new.txt; cat state | wc -l": 2,
		"echo made > new.txt; echo 'quoted'":     2,
		"echo made > new.txt; echo {a,b}":        2,
		"echo made > new.txt; { echo unclosed":   2,
		"echo made > new.txt; echo \"unclosed":   2,
		"echo made > new.txt;;":                  2,
		"ls":                                     127,
		"grep -c pass state":                     127,
		"grep -qx pa.s state":                    127,
		"test -d .":                              127,
		"exit":                                   127,
		"echo -n text":                           127,
	} {
		dir := t.TempDir()
		code, output := fake(context.Background(), dir, command, func(string) {})
		if code != want || !strings.HasPrefix(output, "fakebash: ") {
			t.Errorf("%s: code %d, want %d; output %q", command, code, want, output)
		}
		if files := left(t, dir); len(files) != 0 {
			t.Errorf("%s: ran in part: %v", command, files)
		}
	}
	var output bytes.Buffer
	code := Main(fakeproc.Process{Context: context.Background(), Dir: t.TempDir(), Args: []string{"script.sh"}, Stdout: &output, Stderr: &output, Report: func(string) {}})
	if code != 2 || !strings.HasPrefix(output.String(), "fakebash: ") {
		t.Errorf("without -c: code %d, output %q", code, output.String())
	}
}
