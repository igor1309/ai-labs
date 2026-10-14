package layout_test

import (
	"errors"
	"fmt"
	"io/fs"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/layout"
)

const (
	homeFolder       = "/home/.agister"
	repositoryFolder = "/repo/.agister"
	projectFolder    = "/repo/p/.agister"
)

var allFolders = layout.Folders{Home: homeFolder, Repository: repositoryFolder, Project: projectFolder}

// spyFiles holds the files its test gives, their bytes by path; a folder
// is there when a file is below it. A path in failing fails, listed or
// read, with its error. Asked are the paths listed or read, in order.
type spyFiles struct {
	files   map[string]string
	failing map[string]error
	asked   []string
}

func (s *spyFiles) Entries(folder string) ([]layout.Entry, error) {
	s.asked = append(s.asked, folder)
	if err := s.failing[folder]; err != nil {
		return nil, err
	}
	kinds := map[string]layout.EntryKind{}
	for path := range s.files {
		rest, below := strings.CutPrefix(path, folder+"/")
		if !below {
			continue
		}
		name, _, nested := strings.Cut(rest, "/")
		kinds[name] = layout.RegularFile
		if nested {
			kinds[name] = layout.Folder
		}
	}
	if len(kinds) == 0 {
		return nil, fmt.Errorf("spy: no folder %s: %w", folder, fs.ErrNotExist)
	}
	var entries []layout.Entry
	for name, kind := range kinds {
		entries = append(entries, layout.Entry{Name: name, Kind: kind})
	}
	slices.SortFunc(entries, func(a, b layout.Entry) int { return strings.Compare(a.Name, b.Name) })
	return entries, nil
}

func (s *spyFiles) Bytes(file string) ([]byte, error) {
	s.asked = append(s.asked, file)
	if err := s.failing[file]; err != nil {
		return nil, err
	}
	bytes, ok := s.files[file]
	if !ok {
		return nil, fmt.Errorf("spy: no file %s", file)
	}
	return []byte(bytes), nil
}

func read(t *testing.T, files *spyFiles, folders layout.Folders) layout.Snapshot {
	t.Helper()
	l, err := layout.New(files)
	if err != nil {
		t.Fatal(err)
	}
	return l.Read(folders)
}

func assertSnapshot(t *testing.T, got, want layout.Snapshot) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("snapshot\n got %s\nwant %s", show(got), show(want))
	}
}

func show(s layout.Snapshot) string {
	var b strings.Builder
	for kind, named := range s.Documents {
		for name, document := range named {
			fmt.Fprintf(&b, "\n  %s %q:", kind, name)
			for _, slot := range []struct {
				layer  string
				source *layout.Source
			}{{"home", document.Sources.Home}, {"repository", document.Sources.Repository}, {"project", document.Sources.Project}} {
				if slot.source != nil {
					fmt.Fprintf(&b, " %s %s %q;", slot.layer, slot.source.Path, slot.source.Bytes)
				}
			}
			for _, p := range document.Problems {
				fmt.Fprintf(&b, " problem %s: %v;", p.Path, p.Err)
			}
		}
	}
	if s.Blocks != nil {
		fmt.Fprintf(&b, "\n  blocks %s %q", s.Blocks.Path, s.Blocks.Bytes)
	}
	for _, p := range s.Problems {
		fmt.Fprintf(&b, "\n  problem %s: %v", p.Path, p.Err)
	}
	return b.String()
}

func TestNewRefusesNoFilesystem(t *testing.T) {
	t.Parallel()
	if _, err := layout.New(nil); err == nil {
		t.Error("New(nil) gave no error")
	}
}

func TestNoLayerFolderIsGiven(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{homeFolder + "/processes/review.yaml": "timeout: 20m"}}
	got := read(t, files, layout.Folders{})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{}})
}

func TestOneLayerHoldsADocument(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{"/home/.agister/processes/review.yaml": "timeout: 20m"}}
	got := read(t, files, layout.Folders{Home: "/home/.agister"})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
		layout.Process: {"review": {Sources: layout.Sources{
			Home: &layout.Source{Path: "/home/.agister/processes/review.yaml", Bytes: []byte("timeout: 20m")},
		}}},
	}})
}

