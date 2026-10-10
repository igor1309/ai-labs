package main

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// There are no policies (ADR-030 rule 4), on real settings directories:
// Agister's home, a repository's .agister and the .agister of a directory
// below its root.

// formerPolicy is a policy document as a layer held one before ADR-030.
const formerPolicy = `schema: agister.process-policy/v1alpha1
name: read-only
workspace: {access: read-only, scope: repository}
tools: {allow: [repository.read]}
timeout: 10m
`

// A process that names a policy is a problem of the process, which check
// reports and which refuses its call: the process holds its own limits.
func TestCheckReportsAProcessThatNamesAPolicy(t *testing.T) {
	t.Parallel()
	home, repo := setup(t, "approve")
	path := filepath.Join(home, "processes", "ask.yaml")
	write(t, path, strings.Replace(read(t, path), "prompt: ask\n", "prompt: ask\npolicy: process-policy:read-only\n", 1))

	const problem = "process ask: policy: there are no policies (ADR-030): set the policy's fields on the process and remove policy"
	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem+"\n") || strings.Contains(r.stderr, "stops every command") {
		t.Fatalf("check: %d, want %q\n%s%s", r.code, problem, r.stdout, r.stderr)
	}
	r = agister(t, home, repo, "run", "ask", "--quiet", "--param", "question=q", "--timeout", "1m")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, "policy: there are no policies (ADR-030)") {
		t.Fatalf("run: %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}

// A file in a layer's policies/ is a problem of that layer, which check
// reports with the file's path and which stops every command launched
// under the layer; a project layer's stops only what is launched below it.
func TestCheckReportsAFileInALayersPolicies(t *testing.T) {
	t.Parallel()
	for _, layer := range []string{"home", "repository", "project"} {
		t.Run(layer, func(t *testing.T) {
			t.Parallel()
			home, repo := setup(t, "approve")
			launch := filepath.Join(repo, "docs")
			write(t, filepath.Join(launch, ".agister", "prompts", "own.md"), "The project's own.\n")
			dir := map[string]string{
				"home":       home,
				"repository": filepath.Join(repo, ".agister"),
				"project":    filepath.Join(launch, ".agister"),
			}[layer]
			if r := agister(t, home, launch, "check"); r.code != 0 {
				t.Fatalf("check before the file: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			file := filepath.Join(dir, "policies", "read-only.yaml")
			write(t, file, formerPolicy)

			problem := layer + " layer " + dir + ": " + file + ": a layer holds no policies (ADR-030 rule 4): " +
				"set the policy's fields on each process that names it, then remove it\n  stops every command\n"
			r := agister(t, home, launch, "check")
			if r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem) {
				t.Fatalf("check: %d, want %q\n%s%s", r.code, problem, r.stdout, r.stderr)
			}
			r = agister(t, home, launch, "run", "ask", "--quiet", "--param", "question=q", "--timeout", "1m")
			if r.code == cli.ExitCompleted || !strings.Contains(r.stderr, "settings have problems that stop every command") {
				t.Fatalf("run under the layer: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			if layer != "project" {
				return
			}
			if r := agister(t, home, repo, "check"); r.code != 0 {
				t.Fatalf("check at the root, above the project: %d\n%s%s", r.code, r.stdout, r.stderr)
			}
		})
	}
}
