package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/examples"
	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// marker is a definitions source told apart from every other by identity,
// and counting what is asked of it. It serves the shipped examples, so the
// use cases that read it get valid settings.
type marker struct {
	name string

	mu    sync.Mutex
	reads map[definition.Kind]int
	lists map[definition.Kind]int
}

func newMarker(name string) *marker {
	return &marker{name: name, reads: map[definition.Kind]int{}, lists: map[definition.Kind]int{}}
}

func (m *marker) Read(_ context.Context, kind definition.Kind, name string) (definition.Document, error) {
	m.mu.Lock()
	m.reads[kind]++
	m.mu.Unlock()
	pattern := string(kind) + "/" + name + ".*"
	if kind == definition.KindService {
		pattern = "service.*"
	}
	matches, _ := fs.Glob(examples.Settings(), pattern)
	if len(matches) != 1 {
		return definition.Document{}, fmt.Errorf("%s has no %s %q", m.name, kind, name)
	}
	data, err := fs.ReadFile(examples.Settings(), matches[0])
	sum := sha256.Sum256(data)
	return definition.Document{
		Source: definition.Source{Kind: kind, Name: name, Path: m.name + "/" + matches[0], SHA256: hex.EncodeToString(sum[:])},
		Bytes:  data,
	}, err
}

func (m *marker) List(_ context.Context, kind definition.Kind) ([]string, error) {
	m.mu.Lock()
	m.lists[kind]++
	m.mu.Unlock()
	entries, _ := fs.ReadDir(examples.Settings(), string(kind))
	var names []string
	for _, entry := range entries {
		names = append(names, strings.TrimSuffix(entry.Name(), path.Ext(entry.Name())))
	}
	return names, nil
}

// asked is how often the source was asked to list or read anything.
func (m *marker) asked() (lists, reads int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, n := range m.lists {
		lists += n
	}
	for _, n := range m.reads {
		reads += n
	}
	return lists, reads
}

// Every use case of the client the gate builds reads only the sources it
// was given: the layered one everywhere, the global-only one for the global
// write scope. Wiring any of them to the live settings would defeat the
// snapshot. Each is exercised by name, and what it asked of each source is
// asserted: a use case or scope added later needs its own row here.
func TestBuiltClientReadsOnlyTheSourcesGiven(t *testing.T) {
	project := repository(t, "x")
	if err := os.MkdirAll(filepath.Join(project, ".agister"), 0o755); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for name, tc := range map[string]struct {
		cwd     string
		project bool // a project settings layer, so a second write scope
	}{
		"global only": {cwd: ""},
		"in project":  {cwd: project, project: true},
	} {
		t.Run(name, func(t *testing.T) {
			home := t.TempDir()
			gated, background, err := wire(cli.Config{Home: home, Cwd: tc.cwd})
			if err != nil {
				t.Fatal(err)
			}
			// Each use case on a client of its own, so what one asked of a
			// source is not taken for another's.
			use := map[string]func(contract.Client) error{
				"settings": func(c contract.Client) error { _, err := c.ListAgents(ctx); return err },
				"check":    func(c contract.Client) error { _, err := c.Check(ctx, false); return err },
				"inspection": func(c contract.Client) error {
					_, err := c.ShowProcess(ctx, "ask", "")
					return err
				},
				// Refused after its settings were read: no such process.
				"calls": func(c contract.Client) error {
					id, err := c.Submit(ctx, contract.CallRequest{Process: "missing", Cwd: home})
					if err != nil {
						return err
					}
					store := fsruns.Store{Dir: filepath.Join(home, "runs")}
					eventually(t, "the submitted call to finish", func() bool {
						_, state, err := store.Get(ctx, id)
						return err == nil && state == domain.StateFinished
					})
					return nil
				},
			}
			for use, call := range use {
				layered, global := newMarker("layered"), newMarker("global")
				decorated, ok := gated.Build(layered, global).(app.ReapOnSubmit)
				if !ok {
					t.Fatalf("the built client is not %T", app.ReapOnSubmit{})
				}
				if err := call(decorated.Client); err != nil {
					t.Fatalf("%s: %v", use, err)
				}
				background.Wait()
				if lists, reads := layered.asked(); lists+reads == 0 {
					t.Errorf("%s did not read the layered source given", use)
				}
				if lists, reads := global.asked(); lists+reads != 0 {
					t.Errorf("%s read the global-only source: %d lists, %d reads", use, lists, reads)
				}
			}

			// A write must keep settings valid in every scope: the global
			// settings alone, and with the project in view. Only scopes list
			// every kind; the write itself reads a runtime.
			layered, global := newMarker("layered"), newMarker("global")
			decorated := gated.Build(layered, global).(app.ReapOnSubmit)
			agent := contract.Agent{Name: "probe", Runtime: "claude-code"}
			if _, err := decorated.Client.CreateAgent(ctx, agent, false, nil); err != nil {
				t.Fatal(err)
			}
			if global.lists[definition.KindAgent] == 0 {
				t.Error("the global write scope did not check the global-only source")
			}
			if got := layered.lists[definition.KindAgent] > 0; got != tc.project {
				t.Errorf("the project write scope checks the layered source = %v, want %v", got, tc.project)
			}
		})
	}
}

