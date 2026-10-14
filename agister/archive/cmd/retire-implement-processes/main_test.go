package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/composition/install"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// legacy are the processes implement_codex, implement_pi and
// implement_pi_glm as the base revision of home's settings folder holds
// them.
var legacy = filepath.Join("..", "..", "testdata", "home-before-call-workflows", "processes")

// legacyHome is a home that holds the legacy processes and a document of
// its own.
func legacyHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	for _, name := range retired {
		data, err := os.ReadFile(filepath.Join(legacy, name+".yaml"))
		if err != nil {
			t.Fatal(err)
		}
		write(t, filepath.Join(home, "processes", name+".yaml"), string(data))
	}
	write(t, filepath.Join(home, "prompts", "house.md"), "Follow the house style.\n")
	return home
}

func write(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

// exists reports whether path is there.
func exists(t *testing.T, path string) bool {
	t.Helper()
	_, err := os.Stat(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		t.Fatal(err)
	}
	return err == nil
}

// runIn runs the program in an environment of the test's: the variables
// vars sets, the user's home user, the working directory cwd. It retires
// through the retirement's composition, on a clock of the test's, and
// records each home it is given.
func runIn(t *testing.T, args []string, vars map[string]string, user, cwd string) (code int, stdout, stderr string, homes []string) {
	t.Helper()
	var out, errs bytes.Buffer
	clock := clocktest.NewClock(time.Date(2026, 10, 11, 3, 51, 48, 123456000, time.UTC))
	code = run(context.Background(), args, env{
		Getenv:   func(name string) string { return vars[name] },
		UserHome: func() (string, error) { return user, nil },
		Cwd:      func() (string, error) { return cwd, nil },
		Stdout:   &out, Stderr: &errs,
	}, func(home string) retirer {
		homes = append(homes, home)
		return install.Retirer(home, clock, nil)
	})
	return code, out.String(), errs.String(), homes
}

// The program retires the three processes from the home it is given, and
// nothing else of it, and says how to restore them. Run again, through
// $AGISTER_HOME, it retires nothing.
func TestRetiresTheImplementProcesses(t *testing.T) {
	t.Parallel()
	home := legacyHome(t)

	code, stdout, stderr, _ := runIn(t, []string{home}, nil, t.TempDir(), t.TempDir())
	if code != 0 {
		t.Fatalf("exit %d\n%s%s", code, stdout, stderr)
	}
	for _, name := range retired {
		path := filepath.Join(home, "processes", name+".yaml")
		if exists(t, path) || !strings.Contains(stdout, "retired "+path+"\n") {
			t.Errorf("%s is there or not reported retired:\n%s", path, stdout)
		}
	}
	if !exists(t, filepath.Join(home, "prompts", "house.md")) {
		t.Errorf("home's own prompt was removed")
	}
	entries, err := os.ReadDir(filepath.Join(home, "backups"))
	if err != nil || len(entries) != 1 {
		t.Fatalf("backups: %v %v, want one", entries, err)
	}
	stamp := entries[0].Name()
	if !strings.Contains(stdout, "agister install --restore "+stamp+"\n") {
		t.Errorf("no restore of %s printed:\n%s", stamp, stdout)
	}

	code, stdout, stderr, homes := runIn(t, nil, map[string]string{"AGISTER_HOME": home}, t.TempDir(), t.TempDir())
	if code != 0 || !strings.Contains(stdout, "nothing to retire") || !slices.Equal(homes, []string{home}) {
		t.Fatalf("run again over $AGISTER_HOME: exit %d, homes %v\n%s%s", code, homes, stdout, stderr)
	}
	if entries, _ := os.ReadDir(filepath.Join(home, "backups")); len(entries) != 1 {
		t.Errorf("backups after the second run: %v, want the first alone", entries)
	}
}

// The home is the argument, else $AGISTER_HOME, else ~/.agister, made
// absolute against the working directory as agister makes it.
func TestRetiresFromTheHomeAgisterUses(t *testing.T) {
	t.Parallel()
	cwd, user := t.TempDir(), t.TempDir()
	for _, dir := range []string{filepath.Join(cwd, "given"), filepath.Join(cwd, "set"), filepath.Join(user, ".agister")} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	tests := []struct {
		name string
		args []string
		vars map[string]string
		want string
	}{
		{"argument", []string{"given"}, map[string]string{"AGISTER_HOME": "set"}, filepath.Join(cwd, "given")},
		{"environment", nil, map[string]string{"AGISTER_HOME": "set"}, filepath.Join(cwd, "set")},
		{"user's", nil, nil, filepath.Join(user, ".agister")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			code, stdout, stderr, homes := runIn(t, tt.args, tt.vars, user, cwd)
			if code != 0 || !slices.Equal(homes, []string{tt.want}) {
				t.Fatalf("exit %d, homes %v, want %s\n%s%s", code, homes, tt.want, stdout, stderr)
			}
		})
	}
}

// A home that is not there, or more than one, is refused before anything
// is retired.
func TestRefusesWhatIsNoHome(t *testing.T) {
	t.Parallel()
	for name, args := range map[string][]string{
		"missing":  {filepath.Join(t.TempDir(), "missing")},
		"two args": {t.TempDir(), t.TempDir()},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			code, stdout, stderr, homes := runIn(t, args, nil, t.TempDir(), t.TempDir())
			if code == 0 || len(homes) != 0 || !strings.HasPrefix(stderr, "retire: ") {
				t.Fatalf("exit %d, homes %v\n%s%s", code, homes, stdout, stderr)
			}
		})
	}
}

// failingRetirer refuses to retire, as one whose backup fails its check
// does.
type failingRetirer struct{}

func (failingRetirer) Retire(context.Context, string, []app.RetireDocument) (app.Retired, error) {
	return app.Retired{}, errors.New("its digest differs, so nothing was retired")
}

// A retirement that fails exits nonzero with its reason.
func TestReportsAFailedRetirement(t *testing.T) {
	t.Parallel()
	var out, errs bytes.Buffer
	code := run(context.Background(), []string{t.TempDir()}, env{
		Getenv:   func(string) string { return "" },
		UserHome: func() (string, error) { return "", errors.New("no user home") },
		Cwd:      func() (string, error) { return "", errors.New("no working directory") },
		Stdout:   &out, Stderr: &errs,
	}, func(string) retirer { return failingRetirer{} })
	if code == 0 || !strings.Contains(errs.String(), "nothing was retired") || out.Len() != 0 {
		t.Fatalf("exit %d\n%s%s", code, out.String(), errs.String())
	}
}
