package runtimetest

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// keepBuilds restores the package's build state when the test ends.
func keepBuilds(t *testing.T) {
	t.Helper()
	buildMu.Lock()
	dir, was := buildDir, built
	buildMu.Unlock()
	t.Cleanup(func() {
		buildMu.Lock()
		buildDir, built = dir, was
		buildMu.Unlock()
	})
}

// A name built once is not built again: the later call returns the first
// build's path without running go build.
//
// Serial: it sets the package's build state, which every Build reads.
func TestBuildReturnsTheBuildMadeEarlier(t *testing.T) {
	keepBuilds(t)
	built = map[string]string{"fake": "/builds/fake"}
	if path := Build(t, "fake", filepath.Join(t.TempDir(), "missing"), "./nothing"); path != "/builds/fake" {
		t.Fatalf("path = %q, want the earlier build", path)
	}
}

// The removal deletes the build directory and forgets its builds, so a
// later Build starts a new directory.
//
// Serial: it sets the package's build state, which every Build reads.
func TestRemoveBuildsDeletesTheBuildDirectory(t *testing.T) {
	keepBuilds(t)
	buildDir = filepath.Join(t.TempDir(), "builds")
	if err := os.MkdirAll(buildDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(buildDir, "fake"), []byte("binary"), 0o755); err != nil {
		t.Fatal(err)
	}
	dir := buildDir
	built = map[string]string{"fake": filepath.Join(dir, "fake")}
	if err := removeBuilds(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("build directory still there: %v", err)
	}
	if buildDir != "" || len(built) != 0 {
		t.Fatalf("still recorded: dir %q, built %v", buildDir, built)
	}
	if err := removeBuilds(); err != nil {
		t.Fatalf("removing with nothing built: %v", err)
	}
}

// Run removes the builds after the tests, whatever they returned, and a
// failed removal fails a passing run without hiding a failing one's code.
func TestRunRemovesTheBuildsAfterTheTests(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name      string
		tests     int
		removeErr error
		want      int
		report    bool
	}{
		{"passed", 0, nil, 0, false},
		{"failed", 1, nil, 1, false},
		{"removal failed", 0, errors.New("busy"), 1, true},
		{"both failed", 2, errors.New("busy"), 2, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			var order []string
			var stderr strings.Builder
			code := runThenRemove(
				func() int { order = append(order, "tests"); return c.tests },
				func() error { order = append(order, "remove"); return c.removeErr },
				&stderr,
			)
			if code != c.want {
				t.Errorf("code = %d, want %d", code, c.want)
			}
			if strings.Join(order, ",") != "tests,remove" {
				t.Errorf("order = %v, want the tests, then the removal", order)
			}
			if got := stderr.String(); c.report != strings.Contains(got, "runtimetest: removing builds: busy") || !c.report && got != "" {
				t.Errorf("stderr = %q", got)
			}
		})
	}
}
