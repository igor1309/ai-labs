package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsruns"
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

// definitionsHeld maps the path of every definitions source held anywhere
// under v (through pointers, interfaces, structs and slices) to that source.
func definitionsHeld(v reflect.Value, path string, seen map[uintptr]bool, out map[string]any) {
	sourceType := reflect.TypeOf((*app.DefinitionSource)(nil)).Elem()
	if v.Type() == sourceType {
		if !v.IsNil() {
			out[path] = v.Elem().Pointer()
		}
		return
	}
	switch v.Kind() {
	case reflect.Interface:
		if !v.IsNil() {
			definitionsHeld(v.Elem(), path, seen, out)
		}
	case reflect.Pointer:
		if v.IsNil() || seen[v.Pointer()] {
			return
		}
		seen[v.Pointer()] = true
		definitionsHeld(v.Elem(), path, seen, out)
	case reflect.Struct:
		for i := 0; i < v.NumField(); i++ {
			definitionsHeld(v.Field(i), path+"."+v.Type().Field(i).Name, seen, out)
		}
	case reflect.Slice, reflect.Array:
		for i := 0; i < v.Len(); i++ {
			definitionsHeld(v.Index(i), path+"["+string(rune('0'+i))+"]", seen, out)
		}
	}
}

// Every use case of the client the gate builds reads only the sources it
// was given: the layered one everywhere, the global-only one for the global
// write scope. Wiring any of them to the live settings would defeat the
// snapshot.
func TestBuiltClientReadsOnlyTheSourcesGiven(t *testing.T) {
	project := repository(t, "x")
	if err := os.MkdirAll(filepath.Join(project, ".agister"), 0o755); err != nil {
		t.Fatal(err)
	}
	for name, tc := range map[string]struct {
		cwd    string
		scopes []string
	}{
		"global only": {cwd: "", scopes: []string{".Settings.Scopes[0].Check.Definitions"}},
		"in project":  {cwd: project, scopes: []string{".Settings.Scopes[0].Check.Definitions", ".Settings.Scopes[1].Check.Definitions"}},
	} {
		t.Run(name, func(t *testing.T) {
			gated, err := newGated(cli.Config{Home: t.TempDir(), Cwd: tc.cwd})
			if err != nil {
				t.Fatal(err)
			}
			layered, global := &marker{"layered"}, &marker{"global"}
			held := map[string]any{}
			built, ok := gated.Build(layered, global).(app.ReapOnSubmit)
			if !ok {
				t.Fatalf("the built client is not decorated to reap on submit")
			}
			definitionsHeld(reflect.ValueOf(built.Client), "", map[uintptr]bool{}, held)

			want := map[string]*marker{
				".Settings.Definitions":   layered,
				".Checker.Definitions":    layered,
				".Inspection.Definitions": layered,
				".Calls.Definitions":      layered,
			}
			want[tc.scopes[0]] = global
			if len(tc.scopes) > 1 {
				want[tc.scopes[1]] = layered
			}
			var paths []string
			for path := range held {
				paths = append(paths, path)
			}
			sort.Strings(paths)
			for path, source := range want {
				if held[path] != reflect.ValueOf(source).Pointer() {
					t.Errorf("%s is not the %s source given (held: %v)", path, source.name, paths)
				}
			}
			for _, path := range paths {
				if _, ok := want[path]; !ok {
					t.Errorf("unexpected definitions source at %s", path)
				}
			}
		})
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
