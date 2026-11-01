package layout_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agister/settings/layout"
)

// spyRoots gives root for every directory, "" for none, or fails with
// err. Asked are the directories asked about, in order.
type spyRoots struct {
	root  string
	err   error
	asked []string
}

func (s *spyRoots) Root(dir string) (string, error) {
	s.asked = append(s.asked, dir)
	return s.root, s.err
}

func find(t *testing.T, files *spyFiles, roots *spyRoots, launch string) layout.Snapshot {
	t.Helper()
	l, err := layout.New(files, roots)
	if err != nil {
		t.Fatal(err)
	}
	return l.Read(homeFolder, launch)
}

func assertLayers(t *testing.T, got layout.Snapshot, want layout.Folders) {
	t.Helper()
	if got.Layers != want {
		t.Errorf("layers\n got %+v\nwant %+v", got.Layers, want)
	}
}

func assertProblems(t *testing.T, got layout.Snapshot, want []layout.Problem) {
	t.Helper()
	if !reflect.DeepEqual(got.Problems, want) {
		t.Errorf("problems\n got %v\nwant %v", got.Problems, want)
	}
}

func TestOutsideAGitWorktreeOnlyHomeIsRead(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{
		homeFolder + "/processes/a.yaml":      "home",
		"/tmp/work/.agister/processes/b.yaml": "",
	}}
	roots := &spyRoots{}
	got := find(t, files, roots, "/tmp/work")
	assertLayers(t, got, layout.Folders{Home: homeFolder})
	want := layout.Sources{Home: &layout.Source{Path: homeFolder + "/processes/a.yaml", Bytes: []byte("home")}}
	if sources := got.Documents[layout.Process]["a"].Sources; !reflect.DeepEqual(sources, want) {
		t.Errorf("sources %+v, want %+v", sources, want)
	}
	if !reflect.DeepEqual(roots.asked, []string{"/tmp/work"}) {
		t.Errorf("asked the root of %q, want of the launch directory", roots.asked)
	}
	if _, read := got.Documents[layout.Process]["b"]; read {
		t.Error("read a .agister outside a git worktree")
	}
}

func TestTheRepositoryLayerIsAgisterAtTheWorktreeRoot(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{
		homeFolder + "/processes/a.yaml":  "",
		"/repo/.agister/processes/b.yaml": "timeout: 30m",
	}}
	got := find(t, files, &spyRoots{root: "/repo"}, "/repo")
	assertLayers(t, got, layout.Folders{Home: homeFolder, Repository: "/repo/.agister"})
	want := &layout.Source{Path: "/repo/.agister/processes/b.yaml", Bytes: []byte("timeout: 30m")}
	if source := got.Documents[layout.Process]["b"].Sources.Repository; !reflect.DeepEqual(source, want) {
		t.Errorf("repository source %+v, want %+v", source, want)
	}
	assertProblems(t, got, nil)
}

func TestAWorktreeRootWithNoAgisterHasNoRepositoryLayer(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{homeFolder + "/processes/a.yaml": ""}}
	got := find(t, files, &spyRoots{root: "/repo"}, "/repo/p")
	assertLayers(t, got, layout.Folders{Home: homeFolder})
	assertProblems(t, got, nil)
}

func TestTheProjectLayerIsTheNearestAgisterBelowTheRoot(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{
		homeFolder + "/processes/a.yaml":      "home",
		"/repo/.agister/processes/a.yaml":     "repository",
		"/repo/p/.agister/processes/a.yaml":   "farther",
		"/repo/p/q/.agister/processes/a.yaml": "project",
	}}
	got := find(t, files, &spyRoots{root: "/repo"}, "/repo/p/q")
	assertLayers(t, got, layout.Folders{Home: homeFolder, Repository: "/repo/.agister", Project: "/repo/p/q/.agister"})
	want := layout.Sources{
		Home:       &layout.Source{Path: homeFolder + "/processes/a.yaml", Bytes: []byte("home")},
		Repository: &layout.Source{Path: "/repo/.agister/processes/a.yaml", Bytes: []byte("repository")},
		Project:    &layout.Source{Path: "/repo/p/q/.agister/processes/a.yaml", Bytes: []byte("project")},
	}
	if sources := got.Documents[layout.Process]["a"].Sources; !reflect.DeepEqual(sources, want) {
		t.Errorf("sources\n got %+v\nwant %+v", sources, want)
	}
	assertProblems(t, got, nil)
}

func TestTheProjectLayerIsFoundUpwardFromTheLaunchDirectory(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{
		homeFolder + "/processes/a.yaml":    "",
		"/repo/p/.agister/processes/a.yaml": "",
		"/repo/p/q/notes.md":                "",
	}}
	got := find(t, files, &spyRoots{root: "/repo"}, "/repo/p/q")
	assertLayers(t, got, layout.Folders{Home: homeFolder, Project: "/repo/p/.agister"})
	assertProblems(t, got, nil)
}

func TestTheRootsAgisterIsTheRepositoryLayerNotTheProjects(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{
		homeFolder + "/processes/a.yaml":  "",
		"/repo/.agister/processes/a.yaml": "",
	}}
	got := find(t, files, &spyRoots{root: "/repo"}, "/repo/p")
	assertLayers(t, got, layout.Folders{Home: homeFolder, Repository: "/repo/.agister"})
}

func TestAnAgisterThatIsNotAFolderIsNoLayer(t *testing.T) {
	t.Parallel()
	files := &spyFiles{files: map[string]string{
		homeFolder + "/processes/a.yaml": "",
		"/repo/p/.agister":               "",
	}}
	got := find(t, files, &spyRoots{root: "/repo"}, "/repo/p")
	assertLayers(t, got, layout.Folders{Home: homeFolder})
	assertProblems(t, got, nil)
}

func TestAWorktreeRootThatCannotBeFoundIsAProblemOfNoLayer(t *testing.T) {
	t.Parallel()
	gitFails := errors.New("git failed")
	files := &spyFiles{files: map[string]string{
		homeFolder + "/processes/a.yaml":    "",
		"/repo/p/.agister/processes/b.yaml": "",
	}}
	got := find(t, files, &spyRoots{err: gitFails}, "/repo/p")
	assertLayers(t, got, layout.Folders{Home: homeFolder})
	assertProblems(t, got, []layout.Problem{{Path: "/repo/p", Err: gitFails}})
}

func TestADirectoryThatCannotBeListedOnTheWayUpIsAProblem(t *testing.T) {
	t.Parallel()
	denied := errors.New("permission denied")
	files := &spyFiles{
		files: map[string]string{
			homeFolder + "/processes/a.yaml":    "",
			"/repo/p/.agister/processes/a.yaml": "",
		},
		failing: map[string]error{"/repo/p": denied},
	}
	got := find(t, files, &spyRoots{root: "/repo"}, "/repo/p")
	assertLayers(t, got, layout.Folders{Home: homeFolder})
	assertProblems(t, got, []layout.Problem{{Path: "/repo/p", Err: denied}})
}
