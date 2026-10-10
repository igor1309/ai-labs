package main

import (
	"context"
	"encoding/json"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
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

// A backup kept from an install made before ADR-030 names the policies
// that install wrote, and its restore still undoes it whole (ADR-016 rule
// 6): a policy it replaced is put back, one it created is removed, and so
// are the backup's other documents. A policy put back is still no
// settings: check reports it as its layer's problem.
func TestRestoreUndoesAnInstallThatWrotePolicies(t *testing.T) {
	t.Parallel()
	home := initedHome(t)
	reviewer := filepath.Join(home, "agents", "reviewer.toml")
	house := filepath.Join(home, "prompts", "house.md")
	replaced := filepath.Join(home, "policies", "read-only.yaml")
	created := filepath.Join(home, "policies", "implement.yaml")
	write(t, replaced, formerPolicy)
	before := files(t, home)

	// Home as the install left it, and the backup it made.
	const stamp = "20261001T120000Z-001"
	agent := read(t, reviewer)
	implement := strings.Replace(formerPolicy, "name: read-only", "name: implement", 1)
	write(t, reviewer, agent+"# tuned\n")
	write(t, house, "Follow the house style.\n")
	write(t, replaced, formerPolicy+"# tuned\n")
	write(t, created, implement)
	backup := filepath.Join(home, "backups", stamp)
	write(t, filepath.Join(backup, "agents", "reviewer.toml"), agent)
	write(t, filepath.Join(backup, "policies", "read-only.yaml"), formerPolicy)
	manifest, err := json.MarshalIndent(fsdefs.Manifest{
		Stamp: stamp, Source: "/repo/.agister", Installed: time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC),
		Documents: []fsdefs.ManifestEntry{
			{Path: reviewer, Kind: "agents", Name: "reviewer", Action: "replace", Before: digestText(agent), After: digestText(agent + "# tuned\n")},
			{Path: created, Kind: "policies", Name: "implement", Action: "create", After: digestText(implement)},
			{Path: replaced, Kind: "policies", Name: "read-only", Action: "replace", Before: digestText(formerPolicy), After: digestText(formerPolicy + "# tuned\n")},
			{Path: house, Kind: "prompts", Name: "house", Action: "create", After: digestText("Follow the house style.\n")},
		},
	}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(backup, "manifest.json"), string(manifest)+"\n")

	in := installClient(t, home, nil)
	plan, err := in.client.Restore(context.Background(), stamp, nil)
	if err != nil {
		t.Fatalf("restore plan: %v", err)
	}
	type step struct{ kind, name, path, action string }
	var steps []step
	for _, doc := range plan.Documents {
		steps = append(steps, step{doc.Kind, doc.Name, doc.Path, doc.Action})
	}
	want := []step{
		{"agents", "reviewer", reviewer, contract.RestorePutBack},
		{"policies", "implement", created, contract.RestoreRemove},
		{"policies", "read-only", replaced, contract.RestorePutBack},
		{"prompts", "house", house, contract.RestoreRemove},
	}
	if !reflect.DeepEqual(steps, want) || !strings.Contains(plan.Documents[2].Diff, "-# tuned\n") {
		t.Fatalf("restore plan %+v\nwant %+v", plan, want)
	}
	if _, err := in.client.Restore(context.Background(), stamp, &plan); err != nil {
		t.Fatalf("restore: %v", err)
	}
	if after := files(t, home); !reflect.DeepEqual(after, before) {
		t.Fatalf("after restore:\n%v\nwant\n%v", after, before)
	}

	problem := "home layer " + home + ": " + replaced + ": a layer holds no policies (ADR-030 rule 4): " +
		"set the policy's fields on each process that names it, then remove it\n"
	if r := agister(t, home, tempDir(t), "check"); r.code != cli.ExitUsage || !strings.Contains(r.stderr, problem) {
		t.Fatalf("check: %d, want %q\n%s%s", r.code, problem, r.stdout, r.stderr)
	}
}
