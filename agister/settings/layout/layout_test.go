package layout_test

import (
	"errors"
	"fmt"
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
// read, with its error.
type spyFiles struct {
	files   map[string]string
	failing map[string]error
}

func (s *spyFiles) Entries(folder string) ([]layout.Entry, error) {
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
		return nil, fmt.Errorf("spy: no folder %s", folder)
	}
	var entries []layout.Entry
	for name, kind := range kinds {
		entries = append(entries, layout.Entry{Name: name, Kind: kind})
	}
	slices.SortFunc(entries, func(a, b layout.Entry) int { return strings.Compare(a.Name, b.Name) })
	return entries, nil
}

func (s *spyFiles) Bytes(file string) ([]byte, error) {
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
		for name, sources := range named {
			fmt.Fprintf(&b, "\n  %s %q:", kind, name)
			for _, slot := range []struct {
				layer  string
				source *layout.Source
			}{{"home", sources.Home}, {"repository", sources.Repository}, {"project", sources.Project}} {
				if slot.source != nil {
					fmt.Fprintf(&b, " %s %s %q;", slot.layer, slot.source.Path, slot.source.Bytes)
				}
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
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Sources{}})
}

func TestOneLayerHoldsADocument(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{"/home/.agister/processes/review.yaml": "timeout: 20m"}}
	got := read(t, files, layout.Folders{Home: "/home/.agister"})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Sources{
		layout.Process: {"review": {
			Home: &layout.Source{Path: "/home/.agister/processes/review.yaml", Bytes: []byte("timeout: 20m")},
		}},
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
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Sources{
		layout.Process: {"review": {
			Home:       &layout.Source{Path: "/home/.agister/processes/review.yaml", Bytes: []byte("timeout: 20m")},
			Repository: &layout.Source{Path: "/repo/.agister/processes/review.yaml", Bytes: []byte("timeout: 30m")},
			Project:    &layout.Source{Path: "/repo/p/.agister/processes/review.yaml", Bytes: []byte("timeout: 40m")},
		}},
	}})
}

func TestLayersHoldDifferentDocuments(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{
		homeFolder + "/processes/a.yaml":       "a",
		repositoryFolder + "/processes/b.yaml": "b",
	}}
	got := read(t, files, layout.Folders{Home: homeFolder, Repository: repositoryFolder})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Sources{
		layout.Process: {
			"a": {Home: &layout.Source{Path: homeFolder + "/processes/a.yaml", Bytes: []byte("a")}},
			"b": {Repository: &layout.Source{Path: repositoryFolder + "/processes/b.yaml", Bytes: []byte("b")}},
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
			assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Sources{
				c.kind: {"review": {Home: &layout.Source{Path: path, Bytes: []byte("bytes")}}},
			}})
		})
	}
}

func TestAnEmptyFileIsASourceWithNoBytes(t *testing.T) {
	t.Parallel()
	path := homeFolder + "/processes/review.yaml"
	files := &spyFiles{files: map[string]string{path: ""}}
	got := read(t, files, layout.Folders{Home: homeFolder})
	assertSnapshot(t, got, layout.Snapshot{Documents: map[layout.Kind]map[string]layout.Sources{
		layout.Process: {"review": {Home: &layout.Source{Path: path, Bytes: []byte{}}}},
	}})
}

// A folder that cannot be listed or a file that cannot be read is a
// problem naming its path and the error; what else the layers hold is
// still read.
func TestAPathThatCannotBeListedOrReadIsAProblem(t *testing.T) {
	t.Parallel()
	for _, failing := range []string{
		repositoryFolder,
		repositoryFolder + "/processes",
		repositoryFolder + "/processes/b.yaml",
	} {
		t.Run(failing, func(t *testing.T) {
			t.Parallel()
			err := errors.New("permission denied")
			files := &spyFiles{
				files: map[string]string{
					homeFolder + "/processes/a.yaml":       "a",
					repositoryFolder + "/processes/b.yaml": "b",
				},
				failing: map[string]error{failing: err},
			}
			got := read(t, files, layout.Folders{Home: homeFolder, Repository: repositoryFolder})
			assertSnapshot(t, got, layout.Snapshot{
				Documents: map[layout.Kind]map[string]layout.Sources{
					layout.Process: {"a": {Home: &layout.Source{Path: homeFolder + "/processes/a.yaml", Bytes: []byte("a")}}},
				},
				Problems: []layout.Problem{{Path: failing, Err: err}},
			})
		})
	}
}

func TestTheRepositoryFolderHoldsBlocks(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{"/repo/.agister/blocks.yaml": "- process: review"}}
	got := read(t, files, layout.Folders{Repository: "/repo/.agister"})
	assertSnapshot(t, got, layout.Snapshot{
		Documents: map[layout.Kind]map[string]layout.Sources{},
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
				Documents: map[layout.Kind]map[string]layout.Sources{},
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
		Documents: map[layout.Kind]map[string]layout.Sources{},
		Problems:  []layout.Problem{{Path: "/repo/.agister/blocks.yaml", Err: err}},
	})
}