func TestEveryLayerHoldsTheSameDocument(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{
		"/home/.agister/processes/review.yaml":   "timeout: 20m",
		"/repo/.agister/processes/review.yaml":   "timeout: 30m",
		"/repo/p/.agister/processes/review.yaml": "timeout: 40m",
	}}
	got := read(t, files, layout.Folders{Home: "/home/.agister", Repository: "/repo/.agister", Project: "/repo/p/.agister"})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
		layout.Process: {"review": {Sources: layout.Sources{
			Home:       &layout.Source{Path: "/home/.agister/processes/review.yaml", Bytes: []byte("timeout: 20m")},
			Repository: &layout.Source{Path: "/repo/.agister/processes/review.yaml", Bytes: []byte("timeout: 30m")},
			Project:    &layout.Source{Path: "/repo/p/.agister/processes/review.yaml", Bytes: []byte("timeout: 40m")},
		}}},
	}})
}

func TestLayersHoldDifferentDocuments(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{
		homeFolder + "/processes/a.yaml":       "a",
		repositoryFolder + "/processes/b.yaml": "b",
	}}
	got := read(t, files, layout.Folders{Home: homeFolder, Repository: repositoryFolder})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
		layout.Process: {
			"a": {Sources: layout.Sources{Home: &layout.Source{Path: homeFolder + "/processes/a.yaml", Bytes: []byte("a")}}},
			"b": {Sources: layout.Sources{Repository: &layout.Source{Path: repositoryFolder + "/processes/b.yaml", Bytes: []byte("b")}}},
		},
	}})
}

func TestAKindsFolderAndExtensionGiveItsDocuments(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		kind      layout.Kind
		folder    string
		extension string
	}{
		{layout.Agent, "agents", ".toml"},
		{layout.Process, "processes", ".yaml"},
		{layout.Workflow, "workflows", ".yaml"},
		{layout.Runtime, "runtimes", ".yaml"},
		{layout.Verify, "verifies", ".yaml"},
		{layout.Brief, "briefs", ".yaml"},
		{layout.Schema, "schemas", ".json"},
		{layout.Prompt, "prompts", ".md"},
	} {
		t.Run(string(c.kind), func(t *testing.T) {
			t.Parallel()
			path := homeFolder + "/" + c.folder + "/review" + c.extension
			files := &spyFiles{files: map[string]string{path: "bytes"}}
			got := read(t, files, layout.Folders{Home: homeFolder})
			assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
				c.kind: {"review": {Sources: layout.Sources{Home: &layout.Source{Path: path, Bytes: []byte("bytes")}}}},
			}})
		})
	}
}

func TestAnEmptyFileIsASourceWithNoBytes(t *testing.T) {
	t.Parallel()
	path := homeFolder + "/processes/review.yaml"
	files := &spyFiles{files: map[string]string{path: ""}}
	got := read(t, files, layout.Folders{Home: homeFolder})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
		layout.Process: {"review": {Sources: layout.Sources{Home: &layout.Source{Path: path, Bytes: []byte{}}}}},
	}})
}

func TestTheRepositoryFolderHoldsBlocks(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{"/repo/.agister/blocks.yaml": "- process: review"}}
	got := read(t, files, layout.Folders{Repository: "/repo/.agister"})
	assertSnapshot(t, got, layout.Snapshot{
		Documents: map[layout.Kind]map[string]layout.Document{},
		Blocks:    &layout.Source{Path: "/repo/.agister/blocks.yaml", Bytes: []byte("- process: review")},
	})
}

func TestBlocksOutsideTheRepositoryFolderAreAProblem(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		layer   string
		folders layout.Folders
		folder  string
	}{
		{"home", layout.Folders{Home: homeFolder}, homeFolder},
		{"project", layout.Folders{Project: projectFolder}, projectFolder},
	} {
		t.Run(c.layer, func(t *testing.T) {
			t.Parallel()
			files := &spyFiles{files: map[string]string{c.folder + "/blocks.yaml": "- process: review"}}
			got := read(t, files, c.folders)
			assertSnapshot(t, got, layout.Snapshot{
				Documents: map[layout.Kind]map[string]layout.Document{},
				Problems:  []layout.Problem{{Path: c.folder + "/blocks.yaml", Err: layout.ErrBlocksOutsideRepository}},
			})
		})
	}
}

func TestBlocksThatCannotBeReadAreAProblemOfTheRepositoryLayer(t *testing.T) {
	t.Parallel()
	err := errors.New("permission denied")
	files := &spyFiles{
		files:   map[string]string{"/repo/.agister/blocks.yaml": "- process: review"},
		failing: map[string]error{"/repo/.agister/blocks.yaml": err},
	}
	got := read(t, files, layout.Folders{Repository: "/repo/.agister"})
	assertSnapshot(t, got, layout.Snapshot{
		Documents: map[layout.Kind]map[string]layout.Document{},
		Problems:  []layout.Problem{{Path: "/repo/.agister/blocks.yaml", Err: err}},
	})
}

