package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"slices"
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

// allowHostReads opts the repository in to host reads, which every Pi read
// tool grants, in its own service.toml.
func allowHostReads(t *testing.T, home, repo string) {
	t.Helper()
	service := read(t, filepath.Join(home, "service.toml"))
	write(t, filepath.Join(repo, ".agister", "service.toml"), strings.Replace(service, `state_reaching = ["host.read", "host.write"]`, `state_reaching = ["host.write"]`, 1))
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
	allowHostReads(t, home, repo)
	r = agister(t, home, repo, "run", "ask_pi", "--param", "question=What does this repository do?", "--timeout", "30s")
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

// With the service of an `agister init` home, which withholds host.read,
// no Pi tool that reads a skill can be granted, so ask_pi is refused before
// Pi starts and the refusal recorded (ADR-006).
func TestExamplePiCallWithoutASkillToolIsRefused(t *testing.T) {
	home, repo := examplePiSettings(t)
	const reason = "runtime pi needs read or bash to use the repository's skills (ADR-006), and the plan grants no such tool: " +
		"read needs host.read, which the plan withholds; bash needs host.read, which the plan withholds, " +
		"and repository.write, repository.history.write, network, host.write, which the effective permissions do not allow"
	r := agister(t, home, repo, "run", "ask_pi", "--param", "question=What does this repository do?")
	if r.code != cli.ExitRefused || !strings.Contains(r.stderr, reason) {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	last := lastRun(t, home)
	fault := last.record["result"].(map[string]any)["error"].(map[string]any)
	if fault["class"] != "refused" || fault["message"] != reason {
		t.Fatalf("error = %v", fault)
	}
	if last.first != nil {
		t.Fatalf("Pi started: %v", last.first)
	}
}

// Pi's sessions are kept under the home, never in ~/.pi or the temporary
// directory: a call's session directory is under <home>/pi/sessions, named
// by the session Pi reported, and a continuation resumes that session
// there, whatever the home's path holds: brackets in it are no pattern.
func TestPiSessionsAreKeptUnderTheHome(t *testing.T) {
	t.Run("plain home", func(t *testing.T) {
		home, repo := examplePiSettings(t)
		piSessionsAreKeptUnder(t, home, repo)
	})
	t.Run("home with brackets", func(t *testing.T) {
		home, repo := examplePiSettings(t)
		bracketed := filepath.Join(tempDir(t), "agister[1]")
		if err := os.Rename(home, bracketed); err != nil {
			t.Fatal(err)
		}
		piSessionsAreKeptUnder(t, bracketed, repo)
	})
}

func piSessionsAreKeptUnder(t *testing.T, home, repo string) {
	t.Helper()
	allowHostReads(t, home, repo)
	sessions := filepath.Join(home, "pi", "sessions")
	sessionDir := func(r run) string {
		t.Helper()
		args := r.argv()
		for i, arg := range args[:len(args)-1] {
			if arg == "--session-dir" {
				return args[i+1]
			}
		}
		t.Fatalf("no --session-dir in %q", args)
		return ""
	}

	r := agister(t, home, repo, "run", "ask_pi", "--param", "question=What does this repository do?", "--timeout", "30s")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	first := lastRun(t, home)
	if dir := sessionDir(first); filepath.Dir(dir) != sessions {
		t.Fatalf("session dir %s is not under %s", dir, sessions)
	}
	id, _ := first.first["id"].(string)
	kept, _ := os.ReadDir(filepath.Join(sessions, id))
	if entries, _ := os.ReadDir(sessions); id == "" || len(entries) != 1 || entries[0].Name() != id || len(kept) != 1 || filepath.Ext(kept[0].Name()) != ".jsonl" {
		t.Fatalf("session %q: %s holds %v, session files %v", id, sessions, entries, kept)
	}

	r = agister(t, home, repo, "run", "ask_pi", "--param", "question=And its tests?", "--continue", filepath.Base(first.dir), "--timeout", "30s")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	// Run IDs sort only to the second, so the continuation is the run that
	// is not the first.
	runs, _ := os.ReadDir(filepath.Join(home, "runs"))
	if len(runs) != 2 {
		t.Fatalf("runs = %v, want the first and its continuation", runs)
	}
	next := runs[0].Name()
	if next == filepath.Base(first.dir) {
		next = runs[1].Name()
	}
	second := lastRunIn(t, filepath.Join(home, "runs", next))
	args := strings.Join(second.argv(), " ")
	if sessionDir(second) != filepath.Join(sessions, id) || !strings.Contains(args, "--session "+id) || second.first["id"] != id {
		t.Fatalf("continuation reported session %v, argv %s", second.first["id"], args)
	}
	session := second.record["result"].(map[string]any)["session"].(map[string]any)
	if session["provider_session_id"] != id || session["continues"] != filepath.Base(first.dir) {
		t.Fatalf("session = %v", session)
	}
	if entries, _ := os.ReadDir(sessions); len(entries) != 1 {
		t.Fatalf("%s holds %v", sessions, entries)
	}
}

// A project's .pi/settings.json, which every call trusts, may list a Pi
// package that is not installed. Pi starts offline in a call, so it
// installs nothing: npm, a spy on PATH, never runs, and .pi/npm is never
// made.
func TestPiInstallsNoPackageTheProjectLists(t *testing.T) {
	home, repo := examplePiSettings(t)
	allowHostReads(t, home, repo)
	write(t, filepath.Join(repo, ".pi", "settings.json"), `{"packages": ["npm:@example/pi-tracer", {"source": "npm:pi-extras"}]}`)
	spy := tempDir(t)
	installs := filepath.Join(spy, "installs.log")
	write(t, filepath.Join(spy, "npm"), "#!/bin/sh\necho \"$*\" >> '"+installs+"'\n")
	if err := os.Chmod(filepath.Join(spy, "npm"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", spy+string(os.PathListSeparator)+os.Getenv("PATH"))

	r := agister(t, home, repo, "run", "ask_pi", "--param", "question=What does this repository do?", "--timeout", "30s")
	if r.code != cli.ExitCompleted {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
	if args := lastRun(t, home).argv(); !slices.Contains(args, "--offline") {
		t.Fatalf("Pi argv = %q", args)
	}
	if data, err := os.ReadFile(installs); err == nil || !os.IsNotExist(err) {
		t.Fatalf("npm ran: %s (%v)", data, err)
	}
	if _, err := os.Stat(filepath.Join(repo, ".pi", "npm")); !os.IsNotExist(err) {
		t.Fatalf(".pi/npm: %v", err)
	}
}

// piAllPolicy points ask_pi at a policy that allows every permission and
// makes the call require permission. The settings live only in a temp home.
func piAllPolicy(t *testing.T, home, permission string) {
	t.Helper()
	write(t, filepath.Join(home, "policies", "pi-all.yaml"), `schema: agister.process-policy/v1alpha1
name: pi-all
workspace: {access: read-write, scope: repository}
tools:
  allow: [repository.read, repository.search, repository.diff, repository.history.read, repository.write, repository.history.write, process.execute, network, host.read, host.write]
timeout: 10m
`)
	process := filepath.Join(home, "processes", "ask_pi.yaml")
	write(t, process, strings.Replace(read(t, process), "process-policy:read-only", "process-policy:pi-all", 1)+"\ntools: {require: ["+permission+"]}\n")
}

// edit, write and bash are verified for 0.85: when every grant is allowed,
// a call requiring a permission they grant is planned with all three, and
// Pi is started with them in its --tools allowlist.
func TestExamplePiSettingsGrantTheVerifiedWriteToolsAndBash(t *testing.T) {
	for _, permission := range []string{"repository.write", "process.execute"} {
		t.Run(permission, func(t *testing.T) {
			home, repo := examplePiSettings(t)
			service := filepath.Join(home, "service.toml")
			write(t, service, strings.Replace(read(t, service), `state_reaching = ["host.read", "host.write"]`, `state_reaching = []`, 1))
			piAllPolicy(t, home, permission)
			r := agister(t, home, repo, "run", "ask_pi", "--param", "question=What does this repository do?", "--timeout", "30s")
			if r.code != cli.ExitCompleted {
				t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
			}
			last := lastRun(t, home)
			plan := last.record["plan"].(map[string]any)
			if !reflect.DeepEqual(plan["primitives"], []any{"read", "grep", "find", "ls", "edit", "write", "bash"}) {
				t.Fatalf("plan = %v", plan)
			}
			if args := strings.Join(last.argv(), " "); !strings.Contains(args, "--tools read,grep,find,ls,edit,write,bash") {
				t.Fatalf("Pi argv = %s", args)
			}
		})
	}
}

// edit and write reach outside the checkout, so they grant host.write
// beside repository.write: with host.write withheld, as bash is, no Pi tool
// can write the repository, and check refuses a call requiring repository
// writes.
func TestExamplePiCallRequiringWritesWithoutHostWritesIsRefused(t *testing.T) {
	home, repo := examplePiSettings(t)
	allowHostReads(t, home, repo)
	piAllPolicy(t, home, "repository.write")
	const reason = "process ask_pi: cannot run on agent pi-minimax's runtime pi: cannot enforce the effective permissions: required permissions would be withheld: repository.write"
	r := agister(t, home, repo, "check")
	if r.code == 0 || !strings.Contains(r.stdout+r.stderr, reason) {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}
