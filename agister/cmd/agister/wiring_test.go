package main

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/cli"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
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
			definitionsHeld(reflect.ValueOf(gated.Build(layered, global)), "", map[uintptr]bool{}, held)

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
