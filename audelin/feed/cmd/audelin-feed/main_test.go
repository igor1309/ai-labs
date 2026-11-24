package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"reflect"
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
	t.Cleanup(func() { ln.Close() })
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

// Contract test: the composed feed serves its transcript over loopback HTTP.
func TestAFollowedCallIsServedFromJoinToEnd(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	save(t, dir, "live.md")
	c := newClock(callStart.Add(140 * time.Second))
	client, done := started(t, dir, c)

	s, err := client.Connect(context.Background(), 90*time.Second, 10*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	joined := next(t, s)
	var w wireWindow
	if err := json.Unmarshal(joined.Data, &w); err != nil {
		t.Fatal(err)
	}
	want := wireWindow{From: 0, To: 140, Context: []wirePart{}, New: []wirePart{
		{Speaker: "Me", Start: 2, Words: "Hello, can you hear me?"},
		{Speaker: "Them 1", Start: 5, Words: `Yes. The code word is "**Them** 00:00:09".`},
		{Speaker: "Them 2", Start: 64, Words: "Where are call notes saved?"},
		{Speaker: "Me", Start: 90, Words: "Next to the transcript,\nin the call's folder."},
	}}
	if joined.Name != "chunk" || !reflect.DeepEqual(w, want) {
		t.Fatalf("joined: %s %s", joined.Name, joined.Data)
	}

	save(t, dir, "finished.md")
	c.raise(callStart.Add(time.Hour))

	last := next(t, s)
	if err := json.Unmarshal(last.Data, &w); err != nil {
		t.Fatal(err)
	}
	want = wireWindow{From: 80, To: 141, Context: want.New[3:], New: []wirePart{
		{Speaker: "Them 1", Start: 125, Words: "And the CLI is called what?"},
		{Speaker: "Me", Start: 130, Words: "It is still being"},
	}}
	if last.Name != "chunk" || !reflect.DeepEqual(w, want) {
		t.Fatalf("last words: %s %s", last.Name, last.Data)
	}
	if ev := next(t, s); ev.Name != "callEnded" {
		t.Fatalf("got %s %s", ev.Name, ev.Data)
	}
	if _, err := s.Next(); !errors.Is(err, io.EOF) {
		t.Fatalf("after the end: %v", err)
	}
	if err := <-done; err != nil {
		t.Fatalf("serve: %v", err)
	}
}

func TestPendingPartRetimingDoesNotResendItOrHideNewWords(t *testing.T) {
	t.Parallel()
	original := []wirePart{
		{Speaker: "Me", Start: 6, Words: "We should wait."},
		{Speaker: "Them", Start: 6, Words: "Are we ready?"},
	}
	for _, tc := range []struct {
		before string
		after  string
		anchor []wirePart
		fresh  []wirePart
	}{
		{before: "pending.md", after: "retimed.md", fresh: []wirePart{}},
		{
			before: "pending.md", after: "retimed-with-new-part.md",
			fresh: []wirePart{{Speaker: "Me", Start: 6, Words: "I'll send an update."}},
		},
		{
			before: "pending.md", after: "retimed-with-repeated-words.md",
			fresh: []wirePart{{Speaker: "Me", Start: 6, Words: "We should wait."}},
		},
		{
			before: "pending-with-anchor.md", after: "retimed-past-anchor.md",
			anchor: []wirePart{{Speaker: "Me", Start: 8, Words: "The team is here."}},
			fresh:  []wirePart{{Speaker: "Me", Start: 6, Words: "I'll send an update."}},
		},
	} {
		t.Run(tc.after, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			save(t, dir, tc.before)
			clock := newClock(callStart.Add(9500 * time.Millisecond))
			assertWindow := feedWindows(t, dir, clock)
			initial := append(append([]wirePart{}, original...), tc.anchor...)
			assertWindow(wireWindow{From: 0, To: 9.5, Context: []wirePart{}, New: initial})

			save(t, dir, tc.after)
			clock.raise(callStart.Add(15 * time.Second))

			assertWindow(wireWindow{From: 0, To: 10, Context: initial, New: tc.fresh})
			context := append(append([]wirePart{}, original...), tc.fresh...)
			context = append(context, tc.anchor...)
			assertWindow(wireWindow{From: 5, To: 15, Context: context, New: []wirePart{}})
		})
	}
}

func TestSpeechAfterARetractionHasItsOwnIdentity(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	save(t, dir, "pending.md")
	clock := newClock(callStart.Add(7500 * time.Millisecond))
	assertWindow := feedWindows(t, dir, clock)
	original := []wirePart{
		{Speaker: "Me", Start: 6, Words: "We should wait."},
		{Speaker: "Them", Start: 6, Words: "Are we ready?"},
	}
	assertWindow(wireWindow{From: 0, To: 7.5, Context: []wirePart{}, New: original})

	save(t, dir, "retracted.md")
	clock.raise(callStart.Add(10 * time.Second))
	assertWindow(wireWindow{From: 0, To: 10, Context: original, New: []wirePart{}})

	save(t, dir, "after-retraction.md")
	clock.raise(callStart.Add(15 * time.Second))
	assertWindow(wireWindow{From: 5, To: 15, Context: original, New: original[:1]})
}

// feedWindows drives the real call reader and window iterator through their
// composition port without starting a server.
func feedWindows(t *testing.T, dir string, clock *clock) func(wireWindow) {
	t.Helper()
	stream, err := (source{dir: dir, loc: time.UTC, clock: clock}).Open(10*time.Second, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	return func(want wireWindow) {
		t.Helper()
		ev, err := stream.Next(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		var got wireWindow
		if err := json.Unmarshal(ev.Data, &got); err != nil {
			t.Fatal(err)
		}
		if ev.Name != "chunk" || !reflect.DeepEqual(got, want) {
			t.Fatalf("got %s %s, want chunk %+v", ev.Name, ev.Data, want)
		}
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
