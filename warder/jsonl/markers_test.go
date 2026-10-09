package jsonl_test

import (
	"fmt"
	"go/ast"
	"go/token"
	"slices"
	"strings"
	"testing"
)

// Every test of the module calls t.Parallel() first or says why it runs
// alone, and every test that reaches real machinery says which.
func TestTestsCarryTheirMarkers(t *testing.T) {
	t.Parallel()
	checked, problems, err := checkTestMarkers(".")
	if err != nil {
		t.Fatal(err)
	}
	if checked == 0 {
		t.Fatal("found no test to check")
	}
	for _, problem := range problems {
		t.Error(problem)
	}
}

// The checker accepts parallel tests and subtests, serial ones that say
// why, and a contract test that reaches a process through its helper.
func TestTheMarkerCheckerAcceptsMarkedTests(t *testing.T) {
	t.Parallel()
	root := writeFixture(t, map[string]string{
		"fixture_test.go": `package fixture

import (
	"os/exec"
	"testing"
	"time"
)

func TestParallel(t *testing.T) {
	t.Parallel()
	t.Run("sub", func(t *testing.T) {
		t.Parallel()
	})
	t.Run("named", parallelSubtest)
}

func parallelSubtest(t *testing.T) {
	t.Parallel()
}

// Serial: it sets the environment.
func TestSerial(t *testing.T) {
	t.Setenv("NAME", "value")
	// Serial: it shares its parent's environment.
	t.Run("sub", func(t *testing.T) {})
}

// Contract test: the real git.
func TestContract(t *testing.T) {
	t.Parallel()
	if err := gitVersion(t); err != nil {
		t.Fatal(err)
	}
}

func gitVersion(t *testing.T) error {
	return exec.CommandContext(t.Context(), "git", "version").Run()
}

func TestReadsTheClock(t *testing.T) {
	t.Parallel()
	_ = time.Now()
}

func TestMain(m *testing.M) { m.Run() }
`,
	})

	checked, problems, err := checkTestMarkers(root)
	if err != nil {
		t.Fatal(err)
	}
	if checked != 4 {
		t.Errorf("checked %d tests, want 4", checked)
	}
	if len(problems) != 0 {
		t.Errorf("got problems %q, want none", problems)
	}
}

// The checker reports a test or subtest that neither runs in parallel
// first nor says Serial:, and a test that reaches real machinery, directly
// or through its package's helpers, without a Contract test: line.
func TestTheMarkerCheckerReportsUnmarkedTests(t *testing.T) {
	t.Parallel()
	root := writeFixture(t, map[string]string{
		"fixture_test.go": `package fixture

import (
	"context"
	osexec "os/exec"
	"testing"
	"time"
)

func TestNoMarker(t *testing.T) {
}

func TestParallelNotFirst(t *testing.T) {
	t.Helper()
	t.Parallel()
}

func TestUnmarkedSubtest(t *testing.T) {
	t.Parallel()
	t.Run("sub", func(t *testing.T) {
		t.Log("first")
	})
}

func TestSleeps(t *testing.T) {
	t.Parallel()
	time.Sleep(time.Millisecond)
}

func TestThroughHelpers(t *testing.T) {
	t.Parallel()
	outer(t)
}

func outer(t *testing.T) { inner(t) }

func inner(t *testing.T) { _ = osexec.Command("true") }

// A Contract test: mentioned within a line does not count.
func TestTimeout(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	_ = ctx
}
`,
		"network_test.go": `package fixture

import (
	"net"
	"net/http/httptest"
	"testing"
	"time"
)

func TestListens(t *testing.T) {
	t.Parallel()
	_, _ = net.Listen("tcp", "127.0.0.1:0")
}

func TestServes(t *testing.T) {
	t.Parallel()
	httptest.NewServer(nil).Close()
}

func TestWaitsThroughAMethod(t *testing.T) {
	t.Parallel()
	var w waiter
	w.wait()
}

type waiter struct{}

func (waiter) wait() { <-time.After(time.Second) }
`,
	})

	checked, problems, err := checkTestMarkers(root)
	if err != nil {
		t.Fatal(err)
	}
	if checked != 9 {
		t.Errorf("checked %d tests, want 9", checked)
	}
	want := []string{
		"fixture_test.go:10: TestNoMarker neither calls t.Parallel() first nor has a Serial: line in its doc comment",
		"fixture_test.go:13: TestParallelNotFirst neither calls t.Parallel() first nor has a Serial: line in its doc comment",
		"fixture_test.go:20: a subtest of TestUnmarkedSubtest neither calls t.Parallel() first nor has a Serial: comment line above its Run",
		"fixture_test.go:25: TestSleeps uses time.Sleep without a Contract test: line in its doc comment",
		"fixture_test.go:30: TestThroughHelpers uses os/exec through outer, inner without a Contract test: line in its doc comment",
		"fixture_test.go:40: TestTimeout uses context.WithTimeout without a Contract test: line in its doc comment",
		"network_test.go:10: TestListens uses net.Listen without a Contract test: line in its doc comment",
		"network_test.go:15: TestServes uses net/http/httptest.NewServer without a Contract test: line in its doc comment",
		"network_test.go:20: TestWaitsThroughAMethod uses time.After through wait without a Contract test: line in its doc comment",
	}
	slices.Sort(want)
	if !slices.Equal(problems, want) {
		t.Errorf("got problems\n%s\nwant\n%s", strings.Join(problems, "\n"), strings.Join(want, "\n"))
	}
}

