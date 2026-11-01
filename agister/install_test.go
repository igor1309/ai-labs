package agister_test

import (
	"bytes"
	"errors"
	"io/fs"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"
)

// goSpy is a go command that writes its directory and arguments, one to a
// line, to "go.args" beside itself, and makes the file -o names.
const goSpy = `#!/bin/sh
printf '%s\n' "$PWD" "$@" > "$(dirname "$0")/go.args"
while [ $# -gt 0 ]; do
  if [ "$1" = -o ]; then : > "$2"; fi
  shift
done
`

// installed is what a run of install.sh did: its exit code, its output,
// and the directory and arguments go was run with, nil where it was not.
type installed struct {
	code           int
	stdout, stderr string
	goRun          []string
}

// install runs scripts/loop/install.sh with user its home directory and
// goSpy the go on its path.
func install(t *testing.T, user string) installed {
	t.Helper()
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "go"), []byte(goSpy), 0o755); err != nil {
		t.Fatal(err)
	}
	command := exec.Command("bash", "scripts/loop/install.sh")
	command.Env = append(os.Environ(), "HOME="+user, "PATH="+bin+string(filepath.ListSeparator)+os.Getenv("PATH"))
	var stdout, stderr bytes.Buffer
	command.Stdout, command.Stderr = &stdout, &stderr
	var got installed
	var exit *exec.ExitError
	switch err := command.Run(); {
	case errors.As(err, &exit):
		got.code = exit.ExitCode()
	case err != nil:
		t.Fatal(err)
	}
	got.stdout, got.stderr = stdout.String(), stderr.String()
	args, err := os.ReadFile(filepath.Join(bin, "go.args"))
	switch {
	case err == nil:
		got.goRun = strings.Split(strings.TrimSuffix(string(args), "\n"), "\n")
	case !errors.Is(err, fs.ErrNotExist):
		t.Fatal(err)
	}
	return got
}

// tree is each folder and file under root, by its path from root: a
// folder "/", a file its content.
func tree(t *testing.T, root string) map[string]string {
	t.Helper()
	got := map[string]string{}
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || path == root {
			return err
		}
		name, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		if d.IsDir() {
			got[name] = "/"
			return nil
		}
		content, err := os.ReadFile(path)
		got[name] = string(content)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// write puts each file of files, by its path from root, under root.
func write(t *testing.T, root string, files map[string]string) {
	t.Helper()
	for name, content := range files {
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

// subtree is the part of a tree under the folder name, by its path from
// that folder.
func subtree(all map[string]string, name string) map[string]string {
	got := map[string]string{}
	for path, content := range all {
		if rest, ok := strings.CutPrefix(path, name+string(filepath.Separator)); ok {
			got[rest] = content
		}
	}
	return got
}

// install.sh refuses while ~/.agister/briefs, the archive's, is there: it
// builds nothing and changes nothing under the user's home.
//
// Contract test: install.sh, run by bash on the file system.
func TestInstallRefusesWhileTheArchivesBriefsAreThere(t *testing.T) {
	t.Parallel()
	user := t.TempDir()
	write(t, user, map[string]string{
		".agister/briefs/goal.yaml": "archive's",
		".agister/runs/r/run.json":  "archive's run",
		".agister/agents/a.yaml":    "archive's agent",
	})
	before := tree(t, user)
	got := install(t, user)
	if got.code != 1 || !strings.Contains(got.stderr, "briefs") {
		t.Errorf("exit %d, stderr %q; want 1, naming briefs", got.code, got.stderr)
	}
	if got.goRun != nil {
		t.Errorf("go run %q, want not run", got.goRun)
	}
	if after := tree(t, user); !maps.Equal(after, before) {
		t.Errorf("the user's home\n got %q\nwant %q", after, before)
	}
}

// install.sh builds the binary to ~/.local/bin/agister and writes each
// folder and file home has into ~/.agister whole: what it replaces is
// moved under one ~/.agister/backups/<UTC time>/, and what ~/.agister has
// besides, runs and locks among it, is kept, with no backup where nothing
// is replaced.
//
// Contract test: install.sh, run by bash on the file system.
func TestInstallReplacesHomesSettingsAndKeepsTheRest(t *testing.T) {
	t.Parallel()
	shipped := tree(t, "home")
	var names []string
	for name := range shipped {
		if !strings.Contains(name, string(filepath.Separator)) {
			names = append(names, name)
		}
	}
	if !slices.Contains(names, "agents") || !slices.Contains(names, "service.toml") {
		t.Fatalf("home has %q, want agents and service.toml among them", names)
	}
	src, err := filepath.Abs(".")
	if err != nil {
		t.Fatal(err)
	}
	src, err = filepath.EvalSymlinks(src)
	if err != nil {
		t.Fatal(err)
	}
	kept := map[string]string{
		"runs/r/run.json":         "a run",
		"locks/in-place/k.lock":   "",
		"dropped/old.yaml":        "a folder home no longer has",
		"agents/gone.yaml":        "an agent home no longer has",
		"service.toml":            "an old service",
		"processes/implement.yml": "an old process",
	}
	cases := []struct {
		name     string
		before   map[string]string
		replaced []string
	}{
		{"a first install", nil, nil},
		{"an install over settings", kept, []string{"agents", "processes", "service.toml"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			user := t.TempDir()
			write(t, filepath.Join(user, ".agister"), c.before)
			got := install(t, user)
			if got.code != 0 || !strings.HasPrefix(got.stdout, "agister at ") {
				t.Fatalf("exit %d, stdout %q, stderr %q; want 0, the version", got.code, got.stdout, got.stderr)
			}
			if len(got.goRun) > 0 {
				dir, err := filepath.EvalSymlinks(got.goRun[0])
				if err != nil {
					t.Fatal(err)
				}
				got.goRun[0] = dir
			}
			binary := filepath.Join(user, ".local", "bin", "agister")
			if want := []string{src, "build", "-o", binary, "./cmd/agister"}; !slices.Equal(got.goRun, want) {
				t.Errorf("go run %q, want %q", got.goRun, want)
			}
			if _, err := os.Stat(binary); err != nil {
				t.Errorf("the binary: %v", err)
			}
			after := tree(t, filepath.Join(user, ".agister"))
			for _, name := range names {
				if got, want := subtree(after, name), subtree(shipped, name); after[name] != shipped[name] || !maps.Equal(got, want) {
					t.Errorf("%s\n got %q\nwant %q", name, got, want)
				}
			}
			for name, content := range c.before {
				if top, _, _ := strings.Cut(name, string(filepath.Separator)); !slices.Contains(names, top) && after[name] != content {
					t.Errorf("%s holds %q, want %q kept", name, after[name], content)
				}
			}
			backups := subtree(after, "backups")
			if len(c.replaced) == 0 {
				if _, ok := after["backups"]; ok {
					t.Errorf("backups %q, want none", backups)
				}
				return
			}
			var times []string
			for name, content := range backups {
				if content == "/" && !strings.Contains(name, string(filepath.Separator)) {
					times = append(times, name)
				}
			}
			if len(times) != 1 || !regexp.MustCompile(`^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ$`).MatchString(times[0]) {
				t.Fatalf("backups %q, want one, named by a UTC time", times)
			}
			want := map[string]string{}
			for name, content := range c.before {
				if top, _, _ := strings.Cut(name, string(filepath.Separator)); slices.Contains(c.replaced, top) {
					want[name] = content
					if top != name {
						want[top] = "/"
					}
				}
			}
			if got := subtree(backups, times[0]); !maps.Equal(got, want) {
				t.Errorf("the backup\n got %q\nwant %q", got, want)
			}
		})
	}
}
