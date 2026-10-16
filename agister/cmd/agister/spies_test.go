package main

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/agister/settings/layout"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
	"github.com/igor1309/ai-labs/agister/supervisor"
	"github.com/igor1309/ai-labs/gokit/clocktest"
)

// typed is what documents gives for one document: its definition, or its
// problems.
type typed[T any] struct {
	value    T
	problems []documents.Problem
}

// documentsSpy is a spy of the source's documents: it gives the documents
// and the blocks its test gives, and nothing else. A document it is asked
// for that its test does not answer fails the test.
type documentsSpy struct {
	t             *testing.T
	workflows     map[string]typed[documents.WorkflowDefinition]
	processes     map[string]typed[documents.ProcessDefinition]
	agents        map[string]typed[documents.AgentDefinition]
	runtimes      map[string]typed[documents.RuntimeDefinition]
	briefs        map[string]typed[documents.BriefDefinition]
	blobs         map[documents.Kind]map[string][]documents.Problem
	blocks        []documents.Field[documents.Block]
	blockProblems []documents.Problem
}

func newDocumentsSpy(t *testing.T) *documentsSpy {
	return &documentsSpy{t: t,
		workflows: map[string]typed[documents.WorkflowDefinition]{},
		processes: map[string]typed[documents.ProcessDefinition]{},
		agents:    map[string]typed[documents.AgentDefinition]{},
		runtimes:  map[string]typed[documents.RuntimeDefinition]{},
		briefs:    map[string]typed[documents.BriefDefinition]{},
		blobs:     map[documents.Kind]map[string][]documents.Problem{},
	}
}

// answer is the answer of named for name, failing t where its test gives
// none.
func answer[T any](t *testing.T, named map[string]typed[T], kind documents.Kind, name string) (T, []documents.Problem) {
	a, ok := named[name]
	if !ok {
		t.Errorf("documents asked for the %s %q, which the test does not answer", kind, name)
	}
	return a.value, slices.Clone(a.problems)
}

func (s *documentsSpy) Workflow(name string) (documents.WorkflowDefinition, []documents.Problem) {
	return answer(s.t, s.workflows, documents.Workflow, name)
}

func (s *documentsSpy) Process(name string) (documents.ProcessDefinition, []documents.Problem) {
	return answer(s.t, s.processes, documents.Process, name)
}

func (s *documentsSpy) Agent(name string) (documents.AgentDefinition, []documents.Problem) {
	return answer(s.t, s.agents, documents.Agent, name)
}

func (s *documentsSpy) Runtime(name string) (documents.RuntimeDefinition, []documents.Problem) {
	return answer(s.t, s.runtimes, documents.Runtime, name)
}

func (s *documentsSpy) Brief(name string) (documents.BriefDefinition, []documents.Problem) {
	return answer(s.t, s.briefs, documents.Brief, name)
}

func (s *documentsSpy) Blob(kind documents.Kind, name string) (documents.Blob, []documents.Problem) {
	problems, ok := s.blobs[kind][name]
	if !ok {
		s.t.Errorf("documents asked for the %s %q, which the test does not answer", kind, name)
	}
	return documents.Blob{}, slices.Clone(problems)
}

func (s *documentsSpy) Blocks() ([]documents.Field[documents.Block], []documents.Problem) {
	return slices.Clone(s.blocks), slices.Clone(s.blockProblems)
}

