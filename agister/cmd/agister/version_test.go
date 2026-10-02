package main

import (
	"bytes"
	"context"
	"debug/buildinfo"
	"encoding/json"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime/debug"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
)

// The version names the module version, the short revision, +dirty for
// uncommitted changes, and the commit time; what the build does not record
// is unknown.
func TestVersion(t *testing.T) {
	vcs := func(modified string) []debug.BuildSetting {
		return []debug.BuildSetting{
			{Key: "-compiler", Value: "gc"},
			{Key: "vcs", Value: "git"},
			{Key: "vcs.revision", Value: "143e31f83a26b3c7f2d838649a599f3a2f0244f0"},
			{Key: "vcs.time", Value: "2026-10-02T11:31:17Z"},
			{Key: "vcs.modified", Value: modified},
		}
	}
	for _, c := range []struct {
		name string
		info *debug.BuildInfo
		want string
	}{
		{"full", &debug.BuildInfo{Main: debug.Module{Version: "(devel)"}, Settings: vcs("false")}, "(devel) 143e31f8 2026-10-02T11:31:17Z"},
		{"dirty", &debug.BuildInfo{Main: debug.Module{Version: "v1.2.3"}, Settings: vcs("true")}, "v1.2.3 143e31f8+dirty 2026-10-02T11:31:17Z"},
		{"no vcs", &debug.BuildInfo{Main: debug.Module{Version: "(devel)"}, Settings: []debug.BuildSetting{{Key: "-compiler", Value: "gc"}}}, "(devel) unknown unknown"},
		{"no module version", &debug.BuildInfo{}, "unknown unknown unknown"},
		{"no build info", nil, "unknown unknown unknown"},
	} {
		if got := version(c.info); got != c.want {
			t.Errorf("%s: version = %q, want %q", c.name, got, c.want)
		}
	}
}

// The built binary names itself by the build information it carries: main
// reads it and hands it to the CLI, for --version and for version alike.
func TestBinaryNamesItsBuild(t *testing.T) {
	binary := agisterBinary(t)
	info, err := buildinfo.ReadFile(binary)
	if err != nil {
		t.Fatal(err)
	}
	want := "agister " + version(info) + "\n"
	for _, args := range [][]string{{"--version"}, {"version"}} {
		command := exec.Command(binary, args...)
		command.Dir = tempDir(t)
		out, err := command.Output()
		if err != nil || string(out) != want {
			t.Errorf("%v: %q, %v; want %q", args, out, err, want)
		}
	}
}

// Settings written for a newer binary fail check on what this one does not
// know: an unknown field, adapter or input source, and a newer schema. Each
// such problem is marked in the report, and a line after the problems names
// this binary; a plain mistake is not marked.
func TestCheckMarksWhatThisBinaryDoesNotKnow(t *testing.T) {
	home, repo := tempDir(t), tempDir(t)
	if r := agisterInput(t, "yes\n", home, repo, "init"); r.code != 0 {
		t.Fatalf("init: %d %s", r.code, r.stderr)
	}
	mapping := read(t, filepath.Join(home, "runtimes", "claude-code.yaml"))
	write(t, filepath.Join(home, "runtimes", "future.yaml"), strings.Replace(mapping, "name: claude-code\nadapter: claude-code", "name: future\nadapter: opencode-next", 1))
	ask := read(t, filepath.Join(home, "processes", "ask.yaml"))
	process := func(name string, replacements ...string) {
		text := strings.Replace(ask, "name: ask", "name: "+name, 1)
		for i := 0; i+1 < len(replacements); i += 2 {
			text = strings.Replace(text, replacements[i], replacements[i+1], 1)
		}
		write(t, filepath.Join(home, "processes", name+".yaml"), text)
	}
	process("field", "type: process", "type: process\nfuture: 1")
	process("source", "source: param", "source: git.future")
	process("newer", "agister.process/v1alpha1", "agister.process/v2")
	process("banana", "agister.process/v1alpha1", "banana")
	process("agentless", "uses: agent:assistant\n", "")

	const version = "v1.2.3 143e31f8 2026-10-02T11:31:17Z"
	check := func(args ...string) result {
		var stdout, stderr bytes.Buffer
		code := cli.Run(context.Background(), append([]string{"--home", home, "check"}, args...), cli.IO{
			Stdout: &stdout, Stderr: &stderr, Cwd: repo, Getenv: func(string) string { return "" }, Version: version,
		}, compose)
		return result{code, stdout.String(), stderr.String()}
	}
	r := check("--json")
	var report contract.CheckReport
	if err := json.Unmarshal([]byte(r.stdout), &report); err != nil || r.code != cli.ExitUsage {
		t.Fatalf("check --json: %d %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	unknown := map[string]bool{}
	for _, problem := range report.Problems {
		unknown[problem.Message] = problem.Unknown
	}
	want := map[string]bool{
		`runtime mapping future: unknown adapter "opencode-next" (available: claude-code, codex, opencode, pi)`: true,
		`process field: future: unknown field`: true,
		`process source: input question: unknown source "git.future" (available: file, git.changed_files, git.diff, git.merge_base, git.revision, param, workflow.collection, prompt)`: true,
		`process newer: schema: must be "agister.process/v1alpha1"`:  true,
		`process banana: schema: must be "agister.process/v1alpha1"`: false,
		`process agentless: uses: is required`:                       false,
	}
	if !reflect.DeepEqual(unknown, want) {
		t.Fatalf("problems, marked or not = %v\nwant %v", unknown, want)
	}

	r = check()
	hint := "4 problem(s) name something this binary does not know; the settings may need one newer than agister " + version + ".\n"
	lines := strings.SplitAfter(r.stderr, "\n")
	if r.code != cli.ExitUsage || len(lines) < 3 || !strings.HasPrefix(lines[len(lines)-3], "6 problem(s) in ") || lines[len(lines)-2] != hint {
		t.Fatalf("check: %d\n%s", r.code, r.stderr)
	}
}
