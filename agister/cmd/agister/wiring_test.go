package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
	"github.com/igor1309/ai-labs/agister/internal/adapters/git"
	"github.com/igor1309/ai-labs/agister/internal/adapters/runtime/supervisor"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/contract"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	domain "github.com/igor1309/ai-labs/agister/internal/domain/run"
)

// marker is a definitions source told apart from every other by identity.
type marker struct{ name string }

func (*marker) Read(context.Context, definition.Kind, string) (definition.Document, error) {
	return definition.Document{}, nil
}
func (*marker) List(context.Context, definition.Kind) ([]string, error) { return nil, nil }

// Every use case of the client the gate builds reads only the sources it
// was given: the layered one everywhere, the global-only one for the global
// write scope. Wiring any of them to the live settings would defeat the
// snapshot. Each definitions dependency is asserted by name: a use case or
// scope added later needs its own assertion here.
func TestBuiltClientReadsOnlyTheSourcesGiven(t *testing.T) {
	project := repository(t, "x")
	if err := os.MkdirAll(filepath.Join(project, ".agister"), 0o755); err != nil {
		t.Fatal(err)
	}
	for name, tc := range map[string]struct {
		cwd     string
		project bool // a project settings layer, so a second write scope
	}{
		"global only": {cwd: ""},
		"in project":  {cwd: project, project: true},
	} {
		t.Run(name, func(t *testing.T) {
			gated, err := newGated(cli.Config{Home: t.TempDir(), Cwd: tc.cwd})
			if err != nil {
				t.Fatal(err)
			}
			layered, global := &marker{"layered"}, &marker{"global"}
			decorated, ok := gated.Build(layered, global).(app.ReapOnSubmit)
			if !ok {
				t.Fatalf("the built client is not %T", app.ReapOnSubmit{})
			}
			host, ok := decorated.Client.(*app.Host)
			if !ok {
				t.Fatalf("the decorated client is a %T, not a host", decorated.Client)
			}

			source := func(what string, got app.DefinitionSource, want *marker) {
				t.Helper()
				if got != app.DefinitionSource(want) {
					t.Errorf("%s reads %v, not the %s source given", what, got, want.name)
				}
			}
			source("settings", host.Settings.Definitions, layered)
			source("check", host.Checker.Definitions, layered)
			source("inspection", host.Inspection.Definitions, layered)
			source("calls", host.Calls.Definitions, layered)

			scopes := host.Settings.Scopes
			wantScopes := 1
			if tc.project {
				wantScopes = 2
			}
			if len(scopes) != wantScopes {
				t.Fatalf("write scopes = %d, want %d", len(scopes), wantScopes)
			}
			scopeChecker := func(scope app.Scope) *app.Checker {
				t.Helper()
				checker, ok := scope.Check.(*app.Checker)
				if !ok {
					t.Fatalf("scope %q is checked by a %T", scope.Name, scope.Check)
				}
				return checker
			}
			source("the global write scope", scopeChecker(scopes[0]).Definitions, global)
			if tc.project {
				source("the project write scope", scopeChecker(scopes[1]).Definitions, layered)
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
		decorated, ok := gated.Build(&marker{"layered"}, &marker{"global"}).(app.ReapOnSubmit)
		if !ok || decorated.Background != background {
			t.Fatalf("build %d does not start the shared reaper: %+v", build, decorated)
		}
	}
	reaper, ok := background.Reaper.(*app.Reaper)
	if !ok {
		t.Fatalf("the background reaper runs a %T", background.Reaper)
	}
	if reaper.Adopter != app.RunAdopter(fsruns.Store{Dir: filepath.Join(home, "runs")}) ||
		reaper.Processes != app.Processes(supervisor.Processes{}) ||
		reaper.Workspaces != app.Workspaces(git.Workspaces{}) ||
		reaper.Clock == nil {
		t.Fatalf("reaper = %+v", reaper)
	}
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
		Effects: &domain.Effects{Checkout: &domain.Checkout{Repository: "/repo", Dir: filepath.Join(t.TempDir(), "workspace")}},
	}
	data, _ := json.Marshal(record)
	if err := os.WriteFile(filepath.Join(dir, "record.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "owner.lock"), nil, 0o600); err != nil {
		t.Fatal(err)
	}

	client := gated.Build(&marker{"layered"}, &marker{"global"})
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
	// The call that triggered it is its own run, and finishes on its own.
	eventually(t, "the submitted call to finish", func() bool {
		_, state, err := store.Get(context.Background(), id)
		return err == nil && state == domain.StateFinished
	})
}
