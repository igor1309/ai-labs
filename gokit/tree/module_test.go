package tree_test

import (
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/gokit/testdiscipline"
)

// What the module as a whole promises: it depends on its two parsers and
// the standard library alone, its tests also on gokit; its tests keep
// gokit's discipline; and it knows nothing of the modules that import it.

const module = "github.com/igor1309/ai-labs/gokit/tree"

// Every package the module's packages and their tests reach is the
// standard library's, the module's own, a parser's, or, for the tests,
// gokit's.
//
// Contract test: the module's real import graph, from go list.
func TestTheModuleDependsOnItsParsersAndTheStandardLibraryOnly(t *testing.T) {
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
	allowed := []string{module, "gopkg.in/yaml.v3", "github.com/BurntSushi/toml", "github.com/igor1309/ai-labs/gokit/testdiscipline"}
	for _, pkg := range packages {
		// A package built for its tests is listed as "<path> [<path>.test]",
		// whose fields are checked one by one, its test binary as
		// "<path>.test" and its external tests as "<path>_test".
		pkg = strings.TrimSuffix(strings.TrimSuffix(strings.Trim(pkg, "[]"), ".test"), "_test")
		reached := false
		for _, a := range allowed {
			reached = reached || pkg == a || strings.HasPrefix(pkg, a+"/")
		}
		if !reached {
			t.Errorf("the module reaches %s, outside the standard library, its parsers and itself", pkg)
		}
	}
}

// The module's tests keep gokit's marker and parallelism, by the rules
// testdiscipline.Findings documents.
func TestTestsKeepTheMarkerAndTheParallelism(t *testing.T) {
	t.Parallel()
	findings, err := testdiscipline.Findings(".", testdiscipline.StandardMachinery())
	if err != nil {
		t.Fatal(err)
	}
	if len(findings) > 0 {
		t.Error(strings.Join(findings, "\n"))
	}
}

// No Go file of the module names the module gokit was extracted from, its
// module path or anything of it: the word is checked in any case.
func TestNoGoFileNamesTheModuleItCameFrom(t *testing.T) {
	t.Parallel()
	// Spelt in two halves, so this file does not name it either.
	word := "agi" + "ster"
	checked := 0
	err := filepath.WalkDir(".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}
		checked++
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if strings.Contains(strings.ToLower(string(data)), word) {
			t.Errorf("%s names %q", path, word)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if checked == 0 {
		t.Fatal("no Go file was found")
	}
}