// realMachinery reports whether a name of the package at importPath is
// real machinery, which a test may reach only as a contract test: any name
// of os/exec, and the real timers, deadlines, listeners and servers.
func realMachinery(importPath, name string) bool {
	switch importPath {
	case "os/exec":
		return true
	case "time":
		return slices.Contains([]string{"Sleep", "After", "AfterFunc", "NewTimer", "Tick", "NewTicker"}, name)
	case "context":
		return slices.Contains([]string{"WithTimeout", "WithTimeoutCause", "WithDeadline", "WithDeadlineCause"}, name)
	case "net":
		return slices.Contains([]string{"Listen", "ListenPacket"}, name)
	case "net/http/httptest":
		return slices.Contains([]string{"NewServer", "NewTLSServer", "NewUnstartedServer"}, name)
	}
	return false
}

// checkTestMarkers checks the tests in the test files of the module at
// root. A top-level test, and each subtest, calls t.Parallel() first or
// has a line starting "Serial:" in its doc comment (for a subtest, in the
// comment just above its Run). A test that uses real machinery, directly
// or through a function or method of its package, has a line starting
// "Contract test:" in its doc comment. It returns how many top-level
// tests it checked and the problems, sorted.
func checkTestMarkers(root string) (int, []string, error) {
	fset, packages, err := parsePackages(root, true)
	if err != nil {
		return 0, nil, err
	}
	checked := 0
	var problems []string
	for _, pkg := range packages {
		n, found := checkPackageMarkers(fset, pkg)
		checked += n
		problems = append(problems, found...)
	}
	slices.Sort(problems)
	return checked, problems, nil
}

type testFunc struct {
	decl *ast.FuncDecl
	file *goFile
}

func checkPackageMarkers(fset *token.FileSet, pkg *goPackage) (int, []string) {
	var funcs []testFunc
	byName := map[string]testFunc{}
	methods := map[string][]testFunc{}
	for _, file := range pkg.files {
		for _, decl := range file.syntax.Decls {
			if decl, ok := decl.(*ast.FuncDecl); ok && decl.Body != nil {
				fn := testFunc{decl: decl, file: file}
				funcs = append(funcs, fn)
				if decl.Recv == nil {
					byName[decl.Name.Name] = fn
				} else {
					methods[decl.Name.Name] = append(methods[decl.Name.Name], fn)
				}
			}
		}
	}

	uses := machineryUses(funcs, byName, methods)
	problems := []string{}
	report := func(file *goFile, pos token.Pos, format string, args ...any) {
		problems = append(problems, fmt.Sprintf("%s:%d: ", file.path, fset.Position(pos).Line)+fmt.Sprintf(format, args...))
	}
	checked := 0
	for _, fn := range funcs {
		name := fn.decl.Name.Name
		if fn.decl.Recv != nil || !strings.HasPrefix(name, "Test") || testingParam(fn.file, fn.decl.Type) == nil {
			continue
		}
		checked++
		if !startsParallel(fn.file, fn.decl.Type, fn.decl.Body) && !docHasLine(fn.decl.Doc, "Serial:") {
			report(fn.file, fn.decl.Pos(), "%s neither calls t.Parallel() first nor has a Serial: line in its doc comment", name)
		}
		for _, run := range subtestRuns(fn) {
			if !subtestMarked(fset, fn.file, run, byName) {
				report(fn.file, run.Pos(), "a subtest of %s neither calls t.Parallel() first nor has a Serial: comment line above its Run", name)
			}
		}
		if use, ok := uses[fn.decl]; ok && !docHasLine(fn.decl.Doc, "Contract test:") {
			report(fn.file, fn.decl.Pos(), "%s uses %s without a Contract test: line in its doc comment", name, use)
		}
	}
	return checked, problems
}

// machineryUses finds, for each function or method of the package, the
// real machinery it reaches: directly, or through another of them, by name
// (a method by its name alone, whatever its receiver).
func machineryUses(funcs []testFunc, byName map[string]testFunc, methods map[string][]testFunc) map[*ast.FuncDecl]machineryUse {
	uses := map[*ast.FuncDecl]machineryUse{}
	for _, fn := range funcs {
		if what := directUse(fn); what != "" {
			uses[fn.decl] = machineryUse{what: what}
		}
	}
	for changed := true; changed; {
		changed = false
		for _, fn := range funcs {
			if _, ok := uses[fn.decl]; ok {
				continue
			}
			if use, ok := helperUse(fn, byName, methods, uses); ok {
				uses[fn.decl] = use
				changed = true
			}
		}
	}
	return uses
}

// machineryUse is the real machinery a function reaches, and the
// functions of its package it reaches it through, outermost first.
type machineryUse struct {
	what    string
	through []string
}

