package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/runstore"
)

// syncBuffer is a buffer the server's goroutine and the test share.
type syncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}
func (s *syncBuffer) String() string { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

// "agister pages" is routed to pages, before any settings are read: a bad
// flag gives pages' usage and exit 64.
func TestRunRoutesPagesToPages(t *testing.T) {
	t.Parallel()
	var stdout, stderr bytes.Buffer
	if code := run(context.Background(), []string{"pages", "--bogus"}, &stdout, &stderr); code != 64 || !strings.Contains(stderr.String(), "usage: agister pages") {
		t.Fatalf("exit %d, stderr %q; want 64 and pages' usage", code, stderr.String())
	}
}

// Scenario: agister pages serves until its context ends.
//
// Contract test: a real loopback socket and HTTP server; the run store is
// a spy.
func TestServePagesServesTheStoresRunsUntilItsContextEnds(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	store := pagesStoreSpy{snapshots: map[string]runstore.Snapshot{
		"20261101T085900Z-aa": {Record: runstore.Record{ID: "20261101T085900Z-aa", Started: now, Ended: &now, Status: "completed", Request: runstore.Request{Workflow: "code_review"}}},
	}}
	listened := make(chan string, 1)
	listen := func(network, address string) (net.Listener, error) {
		l, err := net.Listen(network, address)
		if err == nil {
			listened <- l.Addr().String()
		}
		return l, err
	}
	opened := func(string) error { t.Error("--no-open opened the browser"); return nil }
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var stdout syncBuffer
	code := make(chan int, 1)
	go func() {
		code <- servePages(ctx, []string{"--no-open", "--addr", "127.0.0.1:0"}, &stdout, io.Discard,
			pagesWiring{store: store, now: func() time.Time { return now }, probe: func(int) (string, bool, error) { return "", false, nil }, listen: listen, open: opened,
				after: func(time.Duration) <-chan time.Time { return nil }})
	}()
	addr := <-listened
	res, err := http.Get("http://" + addr + "/api/runs")
	if err != nil {
		t.Fatal(err)
	}
	var list struct {
		Runs []struct{ ID, Workflow, Status string }
	}
	err = json.NewDecoder(res.Body).Decode(&list)
	res.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Runs) != 1 || list.Runs[0].Workflow != "code_review" || list.Runs[0].Status != "completed" || !strings.Contains(stdout.String(), addr) {
		t.Fatalf("runs %+v, printed %q", list.Runs, stdout.String())
	}
	cancel()
	if c := <-code; c != 0 {
		t.Fatalf("exit %d, want 0", c)
	}
}