func TestAFileThatCannotBeReadIsAProblemOfItsDocument(t *testing.T) {
	t.Parallel()
	err := errors.New("permission denied")
	files := &spyFiles{
		files: map[string]string{
			"/home/.agister/processes/a.yaml": "a",
			"/home/.agister/processes/b.yaml": "b",
		},
		failing: map[string]error{"/home/.agister/processes/a.yaml": err},
	}
	got := read(t, files, layout.Folders{Home: "/home/.agister"})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
		layout.Process: {
			"a": {Problems: []layout.Problem{{Path: "/home/.agister/processes/a.yaml", Err: err}}},
			"b": {Sources: layout.Sources{Home: &layout.Source{Path: "/home/.agister/processes/b.yaml", Bytes: []byte("b")}}},
		},
	}})
}

func TestANearerLayersFileThatCannotBeReadIsNoFallBack(t *testing.T) {
	t.Parallel()
	err := errors.New("permission denied")
	files := &spyFiles{
		files: map[string]string{
			"/home/.agister/processes/review.yaml": "timeout: 20m",
			"/repo/.agister/processes/review.yaml": "timeout: 30m",
		},
		failing: map[string]error{"/repo/.agister/processes/review.yaml": err},
	}
	got := read(t, files, layout.Folders{Home: "/home/.agister", Repository: "/repo/.agister"})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
		layout.Process: {"review": {
			Sources:  layout.Sources{Home: &layout.Source{Path: "/home/.agister/processes/review.yaml", Bytes: []byte("timeout: 20m")}},
			Problems: []layout.Problem{{Path: "/repo/.agister/processes/review.yaml", Err: err}},
		}},
	}})
}

func TestALayerFolderThatCannotBeListedIsAProblemOfItsLayer(t *testing.T) {
	t.Parallel()
	err := errors.New("permission denied")
	files := &spyFiles{
		files: map[string]string{
			"/home/.agister/processes/a.yaml": "a",
			"/repo/.agister/processes/b.yaml": "b",
		},
		failing: map[string]error{"/repo/.agister": err},
	}
	got := read(t, files, layout.Folders{Home: "/home/.agister", Repository: "/repo/.agister"})
	assertSnapshot(t, got, layout.Snapshot{
		Documents: map[layout.Kind]map[string]layout.Document{
			layout.Process: {"a": {Sources: layout.Sources{Home: &layout.Source{Path: "/home/.agister/processes/a.yaml", Bytes: []byte("a")}}}},
		},
		Problems: []layout.Problem{{Path: "/repo/.agister", Err: err}},
	})
}

func TestAKindsFolderThatCannotBeListedIsAProblemOfItsLayer(t *testing.T) {
	t.Parallel()
	err := errors.New("permission denied")
	files := &spyFiles{
		files: map[string]string{
			"/home/.agister/processes/a.yaml":  "a",
			"/home/.agister/prompts/review.md": "review",
		},
		failing: map[string]error{"/home/.agister/processes": err},
	}
	got := read(t, files, layout.Folders{Home: "/home/.agister"})
	assertSnapshot(t, got, layout.Snapshot{
		Documents: map[layout.Kind]map[string]layout.Document{
			layout.Prompt: {"review": {Sources: layout.Sources{Home: &layout.Source{Path: "/home/.agister/prompts/review.md", Bytes: []byte("review")}}}},
		},
		Problems: []layout.Problem{{Path: "/home/.agister/processes", Err: err}},
	})
}

func TestAKindsFolderALayerDoesNotHaveIsNoProblem(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{"/home/.agister/prompts/review.md": "review"}}
	got := read(t, files, layout.Folders{Home: "/home/.agister"})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
		layout.Prompt: {"review": {Sources: layout.Sources{Home: &layout.Source{Path: "/home/.agister/prompts/review.md", Bytes: []byte("review")}}}},
	}})
}

