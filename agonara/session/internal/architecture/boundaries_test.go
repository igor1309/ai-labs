package architecture

import (
	"bytes"
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Contract test: the Go tool's real import graph and the module's test syntax.
func TestDependencyGraphAndTestDiscipline(t *testing.T) {
	t.Parallel()
	cmd := exec.Command("go", "list", "-json", "./...")
	cmd.Dir = "../.."
	data, err := cmd.Output()
	if err != nil {
		t.Fatal(err)
	}
	prefix := "github.com/igor1309/ai-labs/agonara/session/"
	allowed := map[string][]string{
		"internal/flow": {}, "internal/store": {}, "internal/envfile": {}, "internal/ownerlock": {}, "internal/inlinehtml": {}, "internal/agonara": {},
		"internal/web": {"internal/inlinehtml"}, "internal/telegram": {"internal/inlinehtml"},
		"internal/sessionstore": {"internal/flow", "internal/store", "internal/telegram"},
		"internal/composition":  {"internal/sessionstore", "internal/agonara", "internal/flow", "internal/store", "internal/telegram", "internal/web", "internal/ownerlock"},
		"cmd/agonara-session":   {"internal/composition", "internal/envfile"}, "cmd/agonara-web": {"internal/composition", "internal/envfile"}, "internal/architecture": {},
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	for {
		var p struct {
			ImportPath, Dir                             string
			Imports, GoFiles, TestGoFiles, XTestGoFiles []string
		}
		if err := decoder.Decode(&p); err == io.EOF {
			break
		} else if err != nil {
			t.Fatal(err)
		}
		name := strings.TrimPrefix(p.ImportPath, prefix)
		edges, ok := allowed[name]
		if !ok {
			t.Errorf("package has no boundary rule: %s", name)
		}
		for _, dep := range p.Imports {
			if !strings.HasPrefix(dep, prefix) {
				continue
			}
			target := strings.TrimPrefix(dep, prefix)
			found := false
			for _, a := range edges {
				if target == a {
					found = true
				}
			}
			if !found {
				t.Errorf("forbidden import: %s -> %s", name, target)
			}
		}
		interfaces := map[string]string{}
		parsed := map[string]*ast.File{}
		for _, file := range p.GoFiles {
			f, err := parser.ParseFile(token.NewFileSet(), filepath.Join(p.Dir, file), nil, parser.ParseComments)
			if err != nil {
				t.Fatal(err)
			}
			parsed[file] = f
			ast.Inspect(f, func(n ast.Node) bool {
				spec, ok := n.(*ast.TypeSpec)
				if !ok {
					return true
				}
				if _, ok := spec.Type.(*ast.InterfaceType); ok {
					interfaces[spec.Name.Name] = file
					if file == "models.go" {
						t.Errorf("interface in data file: %s/%s", name, file)
					}
				}
				return true
			})
		}
		for file, f := range parsed {
			excluded := map[*ast.Ident]bool{}
			ast.Inspect(f, func(n ast.Node) bool {
				switch x := n.(type) {
				case *ast.SelectorExpr:
					excluded[x.Sel] = true
				case *ast.KeyValueExpr:
					if id, ok := x.Key.(*ast.Ident); ok {
						excluded[id] = true
					}
				case *ast.Field:
					for _, id := range x.Names {
						excluded[id] = true
					}
				}
				return true
			})
			ast.Inspect(f, func(n ast.Node) bool {
				id, ok := n.(*ast.Ident)
				if ok && !excluded[id] {
					if owner, found := interfaces[id.Name]; found && owner != file {
						t.Errorf("interface %s used outside its consumer file: %s/%s", id.Name, name, file)
					}
				}
				return true
			})
		}
		for _, file := range append(p.TestGoFiles, p.XTestGoFiles...) {
			checkTests(t, filepath.Join(p.Dir, file))
		}
	}
}
func checkTests(t *testing.T, path string) {
	t.Helper()
	f, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ParseComments)
	if err != nil {
		t.Fatal(err)
	}
	functions := map[string]*ast.FuncDecl{}
	for _, d := range f.Decls {
		if fn, ok := d.(*ast.FuncDecl); ok {
			functions[fn.Name.Name] = fn
		}
	}
	var external func(*ast.FuncDecl, map[string]bool) bool
	external = func(fn *ast.FuncDecl, seen map[string]bool) bool {
		if fn == nil || seen[fn.Name.Name] {
			return false
		}
		seen[fn.Name.Name] = true
		found := false
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			if sel, ok := call.Fun.(*ast.SelectorExpr); ok {
				if id, ok := sel.X.(*ast.Ident); ok {
					key := id.Name + "." + sel.Sel.Name
					switch key {
					case "exec.Command", "exec.CommandContext", "time.NewTimer", "time.NewTicker", "time.After", "time.Sleep", "context.WithTimeout", "context.WithDeadline", "net.Listen", "httptest.NewServer", "httptest.NewTLSServer":
						found = true
					}
					if key == "time.Sleep" {
						t.Errorf("test must drive time through a seam: %s", path)
					}
				}
			}
			if id, ok := call.Fun.(*ast.Ident); ok && external(functions[id.Name], seen) {
				found = true
			}
			return true
		})
		return found
	}
	for _, fn := range functions {
		if !strings.HasPrefix(fn.Name.Name, "Test") || fn.Name.Name == "TestMain" {
			continue
		}
		doc := ""
		if fn.Doc != nil {
			doc = fn.Doc.Text()
		}
		if external(fn, map[string]bool{}) && !strings.Contains(doc, "Contract test:") {
			t.Errorf("missing contract marker: %s %s", path, fn.Name.Name)
		}
		parallel := false
		if fn.Body != nil && len(fn.Body.List) > 0 {
			if stmt, ok := fn.Body.List[0].(*ast.ExprStmt); ok {
				if call, ok := stmt.X.(*ast.CallExpr); ok {
					if sel, ok := call.Fun.(*ast.SelectorExpr); ok && sel.Sel.Name == "Parallel" {
						parallel = true
					}
				}
			}
		}
		if !parallel && !strings.Contains(doc, "Serial:") {
			t.Errorf("missing Parallel or Serial reason: %s %s", path, fn.Name.Name)
		}
	}
}
