// Package gokit_test checks what the module as a whole promises: it
// depends on nothing but the standard library, and it knows nothing of the
// modules that import it.
package gokit_test

import (
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

const module = "github.com/igor1309/ai-labs/gokit"

// Every package the module's packages and their tests reach is the
// standard library's or the module's own.
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

// No Go file names the module that this one was extracted from, its module
// path or anything of it: the word is checked in any case.
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
