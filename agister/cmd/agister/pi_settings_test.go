package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/runtimetest"
	"github.com/igor1309/ai-labs/agister/internal/cli"
)

// The example Pi settings (examples/pi), copied beside the shipped ones,
// parse, and check refuses only what they ship unverified: the mapping
// verifies no primitive, its one problem. Once each primitive
// is verified for the installed Pi, as a live check would record, and the
// agent runs the fake, they pass check --probe: the adapter is wired as
// pi and implements the mapping's contract.
func TestExamplePiSettingsPassCheck(t *testing.T) {
	home, repo := setup(t, "approve")
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

	r := agister(t, home, repo, "check")
	if r.code != cli.ExitUsage || !strings.Contains(r.stderr, "\nruntime mapping pi: verifies no primitive against any runtime version; calls on it are refused\n1 problem(s)") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}

	mapping := filepath.Join(home, "runtimes", "pi.yaml")
	verified := read(t, mapping)
	for _, tool := range []string{"read", "grep", "find", "ls", "edit", "write"} {
		item := "    " + tool + ": {grants: ["
		if !strings.Contains(verified, item) {
			t.Fatalf("%q was not found in the example mapping", item)
		}
		verified = strings.Replace(verified, item, "    "+tool+": {verified: [\"0.85.\"], grants: [", 1)
	}
	if !strings.Contains(verified, "    bash:\n") {
		t.Fatal("bash was not found in the example mapping")
	}
	write(t, mapping, strings.Replace(verified, "    bash:\n", "    bash:\n      verified: [\"0.85.\"]\n", 1))
	agent := filepath.Join(home, "agents", "pi-minimax.toml")
	write(t, agent, read(t, agent)+"command = \""+runtimetest.Binary(t, "fakepi")+"\"\n")

	r = agister(t, home, repo, "check", "--probe")
	if r.code != 0 || !strings.HasPrefix(r.stdout, "settings OK:") {
		t.Fatalf("exit %d\n%s%s", r.code, r.stdout, r.stderr)
	}
}
