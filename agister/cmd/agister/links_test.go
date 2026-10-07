package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// The working copy of a file input and the links between runs (ADR-026
// rules 2 and 6), through the real composition: the file input source,
// the home's cache and the run store.

const briefedProcess = `schema: agister.process/v1alpha1
name: briefed
type: process
uses: agent:assistant
policy: process-policy:read-only
input:
  instruction: Follow the brief.
  params:
    brief: {}
  values:
    brief: {source: file, path: "${param.brief}"}
output:
  format: text
`

// briefed runs the process briefed on the brief at path, with args, and
// returns its record as stored.
func briefed(t *testing.T, home, repo string, runs *newRuns, path string, args ...string) map[string]any {
	t.Helper()
	if r := agister(t, home, repo, append([]string{"run", "briefed", "--quiet", "--timeout", "1m", "--param", "brief=" + path}, args...)...); r.code != cli.ExitCompleted {
		t.Fatalf("run on %s %v: %d\n%s%s", path, args, r.code, r.stdout, r.stderr)
	}
	return runs.one(t).record
}

// onlyInput is the record's one input.
func onlyInput(t *testing.T, record map[string]any) map[string]any {
	t.Helper()
	inputs, _ := record["inputs"].([]any)
	if len(inputs) != 1 {
		t.Fatalf("inputs = %v", record["inputs"])
	}
	return inputs[0].(map[string]any)
}

// A run copies a file input's bytes to <home>/cache/<digest>/<base name>,
// which its record names; a later run given that path reads the same bytes
// and records the same digest and the same copy.
func TestAFileInputsWorkingCopyIsKeptInTheHomesCache(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "processes", "briefed.yaml"), briefedProcess)
	text := "Make the brief's words last.\n"
	write(t, filepath.Join(repo, "notes", "brief.md"), text)
	runs := &newRuns{home: home}
	runs.take(t)

	sum := sha256.Sum256([]byte(text))
	digest := hex.EncodeToString(sum[:])
	copied := filepath.Join(home, "cache", digest, "brief.md")
	first := onlyInput(t, briefed(t, home, repo, runs, "notes/brief.md"))
	if first["identity"] != "sha256:"+digest || first["cache_path"] != copied {
		t.Fatalf("input = %v, want cache_path %s", first, copied)
	}
	if data, err := os.ReadFile(copied); err != nil || string(data) != text {
		t.Fatalf("working copy = %q, %v", data, err)
	}

	again := onlyInput(t, briefed(t, home, repo, runs, copied))
	if again["identity"] != first["identity"] || again["value"] != text || again["cache_path"] != copied {
		t.Fatalf("input given the copy = %v, first %v", again, first)
	}
}

// --goal and --answers record what they name from those runs' records,
// runs show prints them with each input's cache_path, and a goal the named
// run does not have refuses the call.
func TestGoalAndAnswersAreRecordedAndShown(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	write(t, filepath.Join(home, "processes", "briefed.yaml"), briefedProcess)
	write(t, filepath.Join(repo, "goal.md"), "The goal.\n")
	write(t, filepath.Join(repo, "brief.md"), "The step.\n")
	runs := &newRuns{home: home}
	runs.take(t)
	served := briefed(t, home, repo, runs, "goal.md")["id"].(string)

	linked := briefed(t, home, repo, runs, "brief.md", "--goal", served+":brief", "--answers", served)
	sum := sha256.Sum256([]byte("The goal.\n"))
	want := map[string]any{
		"goal":      map[string]any{"run": served, "input": "brief", "digest": "sha256:" + hex.EncodeToString(sum[:])},
		"judgement": map[string]any{"run": served},
	}
	if !reflect.DeepEqual(linked["links"], want) {
		t.Fatalf("links = %v, want %v", linked["links"], want)
	}

	r := agister(t, home, repo, "runs", "show", linked["id"].(string))
	var shown map[string]any
	if err := json.Unmarshal([]byte(r.stdout), &shown); r.code != 0 || err != nil {
		t.Fatalf("runs show: %d, %v\n%s%s", r.code, err, r.stdout, r.stderr)
	}
	if !reflect.DeepEqual(shown["links"], want) || onlyInput(t, shown)["cache_path"] != onlyInput(t, linked)["cache_path"] || onlyInput(t, shown)["cache_path"] == nil {
		t.Fatalf("runs show:\n%s", r.stdout)
	}

	r = agister(t, home, repo, "run", "briefed", "--quiet", "--timeout", "1m", "--param", "brief=brief.md", "--goal", served)
	if reason := "--goal: run " + served + " has no input goal"; r.code != cli.ExitRefused || !strings.Contains(r.stderr, reason) {
		t.Fatalf("run with a goal its run lacks: %d, want %q\n%s%s", r.code, reason, r.stdout, r.stderr)
	}
	if refused := runs.one(t); refused.first != nil || refused.record["links"] != nil {
		t.Fatalf("the refused call reached the runtime: %v, links %v", refused.first, refused.record["links"])
	}
}
