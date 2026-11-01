package pages_test

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/agister/pages"
)

// lockedBuffer is a buffer the server's goroutine and the test share.
type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}
func (l *lockedBuffer) String() string { l.mu.Lock(); defer l.mu.Unlock(); return l.b.String() }

// Scenario: agister pages serves until its context ends.
//
// Contract test: a real loopback socket and HTTP server, started and shut
// down by its context.
func TestMainServesUntilItsContextEnds(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	var stdout lockedBuffer
	listened := make(chan string, 1)
	listen := func(network, address string) (net.Listener, error) {
		l, err := net.Listen(network, address)
		if err == nil {
			listened <- l.Addr().String()
		}
		return l, err
	}
	code := make(chan int, 1)
	go func() {
		code <- pages.Main(ctx, []string{"--no-open", "--addr", "127.0.0.1:0"}, pages.Env{Stdout: &stdout, Stderr: io.Discard, Listen: listen, Runs: keep()})
	}()
	addr := <-listened
	res, err := http.Get("http://" + addr + "/api/runs")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK || !strings.Contains(stdout.String(), addr) {
		t.Fatalf("status %d, printed %q", res.StatusCode, stdout.String())
	}
	cancel()
	select {
	case c := <-code:
		if c != 0 {
			t.Fatalf("exit %d, want 0", c)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("did not stop")
	}
}

// A bad flag or an address off this machine is a usage error.
func TestMainRefusesBadArguments(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{{"--bogus"}, {"--addr", "0.0.0.0:7465"}, {"--addr"}} {
		listen := func(string, string) (net.Listener, error) { t.Errorf("%v: listened", args); return nil, nil }
		if c := pages.Main(context.Background(), args, pages.Env{Stdout: io.Discard, Stderr: io.Discard, Listen: listen, Runs: keep()}); c != 64 {
			t.Errorf("%v: exit %d, want 64", args, c)
		}
	}
}