// The built client starts the one background reaper every build shares,
// over the run store, the supervisor's processes and the git workspaces.
func TestBuiltClientSharesTheBackgroundReaper(t *testing.T) {
	home := t.TempDir()
	gated, background, err := wire(cli.Config{Home: home})
	if err != nil {
		t.Fatal(err)
	}
	for _, build := range []int{1, 2} {
		decorated, ok := gated.Build(newMarker("layered"), newMarker("global")).(app.ReapOnSubmit)
		if !ok || decorated.Background != background {
			t.Fatalf("build %d does not start the shared reaper: %+v", build, decorated)
		}
	}
	if _, ok := background.Reaper.(*app.Reaper); !ok {
		t.Fatalf("the background reaper runs a %T", background.Reaper)
	}
}

// errorsOf lists the step failures a recorded reap says, as read back from
// the run's events.
func errorsOf(reaped map[string]any) []string {
	var failures []string
	list, _ := reaped["errors"].([]any)
	for _, item := range list {
		text, _ := item.(string)
		failures = append(failures, text)
	}
	return failures
}

// Submitting a call on the built client reaps the runs a killed process
// abandoned: here one that recorded a checkout and whose owner is gone.
func TestBuiltClientReapsAbandonedRunsWhenACallIsSubmitted(t *testing.T) {
	home := t.TempDir()
	gated, background, err := wire(cli.Config{Home: home})
	if err != nil {
		t.Fatal(err)
	}
	// An unfinished run nobody holds the owner lock of.
	dir := filepath.Join(home, "runs", "old")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	record := domain.Record{
		Schema: domain.RecordSchema, ID: "old", Process: "p", CreatedAt: time.Now(),
		Effects: &domain.Effects{
			Checkout: &domain.Checkout{Repository: "/repo", Dir: filepath.Join(t.TempDir(), "workspace")},
			Process:  &domain.Process{Ref: "not-a-reference"},
		},
	}
	data, _ := json.Marshal(record)
	if err := os.WriteFile(filepath.Join(dir, "record.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner.lock"), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	client := gated.Build(newMarker("layered"), newMarker("global"))
	id, err := client.Submit(context.Background(), contract.CallRequest{Process: "p", Cwd: home})
	if err != nil {
		t.Fatal(err)
	}
	background.Wait()

	store := fsruns.Store{Dir: filepath.Join(home, "runs")}
	got, state, err := store.Get(context.Background(), "old")
	if err != nil || state != domain.StateFinished || got.Result == nil || got.Result.Status != domain.Lost {
		t.Fatalf("old run: %+v, %s, %v", got.Result, state, err)
	}
	// Its effects were handed to the supervisor's processes and to the git
	// workspaces, which refuse what they did not make; the reap said so.
	events, _, err := store.Events(context.Background(), "old", 0)
	if err != nil {
		t.Fatal(err)
	}
	var reaped map[string]any
	for _, event := range events {
		if event.Kind == "EFFECTS_REAPED" {
			reaped = event.Data
		}
	}
	process, _ := reaped["process"].(map[string]any)
	checkout, _ := reaped["checkout"].(map[string]any)
	if process["outcome"] != "left" || checkout["removed"] != false || !strings.Contains(fmt.Sprint(reaped["errors"]), "is not a checkout Agister made") {
		t.Fatalf("reap of the old run recorded %v", reaped)
	}
	// The supervisor's processes understand the references they made: this
	// one they did not, and say so as ParseRef does.
	_, _, parseErr := supervisor.ParseRef("not-a-reference")
	if parseErr == nil {
		t.Fatal("the supervisor understands the reference the test means it to refuse")
	}
	if want := fmt.Sprintf("process %q: %v", "not-a-reference", parseErr); !slices.Contains(errorsOf(reaped), want) {
		t.Fatalf("reap of the old run recorded errors %q, want %q among them", errorsOf(reaped), want)
	}
	// The call that triggered it is its own run, and finishes on its own.
	eventually(t, "the submitted call to finish", func() bool {
		_, state, err := store.Get(context.Background(), id)
		return err == nil && state == domain.StateFinished
	})
}

// The built reaper asks the run store which checkouts runs some process
// still owns use: an abandoned run's checkout that such a run also uses is
// left in place, not discarded from under it.
func TestBuiltReaperLeavesACheckoutARunningRunUses(t *testing.T) {
	home := t.TempDir()
	_, background, err := wire(cli.Config{Home: home})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	store := fsruns.Store{Dir: filepath.Join(home, "runs")}
	shared := &domain.Checkout{Repository: "/repo", Dir: filepath.Join(t.TempDir(), "workspace")}
	// An unfinished run this test owns, as a running process would.
	owned, err := store.Create(ctx, domain.Record{
		Schema: domain.RecordSchema, ID: "running", Process: "p", CreatedAt: time.Now(),
		Effects: &domain.Effects{Checkout: shared},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer owned.Finish(domain.Record{Schema: domain.RecordSchema, ID: "running", Process: "p", CreatedAt: time.Now(), FinishedAt: new(time.Time)})
	// An unfinished run nobody owns, over the same checkout.
	dir := filepath.Join(home, "runs", "old")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	data, _ := json.Marshal(domain.Record{
		Schema: domain.RecordSchema, ID: "old", Process: "p", CreatedAt: time.Now(),
		Effects: &domain.Effects{Checkout: shared},
	})
	if err := os.WriteFile(filepath.Join(dir, "record.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner.lock"), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	background.Start(ctx)
	background.Wait()

	events, _, err := store.Events(ctx, "old", 0)
	if err != nil {
		t.Fatal(err)
	}
	var reaped map[string]any
	for _, event := range events {
		if event.Kind == "EFFECTS_REAPED" {
			reaped = event.Data
		}
	}
	checkout, _ := reaped["checkout"].(map[string]any)
	if checkout["removed"] != false || checkout["skipped"] != "a running run uses it" {
		t.Fatalf("reap of the old run recorded %v", reaped)
	}
}

// A reap that fails is logged: nobody waits for it, and no run record says
// so. Here the run store cannot be listed.
func TestBuiltReaperLogsAFailedReap(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, "runs"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	_, background, err := wire(cli.Config{Home: home})
	if err != nil {
		t.Fatal(err)
	}
	background.Start(context.Background())
	background.Wait()

	data, err := os.ReadFile(filepath.Join(home, "logs", "agister.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	var logged []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("log line %q: %v", line, err)
		}
		if entry["msg"] == "reaping abandoned runs failed" {
			logged = append(logged, entry)
		}
	}
	if len(logged) != 1 {
		t.Fatalf("reap failures logged = %d in:\n%s", len(logged), data)
	}
	message, _ := logged[0]["error"].(string)
	if logged[0]["level"] != "ERROR" || !strings.Contains(message, "listing abandoned runs") || !strings.Contains(message, "not a directory") {
		t.Fatalf("logged = %v", logged[0])
	}
}
