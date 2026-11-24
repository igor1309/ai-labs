package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/sseclient"
	"github.com/igor1309/ai-labs/audelin/feed/sseserver"
)

// clock is a fake clock whose waits jump time forward at once, up to a
// limit the test raises; a wait past it holds until then.
type clock struct {
	mu     sync.Mutex
	now    time.Time
	limit  time.Time
	raised chan struct{}
}

func newClock(now time.Time) *clock {
	return &clock{now: now, limit: now, raised: make(chan struct{})}
}

func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *clock) Wait(ctx context.Context, t time.Time) error {
	for {
		c.mu.Lock()
		if !t.After(c.limit) {
			if t.After(c.now) {
				c.now = t
			}
			c.mu.Unlock()
			return nil
		}
		raised := c.raised
		c.mu.Unlock()
		select {
		case <-raised:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func (c *clock) raise(to time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.limit = to
	close(c.raised)
	c.raised = make(chan struct{})
}

var callStart = time.Date(2026, 11, 24, 10, 15, 0, 0, time.UTC)

func save(t *testing.T, dir, fx string) {
	t.Helper()
	text, err := os.ReadFile(filepath.Join("..", "..", "callreader", "testdata", fx))
	if err != nil {
		t.Fatal(err)
	}
	folder := filepath.Join(dir, "2026.11.24-1015 Planning")
	if err := os.MkdirAll(folder, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(folder, "transcript.md"), text, 0o644); err != nil {
		t.Fatal(err)
	}
}

// started serves dir timed by c and gives a client for it and the
// server's result.
func started(t *testing.T, dir string, c *clock) (*sseclient.Client, chan error) {
	t.Helper()
	ln, err := sseserver.Listen(0)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- serve(ln, dir, time.UTC, c) }()
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	return sseclient.New("http://127.0.0.1:"+port, "callEnded"), done
}

func next(t *testing.T, s *sseclient.Stream) sseclient.Event {
	t.Helper()
	ev, err := s.Next()
	if err != nil {
		t.Fatal(err)
	}
	return ev
}

func TestAFollowedCallIsServedFromJoinToEnd(t *testing.T) {
	dir := t.TempDir()
	save(t, dir, "live.md")
	c := newClock(callStart.Add(200 * time.Second))
	client, done := started(t, dir, c)

	s, err := client.Connect(context.Background(), 180*time.Second, 60*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	joined := next(t, s)
	var w wireWindow
	if err := json.Unmarshal(joined.Data, &w); err != nil {
		t.Fatal(err)
	}
	if joined.Name != "chunk" || w.From != 0 || w.To != 180 || len(w.New) != 4 || w.New[0] != (wirePart{Speaker: "Me", Start: 2, Words: w.New[0].Words}) {
		t.Fatalf("joined: %s %s", joined.Name, joined.Data)
	}

	save(t, dir, "finished.md")
	c.raise(callStart.Add(time.Hour))

	last := next(t, s)
	if err := json.Unmarshal(last.Data, &w); err != nil {
		t.Fatal(err)
	}
	if last.Name != "chunk" || w.From != 120 || w.To != 201 || len(w.Context) != 0 || len(w.New) != 2 {
		t.Fatalf("last words: %s %s", last.Name, last.Data)
	}
	if ev := next(t, s); ev.Name != "callEnded" {
		t.Fatalf("got %s %s", ev.Name, ev.Data)
	}
	if _, err := s.Next(); !errors.Is(err, io.EOF) {
		t.Fatalf("after the end: %v", err)
	}
	s.Close()
	if err := <-done; err != nil {
		t.Fatalf("serve: %v", err)
	}
}

func TestWithNoCallNoCallIsSaid(t *testing.T) {
	c := newClock(callStart)
	client, _ := started(t, t.TempDir(), c)

	s, err := client.Connect(context.Background(), 180*time.Second, 60*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if ev := next(t, s); ev.Name != "noCall" {
		t.Fatalf("got %s", ev.Name)
	}
}

func TestWindowsTheIteratorRefusesAreRefused(t *testing.T) {
	client, _ := started(t, t.TempDir(), newClock(callStart))

	_, err := client.Connect(context.Background(), 60*time.Second, 60*time.Second)

	var refused *sseclient.RefusedError
	if !errors.As(err, &refused) {
		t.Fatalf("got %v", err)
	}
}

func TestFlagsNeedTheCallsFolder(t *testing.T) {
	if code := run(nil, io.Discard); code != 64 {
		t.Fatalf("exit %d", code)
	}
	if code := run([]string{"-port", "x"}, io.Discard); code != 64 {
		t.Fatalf("exit %d", code)
	}
}
