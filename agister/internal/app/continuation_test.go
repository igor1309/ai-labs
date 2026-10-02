package app_test

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"github.com/igor1309/ai-labs/agister/internal/domain/run"
)

func TestAContinuationWithAnUnreadableLaterRecordIsRefused(t *testing.T) {
	h, order := carrying()
	store := fsruns.Store{Dir: t.TempDir()}
	ctx := context.Background()
	for _, id := range []string{"run-0", "run-0b"} {
		prior := patchedRun(h, id, "", 0, 1, "diff A\n")
		if id == "run-0b" {
			prior = patchedRun(h, id, "run-0", 2, 3, "diff AB\n")
		}
		handle, err := store.Create(ctx, prior)
		if err != nil {
			t.Fatal(err)
		}
		artifact, err := handle.Artifact("changes.patch", h.runs.artifacts[id+"/artifacts/changes.patch"])
		if err != nil {
			t.Fatal(err)
		}
		prior.Result.Artifacts = []run.Artifact{artifact}
		if err := handle.Finish(prior); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(store.Dir, "run-0b", "record.json"), []byte("{"), 0o600); err != nil {
		t.Fatal(err)
	}
	h.calls = h.callsWith(h.defs, h.workspaces, h.changes, store)
	record := h.call(t, contract.CallRequest{Continue: "run-0"})
	if class(record) != run.ClassRefused || !strings.Contains(message(record), "listing run run-0b") || !contains(h.recorder.kinds(), "REFUSED") {
		t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
	}
	if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 || len(*order) != 0 || len(h.changes.applies()) != 0 {
		t.Fatalf("turns %d, checkouts %v, order %v, applied %v", len(h.runner.calls()), h.workspaces.checkouts, *order, h.changes.applies())
	}
}

func TestAContinuationWhenSessionListingFails(t *testing.T) {
	for _, checkout := range []bool{true, false} {
		t.Run(map[bool]string{true: "checkout", false: "no checkout"}[checkout], func(t *testing.T) {
			h, order := carrying()
			prior := patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			cost := 7.75
			prior.Turn.Session = &run.SessionTotals{CostUSD: &cost}
			h.runs.records["run-0"] = prior
			h.runs.listErr = errors.New("records unavailable")
			if !checkout {
				h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"],
					"workspace:\n  checkout: candidate_revision\n  setup: {command: ./own.sh, timeout: 30s}\n", "", 1)
				h.defs.docs[definition.KindPolicy]["pol"] = strings.Replace(h.defs.docs[definition.KindPolicy]["pol"], "scope: candidate", "scope: repository", 1)
			}
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if len(h.workspaces.checkouts) != 0 || len(h.changes.applies()) != 0 {
				t.Fatalf("checkouts %v, applied %v", h.workspaces.checkouts, h.changes.applies())
			}
			if checkout {
				if class(record) != run.ClassRefused || !strings.Contains(message(record), "records unavailable") || !contains(h.recorder.kinds(), "REFUSED") {
					t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
				}
				if len(h.runner.calls()) != 0 || len(*order) != 0 {
					t.Fatalf("turns %d, order %v", len(h.runner.calls()), *order)
				}
			} else {
				if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 || h.runner.calls()[0].ResumeSessionID != "prov-0" || record.Turn.SessionBefore != nil || contains(h.recorder.kinds(), "REFUSED") {
					t.Fatalf("result %+v, turn %+v, requests %v", record.Result, record.Turn, h.runner.calls())
				}
				if len(*order) != 1 || (*order)[0] != "turn" {
					t.Fatalf("order %v", *order)
				}
			}
		})
	}
}

func TestALegacyContinuationRequiresTheSameProcessDefinition(t *testing.T) {
	for _, identity := range []string{"changed selector", "missing recorded identity", "missing current identity"} {
		t.Run(identity, func(t *testing.T) {
			h, order := carrying()
			h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"],
				"    diff:", "    other_revision: {source: git.revision, rev: main}\n    diff:", 1)
			prior := patchedRun(h, "run-0", "", 0, 1, "diff A\n")
			prior.Effects.Checkout.Revision = ""
			prior.Inputs = append(prior.Inputs, run.Input{Name: "other_revision", Source: "git.revision", Identity: "sha-main", Revision: true})
			switch identity {
			case "changed selector":
				h.defs.docs[definition.KindProcess]["p"] = strings.Replace(h.defs.docs[definition.KindProcess]["p"], "checkout: candidate_revision", "checkout: other_revision", 1)
			case "missing recorded identity":
				prior.Definitions = nil
			case "missing current identity":
				// The document still resolves, but its source has no digest.
				h.calls = h.callsOn(&withoutProcessDigest{h.defs})
			}
			h.runs.records["run-0"] = prior
			record := h.call(t, contract.CallRequest{Continue: "run-0"})
			if class(record) != run.ClassRefused || !strings.Contains(message(record), "process definition cannot be matched") || !contains(h.recorder.kinds(), "REFUSED") {
				t.Fatalf("result %+v, events %v", record.Result, h.recorder.kinds())
			}
			if len(h.runner.calls()) != 0 || len(h.workspaces.checkouts) != 0 || len(*order) != 0 {
				t.Fatalf("turns %d, checkouts %v, order %v", len(h.runner.calls()), h.workspaces.checkouts, *order)
			}
		})
	}
}

