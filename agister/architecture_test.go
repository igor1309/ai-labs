// Package agister_test checks what the module as a whole promises: the
// dependency rule of its architecture (ADR-001, rule 1) and the marker and
// parallelism of its tests (ADR-009).
package agister_test

import (
	"errors"
	"fmt"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

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
// Contract test: the module's real import graph, from go list.
func TestTheIsolatedGroupsImportNothingOfTheModule(t *testing.T) {
	t.Parallel()
	imported, err := imports(".")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := imported["settings/documents"]; !ok {
		t.Fatalf("go list did not list settings/documents: %q", imported)
	}
	for _, breach := range breaches(imported) {
		t.Error(breach)
	}
}

// imports collects the imports of every package of the module in dir, by
// the package's path from the module's root: those of its own files, of
// its internal tests and of its external tests.
func imports(dir string) (map[string][]string, error) {
	command := exec.Command("go", "list", "-f",
		`{{.ImportPath}} {{join .Imports " "}} {{join .TestImports " "}} {{join .XTestImports " "}}`, "./...")
	command.Dir = dir
	out, err := command.Output()
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return nil, fmt.Errorf("go list: %w: %s", err, exit.Stderr)
		}
		return nil, fmt.Errorf("go list: %w", err)
	}
	imported := map[string][]string{}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := strings.Fields(line)
		pkg := strings.TrimPrefix(fields[0], module+"/")
		imported[pkg] = fields[1:]
	}
	return imported, nil
}

// An import of the module breaks rule 1 whichever of a package's files
// makes it: its own, its internal tests' or its external tests'.
//
// Contract test: go list, over a module made for each case.
func TestImportsCollectsThoseOfThePackageAndOfItsTests(t *testing.T) {
	t.Parallel()
	const imported = "\n\nimport _ \"" + module + "/settings/b\"\n"
	cases := []struct {
		name  string
		files map[string]string
		want  []string
	}{
		{"none", map[string]string{}, nil},
		{"the package's own files", map[string]string{
			"settings/a/a.go": "package a" + imported,
		}, []string{"settings/a imports settings/b"}},
		{"its internal tests", map[string]string{
			"settings/a/a_test.go": "package a" + imported,
		}, []string{"settings/a imports settings/b"}},
		{"its external tests", map[string]string{
			"settings/a/a_x_test.go": "package a_test\n\nimport _ \"" + module + "/settings/a\"" + imported,
		}, []string{"settings/a imports settings/b"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			files := map[string]string{
				"go.mod":          "module " + module + "\n\ngo 1.24\n",
				"settings/a/a.go": "package a\n",
				"settings/b/b.go": "package b\n",
			}
			maps.Copy(files, c.files)
			for name, content := range files {
				path := filepath.Join(dir, name)
				if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			imported, err := imports(dir)
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
