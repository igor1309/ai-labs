package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/cli"
)

func examplePiSettings(t *testing.T) (home, repo string) {
	t.Helper()
	home, repo = setup(t, "approve")
	examplePi := os.DirFS(filepath.Join("..", "..", "examples", "pi"))
	err := fs.WalkDir(examplePi, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || filepath.Dir(path) == "." {
			return err
		}
		data, err := fs.ReadFile(examplePi, path)
		if err != nil {
			return err
		}
		write(t, filepath.Join(home, path), string(data))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	agent := filepath.Join(home, "agents", "pi-minimax.toml")
	write(t, agent, read(t, agent)+"command = \""+runtimetest.Binary(t, "fakepi")+"\"\n")
	return home, repo
}

// The example passes check and probe with its shipped verification flags.
// With host reads opted in, a 0.85.1 call grants only the four read tools.
func TestExamplePiSettingsPassCheck(t *testing.T) {
	home, repo := examplePiSettings(t)
	r := agister(t, home, repo, "check")
	if r.code != 0 || !strings.HasPrefix(r.stdout, "settings OK:") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	r = agister(t, home, repo, "check", "--probe")
	if r.code != 0 || !strings.HasPrefix(r.stdout, "settings OK:") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	service := read(t, filepath.Join(home, "service.toml"))
	write(t, filepath.Join(repo, ".agister", "service.toml"), strings.Replace(service, `state_reaching = ["host.read", "host.write"]`, `state_reaching = ["host.write"]`, 1))
	r = agister(t, home, repo, "run", "ask_pi", "--param", "question=What does this repository do?")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	last := lastRun(t, home)
	plan := last.record["plan"].(map[string]any)
	if !reflect.DeepEqual(plan["primitives"], []any{"read", "grep", "find", "ls"}) ||
		!reflect.DeepEqual(plan["withheld"], []any{"repository.diff", "repository.history.read", "process.execute"}) {
		t.Fatalf("plan = %v", plan)
	}
	if args := strings.Join(last.argv(), " "); !strings.Contains(args, "--tools read,grep,find,ls") {
		t.Fatalf("Pi argv = %s", args)
	}
}

// Even when every grant is allowed, unverified write tools and bash cannot
// satisfy a required permission. The bad settings live only in a temp home.
func TestExamplePiSettingsRefuseUnverifiedTools(t *testing.T) {
	for _, permission := range []string{"repository.write", "process.execute"} {
		t.Run(permission, func(t *testing.T) {
			home, repo := examplePiSettings(t)
			service := filepath.Join(home, "service.toml")
			write(t, service, strings.Replace(read(t, service), `state_reaching = ["host.read", "host.write"]`, `state_reaching = []`, 1))
			write(t, filepath.Join(home, "policies", "pi-all.yaml"), `schema: agister.process-policy/v1alpha1
name: pi-all
workspace: {access: read-write, scope: repository}
tools:
  allow: [repository.read, repository.search, repository.diff, repository.history.read, repository.write, repository.history.write, process.execute, network, host.read, host.write]
timeout: 10m
`)
			process := filepath.Join(home, "processes", "ask_pi.yaml")
			write(t, process, strings.Replace(read(t, process), "process-policy:read-only", "process-policy:pi-all", 1)+"\ntools: {require: ["+permission+"]}\n")
			r := agister(t, home, repo, "check")
			if r.code != cli.ExitUsage ||
				!strings.Contains(r.stderr, "required permissions would be withheld: "+permission) ||
				!strings.Contains(r.stderr, "not verified for version 0.85: edit, write, bash") {
				t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
			}
		})
	}
}