// sourceOf is the source over spy and the layout snapshot, failing t
// where it cannot be built.
func sourceOf(t *testing.T, spy *documentsSpy, snapshot layout.Snapshot) *source {
	t.Helper()
	s, err := newSource(spy, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

// filesystemSpy is a spy of layout's filesystem: the files its test gives,
// by path, and the folders that hold them. It counts each file's reads.
// It is safe for concurrent use.
type filesystemSpy struct {
	files map[string][]byte
	mu    sync.Mutex
	reads map[string]int
}

func newFilesystemSpy(files map[string]string) *filesystemSpy {
	s := &filesystemSpy{files: map[string][]byte{}, reads: map[string]int{}}
	for name, content := range files {
		s.files[name] = []byte(content)
	}
	return s
}

func (s *filesystemSpy) Entries(folder string) ([]layout.Entry, error) {
	kinds := map[string]layout.EntryKind{}
	for name := range s.files {
		rest, inside := strings.CutPrefix(name, folder+"/")
		if !inside {
			continue
		}
		first, deeper, _ := strings.Cut(rest, "/")
		kinds[first] = layout.RegularFile
		if deeper != "" {
			kinds[first] = layout.Folder
		}
	}
	if len(kinds) == 0 {
		return nil, &fs.PathError{Op: "readdir", Path: folder, Err: fs.ErrNotExist}
	}
	var entries []layout.Entry
	for name, kind := range kinds {
		entries = append(entries, layout.Entry{Name: name, Kind: kind})
	}
	slices.SortFunc(entries, func(a, b layout.Entry) int { return strings.Compare(a.Name, b.Name) })
	return entries, nil
}

func (s *filesystemSpy) Bytes(file string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.reads[file]++
	content, ok := s.files[file]
	if !ok {
		return nil, &fs.PathError{Op: "open", Path: file, Err: fs.ErrNotExist}
	}
	return slices.Clone(content), nil
}

// readsOf is how many times each file was read, by path.
func (s *filesystemSpy) readsOf() map[string]int {
	s.mu.Lock()
	defer s.mu.Unlock()
	reads := map[string]int{}
	for name, n := range s.reads {
		reads[name] = n
	}
	return reads
}

// rootSpy is a spy of layout's worktree root: root is the root of itself
// and every directory below it, and no other directory has one. As git
// does, it gives a directory reached through one of links the root of
// where the link leads.
type rootSpy struct {
	root  string
	links map[string]string
}

func (s rootSpy) Root(dir string) (string, error) {
	dir = throughLinks(s.links, dir)
	if dir == s.root || strings.HasPrefix(dir, s.root+"/") {
		return s.root, nil
	}
	return "", nil
}

// linksSpy is a spy of the command line's links: each link its test gives
// leads where the test says, and so does every directory below it; a
// directory its test gives as missing does not exist; any other is its
// own path. It keeps the directories asked.
type linksSpy struct {
	links   map[string]string
	missing []string
	mu      sync.Mutex
	asked   []string
}

func (s *linksSpy) Resolved(folder string) (string, error) {
	s.mu.Lock()
	s.asked = append(s.asked, folder)
	s.mu.Unlock()
	if slices.Contains(s.missing, folder) {
		return "", &fs.PathError{Op: "lstat", Path: folder, Err: fs.ErrNotExist}
	}
	return throughLinks(s.links, folder), nil
}

// throughLinks is dir with each of links replaced by where it leads: a
// link, or a directory below it.
func throughLinks(links map[string]string, dir string) string {
	for link, to := range links {
		if dir == link {
			return to
		}
		if rest, below := strings.CutPrefix(dir, link+"/"); below {
			return to + "/" + rest
		}
	}
	return dir
}

// askedOf is the directories asked, in order.
func (s *linksSpy) askedOf() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.asked)
}

// wrappersSpy is a spy of resolve's wrappers: the facts its test gives,
// by contract.
type wrappersSpy map[string]resolve.Facts

func (s wrappersSpy) Facts(contract string) (resolve.Facts, bool) {
	facts, ok := s[contract]
	facts.Efforts = slices.Clone(facts.Efforts)
	return facts, ok
}

// gitSpy is a spy of git's worktree root: the root and the error its test
// gives, whatever the directory. It keeps the directories asked.
type gitSpy struct {
	root string
	err  error
	ctx  context.Context
	dirs []string
}

func (s *gitSpy) Root(ctx context.Context, dir string) (string, error) {
	if ctx != s.ctx {
		return "", errors.New("git spy: asked within another context than the adapter's")
	}
	s.dirs = append(s.dirs, dir)
	return s.root, s.err
}

// programsSpy answers in place of the supervisor for a command that runs
// no program: a program it is asked to run fails the test.
type programsSpy struct{ t *testing.T }

func (s programsSpy) Run(_ context.Context, program supervisor.Program) (supervisor.Result, error) {
	s.t.Errorf("asked to run %q, want no program run", program.Name)
	return supervisor.Result{}, errors.New("no program runs here")
}

// idleHost is the machine for a command that runs nothing: a run that
// watches its signals fails the test.
func idleHost(t *testing.T) host {
	clock := clocktest.NewClock(time.Date(2026, 10, 16, 10, 0, 0, 0, time.UTC))
	return host{ctx: context.Background(), clock: clock, timer: clock.Timer, temp: "/t",
		signals: func() (<-chan os.Signal, func()) {
			t.Error("a run watched the signals, want none run")
			return nil, func() {}
		}}
}