func (u machineryUse) String() string {
	if len(u.through) == 0 {
		return u.what
	}
	return u.what + " through " + strings.Join(u.through, ", ")
}

func directUse(fn testFunc) string {
	use := ""
	ast.Inspect(fn.decl.Body, func(node ast.Node) bool {
		if use != "" {
			return false
		}
		selector, ok := node.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		x, ok := selector.X.(*ast.Ident)
		if !ok {
			return true
		}
		importPath, ok := fn.file.imports[x.Name]
		if !ok {
			return true
		}
		if realMachinery(importPath, selector.Sel.Name) {
			use = importPath
			if importPath != "os/exec" {
				use += "." + selector.Sel.Name
			}
		}
		return true
	})
	return use
}

func helperUse(fn testFunc, byName map[string]testFunc, methods map[string][]testFunc, uses map[*ast.FuncDecl]machineryUse) (machineryUse, bool) {
	var use machineryUse
	found := false
	through := func(name string, helper machineryUse) {
		use = machineryUse{what: helper.what, through: append([]string{name}, helper.through...)}
		found = true
	}
	var visit func(node ast.Node) bool
	visit = func(node ast.Node) bool {
		if found {
			return false
		}
		switch node := node.(type) {
		case *ast.SelectorExpr:
			if x, ok := node.X.(*ast.Ident); ok && fn.file.imports[x.Name] != "" {
				return false
			}
			for _, method := range methods[node.Sel.Name] {
				if helper, ok := uses[method.decl]; ok {
					through(node.Sel.Name, helper)
					return false
				}
			}
			ast.Inspect(node.X, visit)
			return false
		case *ast.Ident:
			if helper, ok := byName[node.Name]; ok && helper.decl != fn.decl {
				if helperUse, ok := uses[helper.decl]; ok {
					through(node.Name, helperUse)
				}
			}
		}
		return true
	}
	ast.Inspect(fn.decl.Body, visit)
	return use, found
}

// testingParam returns the parameter of a function that takes only a
// *testing.T, or nil.
func testingParam(file *goFile, fnType *ast.FuncType) *ast.Field {
	if fnType.Params == nil || len(fnType.Params.List) != 1 || len(fnType.Params.List[0].Names) > 1 {
		return nil
	}
	param := fnType.Params.List[0]
	star, ok := param.Type.(*ast.StarExpr)
	if !ok {
		return nil
	}
	selector, ok := star.X.(*ast.SelectorExpr)
	if !ok {
		return nil
	}
	x, ok := selector.X.(*ast.Ident)
	if !ok || file.imports[x.Name] != "testing" || selector.Sel.Name != "T" {
		return nil
	}
	return param
}

// startsParallel reports whether the body's first statement calls
// Parallel on the function's *testing.T.
func startsParallel(file *goFile, fnType *ast.FuncType, body *ast.BlockStmt) bool {
	param := testingParam(file, fnType)
	if param == nil || len(param.Names) == 0 || len(body.List) == 0 {
		return false
	}
	statement, ok := body.List[0].(*ast.ExprStmt)
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
	x, ok := selector.X.(*ast.Ident)
	return ok && x.Name == param.Names[0].Name && x.Name != "_"
}

// subtestRuns finds the test's Run calls on any *testing.T it holds: its
// own or a subtest's.
func subtestRuns(fn testFunc) []*ast.CallExpr {
	tNames := map[string]bool{}
	collect := func(fnType *ast.FuncType) {
		if param := testingParam(fn.file, fnType); param != nil && len(param.Names) == 1 {
			tNames[param.Names[0].Name] = true
		}
	}
	collect(fn.decl.Type)
	ast.Inspect(fn.decl.Body, func(node ast.Node) bool {
		if lit, ok := node.(*ast.FuncLit); ok {
			collect(lit.Type)
		}
		return true
	})

	var runs []*ast.CallExpr
	ast.Inspect(fn.decl.Body, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok || len(call.Args) != 2 {
			return true
		}
		selector, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || selector.Sel.Name != "Run" {
			return true
		}
		if x, ok := selector.X.(*ast.Ident); ok && tNames[x.Name] {
			runs = append(runs, call)
		}
		return true
	})
	return runs
}

// subtestMarked reports whether the subtest a Run starts calls
// t.Parallel() first or says Serial: in the comment just above the Run (a
// subtest of the package's functions, in its doc comment). A subtest that
// is neither a function literal nor a function of the package cannot be
// checked, and is not marked.
func subtestMarked(fset *token.FileSet, file *goFile, run *ast.CallExpr, byName map[string]testFunc) bool {
	switch body := run.Args[1].(type) {
	case *ast.FuncLit:
		if startsParallel(file, body.Type, body.Body) {
			return true
		}
		line := fset.Position(run.Pos()).Line
		for _, group := range file.syntax.Comments {
			if fset.Position(group.End()).Line == line-1 && docHasLine(group, "Serial:") {
				return true
			}
		}
	case *ast.Ident:
		if fn, ok := byName[body.Name]; ok {
			return startsParallel(fn.file, fn.decl.Type, fn.decl.Body) || docHasLine(fn.decl.Doc, "Serial:")
		}
	}
	return false
}
