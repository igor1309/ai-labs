package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/igor1309/ai-labs/gokit/supervisor"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
)

// A run keeps none of its runtime's output, so a test that asks what a
// fake runtime was started with reads it where the test itself stands: at
// the starter its composition starts the runtimes through. The fakes write
// their argv, cwd and prompt as the first line of their stdout; echoing
// keeps that line by the process's group, which the run's PROCESS_STARTED
// event names (pid).

// echoes are the first stdout lines of the processes started over one
// home, by process group.
type echoes struct {
	mu    sync.Mutex
	lines map[int]string
}

func (e *echoes) keep(group int, line string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.lines == nil {
		e.lines = map[int]string{}
	}
	e.lines[group] = line
}

func (e *echoes) of(group int) (string, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	line, ok := e.lines[group]
	return line, ok
}

// homes holds, by home, what the compositions over it share in a test: the
// echoes of their runtimes, and the numbering of their process groups, so
// a group names one process of the home, whichever composition started it.
var homes sync.Map

type shared struct {
	echoes echoes
	groups *supervisortest.Groups
}

func sharedOf(home string) *shared {
	s, _ := homes.LoadOrStore(home, &shared{groups: supervisortest.NewGroups()})
	return s.(*shared)
}

// echoing starts through Starter and keeps each process's first stdout
// line in echoes.
type echoing struct {
	supervisor.Starter
	echoes *echoes
}

func (s echoing) Start(command supervisor.Command) (supervisor.Process, error) {
	process, err := s.Starter.Start(command)
	if err != nil {
		return nil, err
	}
	group := process.Group()
	return &echoed{Process: process, stdout: &firstLine{ReadCloser: process.Stdout(), keep: func(line string) { s.echoes.keep(group, line) }}}, nil
}

type echoed struct {
	supervisor.Process
	stdout io.ReadCloser
}

func (p *echoed) Stdout() io.ReadCloser { return p.stdout }

// firstLine passes what it reads on, and gives keep the first line of it
// once that line has ended.
type firstLine struct {
	io.ReadCloser
	keep func(string)
	head []byte
	kept bool
}

func (f *firstLine) Read(p []byte) (int, error) {
	n, err := f.ReadCloser.Read(p)
	if !f.kept {
		f.head = append(f.head, p[:n]...)
		if end := bytes.IndexByte(f.head, '\n'); end >= 0 {
			f.keep(string(f.head[:end]))
			f.kept, f.head = true, nil
		}
	}
	return n, err
}

// processesStarted are the processes the run in dir started, as its
// PROCESS_STARTED events tell them: each one's pid, command and args.
func processesStarted(dir string) []map[string]any {
	data, _ := os.ReadFile(filepath.Join(dir, "events.jsonl"))
	var started []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		var event struct {
			Kind string
			Data map[string]any
		}
		if json.Unmarshal([]byte(line), &event) == nil && event.Kind == "PROCESS_STARTED" {
			started = append(started, event.Data)
		}
	}
	return started
}

// runtimeEcho is the first stdout line of the first process the run in
// dir, <home>/runs/<id>, started: a fake runtime's echo. It is empty for a
// run that started none.
func runtimeEcho(dir string) string {
	started := processesStarted(dir)
	if len(started) == 0 {
		return ""
	}
	pid, _ := started[0]["pid"].(float64)
	line, _ := sharedOf(filepath.Dir(filepath.Dir(dir))).echoes.of(int(pid))
	return line
}