type withoutProcessDigest struct{ *definitionsSpy }

func (s *withoutProcessDigest) Read(ctx context.Context, kind definition.Kind, name string) (definition.Document, error) {
	doc, err := s.definitionsSpy.Read(ctx, kind, name)
	if kind == definition.KindProcess {
		doc.Source.SHA256 = ""
	}
	return doc, err
}

func continuationGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	command := exec.Command("git", args...)
	command.Dir = dir
	out, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func TestContinuationBetweenWorktreesStoresCumulativeChanges(t *testing.T) {
	ctx := context.Background()
	repo := t.TempDir()
	continuationGit(t, repo, "init", "--quiet", "--initial-branch=main")
	continuationGit(t, repo, "config", "user.email", "t@example.com")
	continuationGit(t, repo, "config", "user.name", "T")
	continuationGit(t, repo, "config", "maintenance.auto", "false")
	if err := os.WriteFile(filepath.Join(repo, "a.txt"), []byte("base\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	continuationGit(t, repo, "add", ".")
	continuationGit(t, repo, "commit", "--quiet", "-m", "base")
	revision := continuationGit(t, repo, "rev-parse", "HEAD")
	workspaces := git.NewWorkspaces(git.NewWorktrees(t.TempDir()))
	checkout := func() string {
		t.Helper()
		dir, release, err := workspaces.Checkout(ctx, repo, revision)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if err := release(); err != nil {
				t.Error(err)
			}
		})
		return dir
	}
	from, to := checkout(), checkout()
	if err := os.WriteFile(filepath.Join(from, "a.txt"), []byte("base\nA\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	tree, err := workspaces.Identity(ctx, from, revision)
	if err != nil {
		t.Fatal(err)
	}
	patch, err := workspaces.Changes(ctx, from, revision, tree)
	if err != nil {
		t.Fatal(err)
	}
	other := filepath.Join(t.TempDir(), "other")
	continuationGit(t, repo, "clone", "--quiet", "--no-local", repo, other)
	for _, target := range []struct{ name, dir string }{{"same repository", to}, {"distinct repository", other}} {
		t.Run(target.name, func(t *testing.T) {
			h, order := carrying()
			prior := patchedRun(h, "run-0", "", 0, 1, string(patch))
			h.runner.turn.ProviderSessionID = "prov-0"
			prior.Effects.Checkout.Repository, prior.Effects.Checkout.Revision = from, revision
			h.runs.records["run-0"] = prior
			h.inputs.respond = func(spec app.InputSpec) (app.Resolved, error) {
				return app.Resolved{Value: revision, Identity: revision, Revision: true}, nil
			}
			h.runner.during = func(request app.TurnRequest) {
				*order = append(*order, "turn")
				path := filepath.Join(request.Cwd, "a.txt")
				data, err := os.ReadFile(path)
				if err != nil || string(data) != "base\nA\n" {
					t.Errorf("carried content %q, %v", data, err)
				}
				if err := os.WriteFile(path, append(data, []byte("B\n")...), 0o600); err != nil {
					t.Error(err)
				}
			}
			h.calls = h.callsWith(h.defs, workspaces, workspaces, h.runs)
			record := h.call(t, contract.CallRequest{Continue: "run-0", Cwd: target.dir})
			if target.dir == other {
				if class(record) != run.ClassRefused || !strings.Contains(message(record), "only into the same repository") || !contains(h.recorder.kinds(), "REFUSED") || len(h.runner.calls()) != 0 || len(*order) != 0 || record.Effects != nil {
					t.Fatalf("result %+v, effects %+v, order %v", record.Result, record.Effects, *order)
				}
				return
			}
			stored := h.recorder.artifacts["changes.patch"]
			if record.Result.Status != run.Completed || len(h.runner.calls()) != 1 || len(stored) == 0 || strings.Count(string(stored), "+A\n") != 1 || strings.Count(string(stored), "+B\n") != 1 {
				t.Fatalf("result %+v, patch %q", record.Result, stored)
			}
			if len(record.Result.Artifacts) != 1 || record.Result.Artifacts[0].Name != "changes.patch" || record.Result.Artifacts[0].Bytes != int64(len(stored)) {
				t.Fatalf("artifacts %+v", record.Result.Artifacts)
			}
			// Applying the delivered patch to a clean base reproduces both changes.
			if err := workspaces.Apply(ctx, to, stored, false); err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(filepath.Join(to, "a.txt"))
			if err != nil || string(data) != "base\nA\nB\n" {
				t.Fatalf("delivered content %q, %v", data, err)
			}
		})
	}
}
