package archtest

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"slices"
	"sort"
	"strings"
)

// The marker and the parallelism of ADR-017 (rules 1 and 5), checked over
// the module's test files.

const (
	contractMarker = "Contract test:"
	serialMarker   = "Serial:"
)

// realMachinery is what only a contract test may use (ADR-017 rule 1), by
// import path: what starts a process, builds, listens on a socket or starts
// a real timer.
var realMachinery = map[string][]string{
	"os/exec":           {"Command", "CommandContext"},
	"time":              {"Sleep", "After", "AfterFunc", "NewTimer", "NewTicker", "Tick"},
	"context":           {"WithTimeout", "WithTimeoutCause", "WithDeadline", "WithDeadlineCause"},
	"net":               {"Listen"},
	"net/http/httptest": {"NewServer", "NewTLSServer", "NewUnstartedServer"},
	module + "/internal/adapters/runtime/runtimetest": {"Binary", "Build"},
}

// testFindings lists what the test files under root owe ADR-017. Each
// top-level test, func TestX(t *testing.T), owes two things.
//
// The marker: a test that uses real machinery has a line in its doc comment
// that starts "Contract test:" and says what real thing the test is about.
//
// The parallelism: a test's first statement is t.Parallel(), or a line of
// its doc comment starts "Serial:" and says why; never both.
//
// How far a test is followed for real machinery, which the ADR leaves open:
// through the declarations of its own directory's test files, by name,
// without type information. A test uses what its body names from
// realMachinery and what every declaration it reaches names. It reaches a
// function, variable or type of those files by naming it, called or not: a
// function brings its body, a variable its initial value, and a type its
// definition and every method declared on it. So a helper, a harness's
// fields and a spy's method that only the product calls are all followed.
// A local name that hides a declaration is not followed, and neither is a
// field's or a method's name: x.wait() follows x, not wait. Nothing is
// followed into another package or a file that is not a test file: what
// builds or starts something there is named in realMachinery itself.
func testFindings(root string) ([]string, error) {
	directories := map[string][]string{}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		name := entry.Name()
		if entry.IsDir() {
			if path != root && (name == "testdata" || name == "vendor" || strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_")) {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasSuffix(name, "_test.go") {
			directories[filepath.Dir(path)] = append(directories[filepath.Dir(path)], path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	var findings []string
	for _, files := range directories {
		found, err := directoryFindings(root, files)
		if err != nil {
			return nil, err
		}
		findings = append(findings, found...)
	}
	sort.Strings(findings)
	return findings, nil
}

// declaration is one package-level name of a directory's test files.
type declaration struct {
	parts []part   // a function, a variable's specification, a type and its methods
	real  []string // what the parts name from realMachinery, as "time.After"
	names []string // the directory's declarations the parts name
}

// part is a piece of syntax and the file whose imports it reads.
type part struct {
	file *ast.File
	node ast.Node
}

func directoryFindings(root string, files []string) ([]string, error) {
	fset := token.NewFileSet()
	declarations := map[string]*declaration{}
	packageLevel := map[any]bool{} // the declaring syntax of each
	declare := func(name string, file *ast.File, node ast.Node) {
		if declarations[name] == nil {
			declarations[name] = &declaration{}
		}
		declarations[name].parts = append(declarations[name].parts, part{file, node})
		packageLevel[node] = true
	}
	var tests []part
	for _, path := range files {
		file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
		if err != nil {
			return nil, err
		}
		for _, decl := range file.Decls {
			switch d := decl.(type) {
			case *ast.FuncDecl:
				switch {
				case d.Recv != nil:
					if receiver := receiverType(d); receiver != "" {
						declare(receiver, file, d)
					}
				case isTest(d):
					tests = append(tests, part{file, d})
				default:
					declare(d.Name.Name, file, d)
				}
			case *ast.GenDecl:
				for _, spec := range d.Specs {
					switch s := spec.(type) {
					case *ast.TypeSpec:
						declare(s.Name.Name, file, s)
					case *ast.ValueSpec:
						for _, name := range s.Names {
							declare(name.Name, file, s)
						}
					}
				}
			}
		}
	}
	uses := func(p part) (real, names []string) {
		imports := importNames(p.file)
		walkNames(p.node, packageLevel, func(ident *ast.Ident, selected string) {
			if path, ok := imports[ident.Name]; ok && ident.Obj == nil {
				if slices.Contains(realMachinery[path], selected) {
					real = append(real, ident.Name+"."+selected)
				}
				return
			}
			if _, ok := declarations[ident.Name]; ok {
				names = append(names, ident.Name)
			}
		})
		return real, names
	}
	for _, d := range declarations {
		for _, p := range d.parts {
			real, names := uses(p)
			d.real = append(d.real, real...)
			d.names = append(d.names, names...)
		}
	}

	var findings []string
	for _, p := range tests {
		test := p.node.(*ast.FuncDecl)
		position := fset.Position(test.Pos())
		if relative, err := filepath.Rel(root, position.Filename); err == nil {
			position.Filename = filepath.ToSlash(relative)
		}
		where := fmt.Sprintf("%s:%d: %s", position.Filename, position.Line, test.Name.Name)

		real, names := uses(part{p.file, test.Body})
		use := reached(declarations, names)
		if len(real) > 0 {
			use = real[0]
		}
		if use != "" && !docSays(test.Doc, contractMarker) {
			findings = append(findings, fmt.Sprintf("%s uses %s and has no %q line in its doc comment", where, use, contractMarker))
		}
		switch parallel, serial := startsParallel(test), docSays(test.Doc, serialMarker); {
		case parallel && serial:
			findings = append(findings, fmt.Sprintf("%s starts with t.Parallel() and has a %q line", where, serialMarker))
		case !parallel && !serial:
			findings = append(findings, fmt.Sprintf("%s neither starts with t.Parallel() nor has a %q line in its doc comment", where, serialMarker))
		}
	}
	return findings, nil
}

// reached is the first real machinery the declarations named reach, with
// the way to it, as "time.After (through newHarness, spy)", or "" for none.
func reached(declarations map[string]*declaration, names []string) string {
	type step struct {
		name string
		way  []string
	}
	var queue []step
	for _, name := range names {
		queue = append(queue, step{name, []string{name}})
	}
	seen := map[string]bool{}
	for len(queue) > 0 {
		next := queue[0]
		queue = queue[1:]
		if seen[next.name] {
			continue
		}
		seen[next.name] = true
		d := declarations[next.name]
		if len(d.real) > 0 {
			return fmt.Sprintf("%s (through %s)", d.real[0], strings.Join(next.way, ", "))
		}
		for _, name := range d.names {
			queue = append(queue, step{name, append(slices.Clone(next.way), name)})
		}
	}
	return ""
}

// walkNames reports each name the syntax uses that is not a local one: one
// the file does not declare, or one declared at package level. A name that
// a selector starts from comes with what is selected, as time and "After"
// do in time.After. The names of fields, methods and labels are not
// reported.
func walkNames(node ast.Node, packageLevel map[any]bool, report func(ident *ast.Ident, selected string)) {
	name := func(ident *ast.Ident, selected string) {
		if ident.Obj == nil || packageLevel[ident.Obj.Decl] {
			report(ident, selected)
		}
	}
	var walk func(ast.Node)
	walk = func(node ast.Node) {
		ast.Inspect(node, func(n ast.Node) bool {
			switch n := n.(type) {
			case *ast.SelectorExpr:
				if ident, ok := n.X.(*ast.Ident); ok {
					name(ident, n.Sel.Name)
				} else {
					walk(n.X)
				}
				return false
			case *ast.KeyValueExpr:
				// A bare key is a field's name in a struct literal.
				if _, ok := n.Key.(*ast.Ident); !ok {
					walk(n.Key)
				}
				walk(n.Value)
				return false
			case *ast.Field:
				walk(n.Type)
				return false
			case *ast.FuncDecl:
				if n.Recv != nil {
					walk(n.Recv)
				}
				walk(n.Type)
				if n.Body != nil {
					walk(n.Body)
				}
				return false
			case *ast.LabeledStmt:
				walk(n.Stmt)
				return false
			case *ast.BranchStmt:
				return false
			case *ast.Ident:
				name(n, "")
			}
			return true
		})
	}
	walk(node)
}

// importNames maps the names a file's imports go by to their paths.
func importNames(file *ast.File) map[string]string {
	names := map[string]string{}
	for _, spec := range file.Imports {
		path := strings.Trim(spec.Path.Value, "`\"")
		name := path[strings.LastIndex(path, "/")+1:]
		if spec.Name != nil {
			name = spec.Name.Name
		}
		names[name] = path
	}
	return names
}

// receiverType is the name of the type a method is declared on.
func receiverType(method *ast.FuncDecl) string {
	if len(method.Recv.List) != 1 {
		return ""
	}
	expr := method.Recv.List[0].Type
	for {
		switch e := expr.(type) {
		case *ast.StarExpr:
			expr = e.X
		case *ast.IndexExpr:
			expr = e.X
		case *ast.IndexListExpr:
			expr = e.X
		case *ast.Ident:
			return e.Name
		default:
			return ""
		}
	}
}

// isTest is whether a function is a top-level test: TestX(t *testing.T).
func isTest(function *ast.FuncDecl) bool {
	if function.Recv != nil || !strings.HasPrefix(function.Name.Name, "Test") || function.Name.Name == "TestMain" {
		return false
	}
	params := function.Type.Params.List
	if len(params) != 1 || len(params[0].Names) != 1 {
		return false
	}
	star, ok := params[0].Type.(*ast.StarExpr)
	if !ok {
		return false
	}
	selector, ok := star.X.(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "T" {
		return false
	}
	pkg, ok := selector.X.(*ast.Ident)
	return ok && pkg.Name == "testing"
}

// startsParallel is whether a test's first statement is t.Parallel().
func startsParallel(test *ast.FuncDecl) bool {
	if test.Body == nil || len(test.Body.List) == 0 {
		return false
	}
	statement, ok := test.Body.List[0].(*ast.ExprStmt)
	if !ok {
		return false
	}
	call, ok := statement.X.(*ast.CallExpr)
	if !ok || len(call.Args) != 0 {
		return false
	}
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "Parallel" {
		return false
	}
	receiver, ok := selector.X.(*ast.Ident)
	return ok && receiver.Name == test.Type.Params.List[0].Names[0].Name
}

// docSays is whether a line of the doc comment starts with the marker and
// goes on to say something.
func docSays(doc *ast.CommentGroup, marker string) bool {
	if doc == nil {
		return false
	}
	for _, line := range strings.Split(doc.Text(), "\n") {
		if rest, ok := strings.CutPrefix(strings.TrimSpace(line), marker); ok && strings.TrimSpace(rest) != "" {
			return true
		}
	}
	return false
}
