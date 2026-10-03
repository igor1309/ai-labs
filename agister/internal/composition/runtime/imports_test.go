package runtime

import (
	"fmt"
	"os/exec"
	"reflect"
	"strings"
	"testing"
)

// Inspect transitive production dependencies, including platform-specific
// supervisor files selected by the Go tool, so adding an indirect shared
// dependency cannot quietly recouple a wrapper to the application. One go
// list call reports every package in the five modules' graph.
//
// Contract test: the module's real import graph, from go list.
func TestRuntimeModulesImportOnlyTheStandardLibrary(t *testing.T) {
	t.Parallel()
	const module = "github.com/igor1309/ai-labs/agister"
	names := []string{"codex", "claudecode", "pi", "opencode", "supervisor"}
	pkgs := make([]string, len(names))
	for i, name := range names {
		pkgs[i] = module + "/internal/adapters/runtime/" + name
	}
	command := exec.Command("go", append([]string{"list", "-deps", "-f", depsFormat}, pkgs...)...)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("go list: %v\n%s", err, output)
	}
	outside, err := nonStandardDeps(string(output))
	if err != nil {
		t.Fatal(err)
	}
	for i, name := range names {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			pkg := pkgs[i]
			dependencies, ok := outside[pkg]
			if !ok {
				t.Fatalf("go list did not report %s", pkg)
			}
			for _, dependency := range dependencies {
				t.Errorf("%s depends on %s; runtime modules must use only the standard library", pkg, dependency)
			}
		})
	}
}

// depsFormat is go list's line per package: its import path, whether it
// is standard, and its transitive dependencies.
const depsFormat = `{{.ImportPath}} {{.Standard}} {{join .Deps " "}}`

// nonStandardDeps reads go list's depsFormat lines and returns, for each
// package listed, its dependencies that are not listed as standard.
func nonStandardDeps(listing string) (map[string][]string, error) {
	standard, deps := map[string]bool{}, map[string][]string{}
	for _, line := range strings.Split(strings.TrimSpace(listing), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			return nil, fmt.Errorf("go list: unexpected line %q", line)
		}
		standard[fields[0]] = fields[1] == "true"
		deps[fields[0]] = fields[2:]
	}
	outside := map[string][]string{}
	for pkg, dependencies := range deps {
		outside[pkg] = []string{}
		for _, dependency := range dependencies {
			if !standard[dependency] {
				outside[pkg] = append(outside[pkg], dependency)
			}
		}
	}
	return outside, nil
}

// A dependency counts as outside the standard library unless go list
// reports it standard, so one it does not list at all counts too.
func TestNonStandardDepsNamesWhatIsNotStandard(t *testing.T) {
	t.Parallel()
	outside, err := nonStandardDeps("a/wrapper false fmt a/shared unlisted\nfmt true\na/shared false fmt\nstd/only true fmt\n")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string][]string{
		"a/wrapper": {"a/shared", "unlisted"},
		"fmt":       {},
		"a/shared":  {},
		"std/only":  {},
	}
	if !reflect.DeepEqual(outside, want) {
		t.Fatalf("outside = %v, want %v", outside, want)
	}
	if _, err := nonStandardDeps("a/wrapper\n"); err == nil {
		t.Fatal("a line without the standard flag: want an error")
	}
}
