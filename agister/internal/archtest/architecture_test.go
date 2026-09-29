// Package archtest checks the architecture's dependency rules (ADR-001).
package archtest

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

const module = "github.com/igor1309/ai-labs/agister"

func packages(t *testing.T) map[string][]string {
	t.Helper()
	command := exec.Command("go", "list", "-f", `{{.ImportPath}} {{join .Imports " "}}`, "./...")
	command.Dir = "../.."
	out, err := command.Output()
	if err != nil {
		t.Fatal(err)
	}
	imports := map[string][]string{}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := strings.Fields(line)
		pkg := strings.TrimPrefix(fields[0], module+"/")
		for _, imported := range fields[1:] {
			if strings.HasPrefix(imported, module+"/") {
				imports[pkg] = append(imports[pkg], strings.TrimPrefix(imported, module+"/"))
			} else if !strings.Contains(strings.Split(imported, "/")[0], ".") {
				continue // standard library
			} else {
				imports[pkg] = append(imports[pkg], imported)
			}
		}
		if _, ok := imports[pkg]; !ok {
			imports[pkg] = nil
		}
	}
	return imports
}

func under(pkg, prefix string) bool { return pkg == prefix || strings.HasPrefix(pkg, prefix+"/") }

func TestDependencyRule(t *testing.T) {
	for pkg, imported := range packages(t) {
		for _, dep := range imported {
			var allowed bool
			switch {
			case under(pkg, "internal/domain"):
				allowed = under(dep, "internal/domain") || dep == "gopkg.in/yaml.v3" || dep == "github.com/BurntSushi/toml"
			case pkg == "internal/contract":
				allowed = false
			case pkg == "internal/app":
				allowed = under(dep, "internal/domain") || dep == "internal/contract"
			case pkg == "internal/cli":
				allowed = dep == "internal/contract"
			case under(pkg, "internal/adapters"):
				allowed = under(dep, "internal/domain") || dep == "internal/app" || dep == "internal/contract" ||
					(under(pkg, "internal/adapters/runtime") && under(dep, "internal/adapters/runtime")) ||
					!strings.HasPrefix(dep, "internal/") && !strings.HasPrefix(dep, "cmd/") && dep != "examples"
			case pkg == "examples":
				allowed = false
			case pkg == "cmd/agister":
				allowed = true // the composition root
			default:
				allowed = true
			}
			if !allowed {
				t.Errorf("%s must not import %s", pkg, dep)
			}
		}
	}
}

// Only the composition root instantiates adapters.
func TestOnlyTheCompositionRootImportsAdapters(t *testing.T) {
	for pkg, imported := range packages(t) {
		if pkg == "cmd/agister" || under(pkg, "internal/adapters") {
			continue
		}
		for _, dep := range imported {
			if under(dep, "internal/adapters") || dep == "examples" {
				t.Errorf("%s imports %s", pkg, dep)
			}
		}
	}
}

// The code knows agent calls, not kinds of work.
func TestCodeKnowsNoKindOfWork(t *testing.T) {
	root := "../.."
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		// Fake runtimes are test fixtures that emit example outputs.
		if strings.Contains(filepath.ToSlash(path), "/runtimetest/") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, word := range []string{"review", "verdict", "finding"} {
			if strings.Contains(strings.ToLower(string(data)), word) {
				t.Errorf("%s mentions %q", path, word)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// No interface is shared between components (ADR-001 rule 13): each use case
// declares the interfaces it calls beside itself. ports.go holds data only.
func TestSharedDataFileDeclaresNoInterface(t *testing.T) {
	file, err := parser.ParseFile(token.NewFileSet(), "../app/ports.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	ast.Inspect(file, func(node ast.Node) bool {
		if spec, ok := node.(*ast.TypeSpec); ok {
			if _, isInterface := spec.Type.(*ast.InterfaceType); isInterface {
				t.Errorf("ports.go declares the interface %s; declare it beside the component that calls it", spec.Name.Name)
			}
		}
		return true
	})
}
