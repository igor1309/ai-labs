package jsonl_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// goPackage is one package of a module, as parsed: its test files or its
// other files.
type goPackage struct {
	dir   string // slash-separated, relative to the module root
	name  string
	files []*goFile
}

type goFile struct {
	path    string // slash-separated, relative to the module root
	syntax  *ast.File
	imports map[string]string // local name to import path
}

// parsePackages parses the Go files of the module at root, its test files
// or the others, grouped by package. Like the go tool, it skips testdata
// and directories starting with "." or "_", and any nested module.
func parsePackages(root string, tests bool) (*token.FileSet, []*goPackage, error) {
	fset := token.NewFileSet()
	var packages []*goPackage
	byKey := map[string]*goPackage{}
	err := filepath.WalkDir(root, func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(root, name)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if entry.IsDir() {
			if rel == "." {
				return nil
			}
			base := entry.Name()
			if base == "testdata" || strings.HasPrefix(base, ".") || strings.HasPrefix(base, "_") {
				return filepath.SkipDir
			}
			if _, err := os.Stat(filepath.Join(name, "go.mod")); err == nil {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(rel, ".go") || strings.HasSuffix(rel, "_test.go") != tests {
			return nil
		}
		syntax, err := parser.ParseFile(fset, name, nil, parser.ParseComments)
		if err != nil {
			return err
		}
		dir := path.Dir(rel)
		key := dir + " " + syntax.Name.Name
		pkg := byKey[key]
		if pkg == nil {
			pkg = &goPackage{dir: dir, name: syntax.Name.Name}
			byKey[key] = pkg
			packages = append(packages, pkg)
		}
		pkg.files = append(pkg.files, &goFile{path: rel, syntax: syntax, imports: importNames(syntax)})
		return nil
	})
	return fset, packages, err
}

// importNames maps each name a file gives its imports to the import path.
// Blank and dot imports name nothing.
func importNames(file *ast.File) map[string]string {
	names := map[string]string{}
	for _, spec := range file.Imports {
		importPath, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			continue
		}
		name := path.Base(importPath)
		if isMajorVersion(name) && path.Dir(importPath) != "." {
			name = path.Base(path.Dir(importPath))
		}
		if spec.Name != nil {
			name = spec.Name.Name
		}
		if name != "_" && name != "." {
			names[name] = importPath
		}
	}
	return names
}

func isMajorVersion(element string) bool {
	digits, ok := strings.CutPrefix(element, "v")
	_, err := strconv.Atoi(digits)
	return ok && err == nil
}

// docHasLine reports whether a line of the comment starts with prefix.
func docHasLine(doc *ast.CommentGroup, prefix string) bool {
	if doc == nil {
		return false
	}
	for line := range strings.SplitSeq(doc.Text(), "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), prefix) {
			return true
		}
	}
	return false
}

// writeFixture writes the files, by slash-separated path, under a new
// temporary directory and returns it.
func writeFixture(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for name, content := range files {
		file := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}
