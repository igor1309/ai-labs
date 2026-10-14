// Package agister_test checks what the module as a whole promises: the
// dependency rule of its architecture (ADR-001, rule 1) and the marker and
// parallelism of its tests (ADR-009).
package agister_test

import (
	"errors"
	"fmt"
	"go/parser"
	"go/token"
	"io/fs"
	"maps"
	"os"
	"path"
	"slices"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/igor1309/ai-labs/gokit/testdiscipline"
)

const module = "github.com/igor1309/ai-labs/agister"

// isolated are the groups whose packages import no other package of the
// module, inside their group or outside it (ADR-001, rule 1).
var isolated = []string{"cli", "settings", "core"}

// breaches lists, sorted, every import edge of imports, a package's
// imports by its path from the module's root, that breaks rule 1.
func breaches(imports map[string][]string) []string {
	var found []string
	for pkg, imported := range imports {
		if !slices.ContainsFunc(isolated, func(group string) bool { return under(pkg, group) }) {
			continue
		}
		for _, dep := range imported {
			own := strings.TrimPrefix(dep, module+"/")
			if own != pkg && (dep == module || own != dep) {
				found = append(found, pkg+" imports "+own)
			}
		}
	}
	slices.Sort(found)
	return found
}

func under(pkg, group string) bool { return pkg == group || strings.HasPrefix(pkg, group+"/") }

func TestBreachesFindsAnIsolatedPackageImportingTheModule(t *testing.T) {
	t.Parallel()
	got := breaches(map[string][]string{
		"settings/check":     {"fmt", module + "/settings/resolve"},
		"settings/resolve":   {module + "/settings/resolve"},
		"core/session":       {module + "/core/watch", module + "/runtime/codex"},
		"cli":                {module + "/settings/check"},
		"cmd/agister":        {module + "/settings/check", module + "/core/session"},
		"runtime/codex":      {module + "/git"},
		"settings/documents": {"gopkg.in/yaml.v3"},
		"settingsx":          {module + "/core/watch"},
	})
	want := []string{
		"cli imports settings/check",
		"core/session imports core/watch",
		"core/session imports runtime/codex",
		"settings/check imports settings/resolve",
	}
	if !slices.Equal(got, want) {
		t.Errorf("breaches\n got %q\nwant %q", got, want)
	}
}

// Every package of cli, settings and core, its tests included, imports no
// other package of the module (ADR-001, rule 1).
//
// Contract test: the module's Go files, as the file system has them.
func TestTheIsolatedGroupsImportNothingOfTheModule(t *testing.T) {
	t.Parallel()
	imported, err := imports(os.DirFS("."))
	if err != nil {
		t.Fatal(err)
	}
	// This file's own package is listed, or the walk read nothing.
	if _, ok := imported["."]; !ok {
		t.Fatalf("imports did not list the module's root package: %q", imported)
	}
	for _, breach := range breaches(imported) {
		t.Error(breach)
	}
}

// imports collects the imports of every package of the module in fsys, by
// the package's directory from the module's root: those of each of its Go
// files, its tests' included, whichever build constraints select it. The
// go command's own build selects only the files of one platform and tag
// set, and leaves out a package none of whose files it selects; an import
// rule holds for every build. Left out, as by the go command: a module
// beneath the root, testdata, and a name starting with "." or "_".
func imports(fsys fs.FS) (map[string][]string, error) {
	imported := map[string][]string{}
	err := fs.WalkDir(fsys, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if name == "." {
			return nil
		}
		base := entry.Name()
		ignored := strings.HasPrefix(base, ".") || strings.HasPrefix(base, "_")
		if entry.IsDir() {
			if ignored || base == "testdata" {
				return fs.SkipDir
			}
			if _, err := fs.Stat(fsys, path.Join(name, "go.mod")); err == nil {
				return fs.SkipDir
			} else if !errors.Is(err, fs.ErrNotExist) {
				return err
			}
			return nil
		}
		if ignored || path.Ext(base) != ".go" {
			return nil
		}
		source, err := fs.ReadFile(fsys, name)
		if err != nil {
			return err
		}
		file, err := parser.ParseFile(token.NewFileSet(), name, source, parser.ImportsOnly)
		if err != nil {
			return err
		}
		pkg := path.Dir(name)
		deps := imported[pkg]
		for _, spec := range file.Imports {
			dep, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				return fmt.Errorf("%s: %w", name, err)
			}
			deps = append(deps, dep)
		}
		imported[pkg] = deps
		return nil
	})
	if err != nil {
		return nil, err
	}
	return imported, nil
}

// An import of the module breaks rule 1 whichever of a package's files
// makes it: its own, its internal tests' or its external tests', selected
// by the build or left out by its constraints. One in a module beneath the
// root is that module's.
func TestImportsCollectsThoseOfEveryFileOfThePackage(t *testing.T) {
	t.Parallel()
	const (
		imported = "\n\nimport _ \"" + module + "/settings/b\"\n"
		tagged   = "//go:build architecture_case\n\n"
	)
	breach := []string{"settings/a imports settings/b"}
	cases := []struct {
		name  string
		files map[string]string
		want  []string
	}{
		{"none", map[string]string{}, nil},
		{"the package's own files", map[string]string{
			"settings/a/a.go": "package a" + imported,
		}, breach},
		{"its internal tests", map[string]string{
			"settings/a/a_test.go": "package a" + imported,
		}, breach},
		{"its external tests", map[string]string{
			"settings/a/a_x_test.go": "package a_test\n\nimport _ \"" + module + "/settings/a\"" + imported,
		}, breach},
		{"its own file left out by a build tag", map[string]string{
			"settings/a/tagged.go": tagged + "package a" + imported,
		}, breach},
		{"its own file of another platform", map[string]string{
			"settings/a/a_plan9.go": "package a" + imported,
		}, breach},
		{"its internal test left out by a build tag", map[string]string{
			"settings/a/tagged_test.go": tagged + "package a" + imported,
		}, breach},
		{"its external test left out by a build tag", map[string]string{
			"settings/a/tagged_x_test.go": tagged + "package a_test\n\nimport _ \"" + module + "/settings/a\"" + imported,
		}, breach},
		{"a package each of whose files a build tag leaves out", map[string]string{
			"settings/c/c.go": tagged + "package c" + imported,
		}, []string{"settings/c imports settings/b"}},
		{"a module beneath the root", map[string]string{
			"settings/a/nested/go.mod": "module " + module + "/settings/a/nested\n\ngo 1.24\n",
			"settings/a/nested/n.go":   "package nested" + imported,
		}, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			files := map[string]string{
				"go.mod":          "module " + module + "\n\ngo 1.24\n",
				"settings/a/a.go": "package a\n",
				"settings/b/b.go": "package b\n",
			}
			maps.Copy(files, c.files)
			fsys := fstest.MapFS{}
			for name, content := range files {
				fsys[name] = &fstest.MapFile{Data: []byte(content)}
			}
			imported, err := imports(fsys)
			if err != nil {
				t.Fatal(err)
			}
			if got := breaches(imported); !slices.Equal(got, c.want) {
				t.Errorf("breaches\n got %q\nwant %q", got, c.want)
			}
		})
	}
}

// The module's tests keep ADR-009's marker and parallelism, by the rules
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