// A layer folder that does not exist is told by its error, fs.ErrNotExist
// or one wrapping it; another error is the problem as it is.
func TestALayerFolderGivenThatDoesNotExistIsAProblem(t *testing.T) {
	t.Parallel()
	for _, notExist := range []error{fs.ErrNotExist, fmt.Errorf("open /repo/p/.agister: %w", fs.ErrNotExist)} {
		t.Run(notExist.Error(), func(t *testing.T) {
			t.Parallel()
			files := &spyFiles{failing: map[string]error{"/repo/p/.agister": notExist}}
			got := read(t, files, layout.Folders{Project: "/repo/p/.agister"})
			assertSnapshot(t, got, layout.Snapshot{
				Documents: map[layout.Kind]map[string]layout.Document{},
				Problems:  []layout.Problem{{Path: "/repo/p/.agister", Err: layout.ErrNoLayerFolder}},
			})
		})
	}
}

func TestAFileWithAnotherExtensionInAKindsFolderIsAProblem(t *testing.T) {
	t.Parallel()
	path := homeFolder + "/processes/review.toml"
	files := &spyFiles{files: map[string]string{path: "timeout = '20m'"}}
	got := read(t, files, layout.Folders{Home: homeFolder})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
		layout.Process: {"review": {Problems: []layout.Problem{{Path: path, Err: layout.ExtensionError{Kind: layout.Process, Extension: ".yaml"}}}}},
	}})
	if want := `a process is a ".yaml" file`; got.Documents[layout.Process]["review"].Problems[0].Err.Error() != want {
		t.Errorf("problem %q, want %q", got.Documents[layout.Process]["review"].Problems[0].Err, want)
	}
	assertNotAsked(t, files, path)
}

func TestAFileWhoseNameIsNoNameIsAProblem(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ file, name string }{
		{"Bad Name.yaml", "Bad Name"},
		{"Review.yaml", "Review"},
		{"aZ.yaml", "aZ"},
		{"0a.yaml", "0a"},
		{"-a.yaml", "-a"},
		{"_a.yaml", "_a"},
		{"a.b.yaml", "a.b"},
	} {
		t.Run(c.file, func(t *testing.T) {
			t.Parallel()
			path := homeFolder + "/processes/" + c.file
			files := &spyFiles{files: map[string]string{path: "timeout: 20m"}}
			got := read(t, files, layout.Folders{Home: homeFolder})
			assertSnapshot(t, got, layout.Snapshot{
				Documents: map[layout.Kind]map[string]layout.Document{},
				Problems:  []layout.Problem{{Path: path, Err: layout.NameError{Name: c.name}}},
			})
			if want := fmt.Sprintf("%q is no name", c.name); got.Problems[0].Err.Error() != want {
				t.Errorf("problem %q, want %q", got.Problems[0].Err, want)
			}
			assertNotAsked(t, files, path)
		})
	}
}

func TestANameOfLettersDigitsUnderscoreAndHyphenIsAName(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ file, name string }{
		{"a.yaml", "a"},
		{"a-b_c.yaml", "a-b_c"},
		{"a0.yaml", "a0"},
	} {
		t.Run(c.file, func(t *testing.T) {
			t.Parallel()
			path := homeFolder + "/processes/" + c.file
			files := &spyFiles{files: map[string]string{path: "timeout: 20m"}}
			got := read(t, files, layout.Folders{Home: homeFolder})
			assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{
				layout.Process: {c.name: {Sources: layout.Sources{Home: &layout.Source{Path: path, Bytes: []byte("timeout: 20m")}}}},
			}})
		})
	}
}

func TestAFolderInsideAKindsFolderIsAProblem(t *testing.T) {
	t.Parallel()
	folder := homeFolder + "/processes/team"
	files := &spyFiles{files: map[string]string{folder + "/review.yaml": "timeout: 20m"}}
	got := read(t, files, layout.Folders{Home: homeFolder})
	assertSnapshot(t, got, layout.Snapshot{
		Documents: map[layout.Kind]map[string]layout.Document{},
		Problems:  []layout.Problem{{Path: folder, Err: layout.ErrFolderInKindFolder}},
	})
	assertNotAsked(t, files, folder, folder+"/review.yaml")
}

// A hidden file in a kind's folder is no settings, so no name to judge.
func TestAHiddenFileInAKindsFolderIsSkipped(t *testing.T) {
	t.Parallel()
	path := homeFolder + "/processes/.DS_Store"
	files := &spyFiles{files: map[string]string{path: "\x00"}}
	got := read(t, files, layout.Folders{Home: homeFolder})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Document{}})
	assertNotAsked(t, files, path)
}

func assertNotAsked(t *testing.T, files *spyFiles, paths ...string) {
	t.Helper()
	for _, path := range paths {
		if slices.Contains(files.asked, path) {
			t.Errorf("%s was listed or read; asked %q", path, files.asked)
		}
	}
}
