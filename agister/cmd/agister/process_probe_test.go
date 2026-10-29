package main

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/cli"
	"github.com/igor1309/ai-labs/agister/runstore"
)

func TestProcessProbeMapsOwnerEvidenceIntoStatus(t *testing.T) {
	t.Parallel()
	failure := errors.New("probe failed")
	for _, c := range []struct {
		name      string
		kills     []error
		token     string
		tokenErr  error
		want      string
		wantErr   error
		wantToken bool
	}{
		{name: "gone", kills: []error{fmt.Errorf("kill: %w", syscall.ESRCH)}, want: "lost"},
		{name: "another owner", kills: []error{fmt.Errorf("kill: %w", syscall.EPERM)}, want: "lost"},
		{name: "reused pid", kills: []error{nil}, token: "another start", want: "lost", wantToken: true},
		{name: "same owner", kills: []error{nil}, token: "start", want: "running", wantToken: true},
		{name: "gone during token read", kills: []error{nil, syscall.ESRCH}, tokenErr: failure, want: "lost", wantToken: true},
		{name: "another owner during token read", kills: []error{nil, syscall.EPERM}, tokenErr: failure, want: "lost", wantToken: true},
		{name: "kill error", kills: []error{failure}, wantErr: failure},
		{name: "token error", kills: []error{nil, nil}, tokenErr: failure, wantErr: failure, wantToken: true},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			kills, tokens := 0, 0
			probe, err := newProcessProbe(func(pid int, signal syscall.Signal) error {
				if pid != 42 || signal != 0 || kills >= len(c.kills) {
					t.Fatalf("unexpected kill(%d, %d), call %d", pid, signal, kills)
				}
				err := c.kills[kills]
				kills++
				return err
			}, func(_ context.Context, pid int) (string, error) {
				if pid != 42 || !c.wantToken {
					t.Fatalf("unexpected token(%d)", pid)
				}
				tokens++
				return c.token, c.tokenErr
			})
			if err != nil {
				t.Fatal(err)
			}
			at := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
			store := statusStoreSpy{ids: []string{"old", "live"}, snapshots: map[string]runstore.Snapshot{
				"old":  {Record: runstore.Record{ID: "old", Started: at.Add(-time.Hour), Ended: &at, Status: "completed"}},
				"live": {Record: runstore.Record{ID: "live", Started: at, Status: "running"}, Heartbeat: &runstore.Heartbeat{PID: 42, ProcessStart: "start", Beat: at}},
			}}
			states, err := newRunStates(store, func() time.Time { return at }, probe, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			got, err := states.States("", false)
			if !errors.Is(err, c.wantErr) {
				t.Fatalf("states %+v, error %v, want %v", got, err, c.wantErr)
			}
			if c.wantErr == nil {
				want := []cli.RunState{
					{ID: "live", Status: c.want, Since: at, Active: []cli.RunActivity{}},
					{ID: "old", Status: "completed", Since: at.Add(-time.Hour), Active: []cli.RunActivity{}},
				}
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("states %+v, want %+v", got, want)
				}
			}
			if kills != len(c.kills) || (tokens == 1) != c.wantToken {
				t.Fatalf("kill calls %d, token calls %d", kills, tokens)
			}
		})
	}
}

func TestProcessProbeRequiresCollaborators(t *testing.T) {
	t.Parallel()
	kill := func(int, syscall.Signal) error { return nil }
	token := func(context.Context, int) (string, error) { return "", nil }
	for _, c := range []struct {
		kill  func(int, syscall.Signal) error
		token func(context.Context, int) (string, error)
	}{{nil, token}, {kill, nil}} {
		if _, err := newProcessProbe(c.kill, c.token); err == nil {
			t.Fatal("missing collaborator accepted")
		}
	}
}
