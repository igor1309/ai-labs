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

	"github.com/igor1309/ai-labs/agister/runtime/bash"
	"github.com/igor1309/ai-labs/agister/runtime/claudecode"
	"github.com/igor1309/ai-labs/agister/runtime/codex"
	"github.com/igor1309/ai-labs/agister/runtime/pi"
	"github.com/igor1309/ai-labs/agister/settings/documents"
	"github.com/igor1309/ai-labs/agister/settings/layout"
	"github.com/igor1309/ai-labs/agister/settings/resolve"
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

// wrapperSpy is a spy of a runtime wrapper whose facts are F, its turns T
// and its results R: it gives the facts its test gives, keeps each turn it
// is asked to run, and answers by answer; with none, a turn fails the
// test. It is safe for concurrent use.
type wrapperSpy[F, T, R any] struct {
	t      *testing.T
	facts  F
	answer func(ctx context.Context, turn T) (R, error)
	mu     sync.Mutex
	turns  []T
}

func (s *wrapperSpy[F, T, R]) Facts() F { return s.facts }

func (s *wrapperSpy[F, T, R]) Run(ctx context.Context, turn T) (R, error) {
	s.mu.Lock()
	s.turns = append(s.turns, turn)
	s.mu.Unlock()
	if s.answer == nil {
		s.t.Errorf("asked to run %+v, want no turn run", turn)
		var none R
		return none, errors.New("no turn runs here")
	}
	return s.answer(ctx, turn)
}

func (s *wrapperSpy[F, T, R]) ran() []T {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.turns)
}

// reportingSpy is a spy of a runtime wrapper as wrapperSpy is, whose turns
// also take a report of its tool calls P: it gives each turn's report its
// test's tools, in order, before it answers.
type reportingSpy[F, T, P, R any] struct {
	wrapperSpy[F, T, R]
	tools []P
}

func (s *reportingSpy[F, T, P, R]) Run(ctx context.Context, turn T, report func(P)) (R, error) {
	for _, tool := range s.tools {
		report(tool)
	}
	return s.wrapperSpy.Run(ctx, turn)
}

// The spies of the bash, claude-code and codex wrappers.
type (
	bashWrapperSpy       = wrapperSpy[bash.Facts, bash.Turn, bash.Ended]
	claudeCodeWrapperSpy = reportingSpy[claudecode.Facts, claudecode.Turn, claudecode.Tool, claudecode.Result]
	codexWrapperSpy      = reportingSpy[codex.Facts, codex.Turn, codex.Tool, codex.Result]
)

// answers answers every turn with result.
func answers[T, R any](result R) func(context.Context, T) (R, error) {
	return func(context.Context, T) (R, error) { return result, nil }
}

// idleSupervisor is a wrapper's supervisor that runs nothing, its programs
// P and their ends E: a wrapper over it gives only its facts.
type idleSupervisor[P, E any] struct{}

func (idleSupervisor[P, E]) Run(context.Context, P) (E, error) {
	var none E
	return none, errors.New("nothing runs here")
}

// runtimesSpy is a spy of each runtime wrapper, each giving its wrapper's
// facts, as runtime/<name> gives them, and running no turn its test does
// not answer.
type runtimesSpy struct {
	bash   *bashWrapperSpy
	claude *claudeCodeWrapperSpy
	codex  *codexWrapperSpy
	pi     piSpy
}

func newRuntimesSpy(t *testing.T) *runtimesSpy {
	t.Helper()
	b, err := bash.New(idleSupervisor[bash.Program, bash.Ended]{})
	if err != nil {
		t.Fatal(err)
	}
	claude, err := claudecode.New(idleSupervisor[claudecode.Program, claudecode.Ended]{})
	if err != nil {
		t.Fatal(err)
	}
	cx, err := codex.New(idleSupervisor[codex.Program, codex.Ended]{}, "/t")
	if err != nil {
		t.Fatal(err)
	}
	return &runtimesSpy{
		bash:   &bashWrapperSpy{t: t, facts: b.Facts()},
		claude: &claudeCodeWrapperSpy{wrapperSpy: wrapperSpy[claudecode.Facts, claudecode.Turn, claudecode.Result]{t: t, facts: claude.Facts()}},
		codex:  &codexWrapperSpy{wrapperSpy: wrapperSpy[codex.Facts, codex.Turn, codex.Result]{t: t, facts: cx.Facts()}},
		pi:     piSpy{facts: pi.New().Facts()},
	}
}

// runtimes is the spies as build takes them.
func (s *runtimesSpy) runtimes() runtimes {
	return runtimes{bash: s.bash, claude: s.claude, codex: s.codex, pi: s.pi}
}

// idleHost is the machine for a command that runs nothing: a run that
// watches its signals fails the test.
func idleHost(t *testing.T) host {
	clock := clocktest.NewClock(time.Date(2026, 10, 16, 10, 0, 0, 0, time.UTC))
	return host{ctx: context.Background(), clock: clock, timer: clock.Timer,
		signals: func() (<-chan os.Signal, func()) {
			t.Error("a run watched the signals, want none run")
			return nil, func() {}
		}}
}

// endedContext is a context that has ended, cancelled: one an adapter
// passes on reaches its collaborator ended.
func endedContext() context.Context {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	return ctx
}

// sourcesSpy is a spy of what a run's inputs are read from: the files its
// test gives, by path, which exist, as do the paths it gives besides; the
// commit git names for each revision in its root, and the files changed
// for each "base..head" there; and gitErr, where its test gives one, as
// git's answer to everything. A file it does not hold is fs.ErrNotExist,
// a revision it does not name an error. It keeps what it is asked. It is
// safe for concurrent use.
type sourcesSpy struct {
	root    string
	files   map[string]string
	exist   []string
	commits map[string]string
	changed map[string][]string
	gitErr  error
	mu      sync.Mutex
	asked   []string
}

func (s *sourcesSpy) ask(what string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.asked = append(s.asked, what)
}

func (s *sourcesSpy) Bytes(path string) ([]byte, error) {
	s.ask("bytes " + path)
	text, ok := s.files[path]
	if !ok {
		return nil, &fs.PathError{Op: "open", Path: path, Err: fs.ErrNotExist}
	}
	return []byte(text), nil
}

func (s *sourcesSpy) Exists(path string) (bool, error) {
	s.ask("exists " + path)
	_, held := s.files[path]
	return held || slices.Contains(s.exist, path), nil
}

func (s *sourcesSpy) Commit(_ context.Context, dir, rev string) (string, error) {
	s.ask("commit " + rev + " in " + dir)
	commit, ok := s.commits[rev]
	switch {
	case s.gitErr != nil:
		return "", s.gitErr
	case dir != s.root || !ok:
		return "", errors.New("git spy: no commit " + rev + " in " + dir)
	}
	return commit, nil
}

func (s *sourcesSpy) Changed(_ context.Context, dir, base, head string) ([]string, error) {
	s.ask("changed " + base + ".." + head + " in " + dir)
	switch {
	case s.gitErr != nil:
		return nil, s.gitErr
	case dir != s.root:
		return nil, errors.New("git spy: no worktree " + dir)
	}
	return slices.Clone(s.changed[base+".."+head]), nil
}

// askedOf is what the spy was asked, in order.
func (s *sourcesSpy) askedOf() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.asked)
}

// sourcing is the spy as build takes it.
func (s *sourcesSpy) sourcing() sourcing {
	return sourcing{texts: s, paths: s, commits: s, changes: s}
}
