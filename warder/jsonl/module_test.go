package jsonl_test

import (
	"os/exec"
	"strings"
	"testing"
)

const module = "github.com/igor1309/ai-labs/warder/jsonl"

// Every package the module's packages and their tests reach is the
// standard library's or the module's own: no other warder module, nothing
// from outside.
//
// Contract test: the module's real import graph, from go list.
func TestTheModuleDependsOnTheStandardLibraryOnly(t *testing.T) {
	t.Parallel()
	command := exec.Command("go", "list", "-deps", "-test", "-f", "{{if not .Standard}}{{.ImportPath}}{{end}}", "./...")
	out, err := command.Output()
	if err != nil {
		t.Fatal(err)
	}
	packages := strings.Fields(string(out))
	if len(packages) == 0 {
		t.Fatal("go list found none of the module's packages")
	}
	for _, pkg := range packages {
		// A package built for its tests is listed as "<path> [<path>.test]",
		// whose fields are checked one by one, its test binary as
		// "<path>.test" and its external tests as "<path>_test".
		pkg = strings.TrimSuffix(strings.TrimSuffix(strings.Trim(pkg, "[]"), ".test"), "_test")
		if pkg != module && !strings.HasPrefix(pkg, module+"/") {
			t.Errorf("the module reaches %s, outside the standard library and itself", pkg)
		}
	}
}
