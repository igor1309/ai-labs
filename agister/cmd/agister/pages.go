package main

import (
	"context"
	"errors"
	"io"
	"io/fs"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/igor1309/ai-labs/agister/pages"
	"github.com/igor1309/ai-labs/agister/runstore"
	group "github.com/igor1309/ai-labs/gokit/supervisor"
)

// pagesRuns answers pages' runs port from the run store, each run's state
// observed as agister status observes it.
type pagesRuns struct {
	store        statusStore
	now          func() time.Time
	probe        func(int) (string, bool, error)
	stalledAfter time.Duration
}

func newPagesRuns(store statusStore, now func() time.Time, probe func(int) (string, bool, error), stalledAfter time.Duration) (*pagesRuns, error) {
	if store == nil || now == nil || probe == nil || stalledAfter <= 0 {
		return nil, errors.New("pages: missing collaborator or threshold")
	}
	return &pagesRuns{store: store, now: now, probe: probe, stalledAfter: stalledAfter}, nil
}

func (p *pagesRuns) IDs() ([]string, error) { return p.store.Runs() }

func (p *pagesRuns) Run(id string) (pages.Run, error) {
	snapshot, err := p.store.Snapshot(id)
	if errors.Is(err, runstore.ErrNotStarted) {
		stamp, _, _ := strings.Cut(id, "-")
		started, _ := time.Parse("20060102T150405Z", stamp)
		snapshot = runstore.Snapshot{Record: runstore.Record{ID: id, Started: started}}
	} else if errors.Is(err, fs.ErrNotExist) {
		return pages.Run{}, pages.ErrNotFound
	} else if err != nil {
		return pages.Run{}, err
	}
	observed, err := runstore.Observe(snapshot, p.now(), p.stalledAfter, p.probe)
	if err != nil {
		return pages.Run{}, err
	}
	r := snapshot.Record
	run := pages.Run{ID: r.ID, Workflow: r.Request.Workflow, Process: r.Request.Process, Agent: r.Request.Agent,
		Started: r.Started, Ended: r.Ended, Status: observed.Status, Params: r.Request.Params, Dir: r.Request.Dir,
		Calls: []pages.Call{}, Children: []pages.Child{}}
	if res := r.Result; res != nil {
		run.Class, run.Reason = deref(res.Class), deref(res.Reason)
		if res.Timing.DurationMS > 0 {
			ms := res.Timing.DurationMS
			run.DurationMS = &ms
		}
		run.Cost = res.Cost
		if res.Output != nil {
			run.Output = res.Output
		}
	}
	for _, c := range r.Calls {
		run.Calls = append(run.Calls, pages.Call{Step: c.Step, Process: c.Process, Agent: c.Agent, Status: c.Result.Status,
			Class: deref(c.Result.Class), DurationMS: c.Result.Timing.DurationMS, Cost: c.Result.Cost})
	}
	for _, c := range r.Children {
		run.Children = append(run.Children, pages.Child{ID: c.ID, Workflow: c.Workflow, Status: c.Status, Class: deref(c.Class)})
	}
	return run, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// runPages is agister pages over home's runs, stopped by SIGINT or SIGTERM,
// the page opened with macOS's open.
func runPages(ctx context.Context, user string, args []string, stdout, stderr io.Writer) int {
	ctx, stop := signalContext(ctx)
	defer stop()
	store, err := runstore.New(filepath.Join(homeFolder(user, os.Environ()), "runs"))
	if err != nil {
		io.WriteString(stderr, "agister pages: "+err.Error()+"\n")
		return 1
	}
	probe, err := newProcessProbe(syscall.Kill, group.Token)
	if err != nil {
		io.WriteString(stderr, "agister pages: "+err.Error()+"\n")
		return 1
	}
	runs, err := newPagesRuns(store, time.Now, probe, 10*time.Second)
	if err != nil {
		io.WriteString(stderr, "agister pages: "+err.Error()+"\n")
		return 1
	}
	return pages.Main(ctx, args, pages.Env{Stdout: stdout, Stderr: stderr, Runs: runs, Listen: net.Listen,
		Open: func(url string) error { return exec.Command("open", url).Start() }})
}

// signalContext is ctx ended by SIGINT or SIGTERM, as launchd stops it.
func signalContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
}
