package pages_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"slices"
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

// opener records the URLs it is asked to open and gives err.
type opener struct {
	mu   sync.Mutex
	urls []string
	err  error
}

func (o *opener) open(url string) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.urls = append(o.urls, url)
	return o.err
}

func (o *opener) opened() []string { o.mu.Lock(); defer o.mu.Unlock(); return slices.Clone(o.urls) }

// never is a timer that does not fire.
func never(time.Duration) <-chan time.Time { return nil }

// served is a Main run on a real loopback socket: what it printed and
// opened, and its exit code once its context is cancelled.
type served struct {
	stdout, stderr string
	opened         []string
	addr           string
	code           int
}

func serve(t *testing.T, args []string, o *opener) served {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var stdout, stderr lockedBuffer
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
		code <- pages.Main(ctx, args, pages.Env{Stdout: &stdout, Stderr: &stderr, Listen: listen, Open: o.open, Runs: keep(), After: never})
	}()
	addr := <-listened
	res, err := http.Get("http://" + addr + "/api/runs")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status %d", res.StatusCode)
	}
	cancel()
	return served{stdout: stdout.String(), stderr: stderr.String(), opened: o.opened(), addr: addr, code: <-code}
}

// Scenario: agister pages serves until its context ends, without opening
// the browser under --no-open.
//
// Contract test: a real loopback socket and HTTP server, started and shut
// down by its context.
func TestMainServesUntilItsContextEnds(t *testing.T) {
	t.Parallel()
	got := serve(t, []string{"--no-open", "--addr", "127.0.0.1:0"}, &opener{})
	if got.code != 0 || !strings.Contains(got.stdout, "http://"+got.addr+"/") || len(got.opened) != 0 {
		t.Fatalf("exit %d, printed %q, opened %q; want 0, the address, nothing opened", got.code, got.stdout, got.opened)
	}
}

// Without --no-open the page is opened at its address.
//
// Contract test: a real loopback socket and HTTP server.
func TestMainOpensThePageByDefault(t *testing.T) {
	t.Parallel()
	got := serve(t, []string{"--addr", "127.0.0.1:0"}, &opener{})
	if want := []string{"http://" + got.addr + "/"}; got.code != 0 || !slices.Equal(got.opened, want) {
		t.Fatalf("exit %d, opened %q; want 0, %q", got.code, got.opened, want)
	}
}

// A browser that fails to open is said on stderr, and the page is served.
//
// Contract test: a real loopback socket and HTTP server.
func TestMainServesWhenTheBrowserFails(t *testing.T) {
	t.Parallel()
	got := serve(t, []string{"--addr", "127.0.0.1:0"}, &opener{err: errors.New("no browser")})
	if got.code != 0 || !strings.Contains(got.stderr, "no browser") {
		t.Fatalf("exit %d, stderr %q; want 0 and the failure", got.code, got.stderr)
	}
}

// A socket that cannot be listened on is an error on stderr, exit 1.
func TestMainFailsWhenItCannotListen(t *testing.T) {
	t.Parallel()
	var stderr bytes.Buffer
	listen := func(string, string) (net.Listener, error) { return nil, errors.New("address already in use") }
	o := &opener{}
	code := pages.Main(context.Background(), nil, pages.Env{Stdout: io.Discard, Stderr: &stderr, Listen: listen, Open: o.open, Runs: keep(), After: never})
	if code != 1 || !strings.Contains(stderr.String(), "address already in use") || len(o.opened()) != 0 {
		t.Fatalf("exit %d, stderr %q, opened %q; want 1, the error, nothing opened", code, stderr.String(), o.opened())
	}
}

// A bad flag or an address off this machine is a usage error.
func TestMainRefusesBadArguments(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{{"--bogus"}, {"--addr", "0.0.0.0:7465"}, {"--addr"}} {
		listen := func(string, string) (net.Listener, error) {
			t.Errorf("%v: listened", args)
			return nil, errors.New("no")
		}
		if c := pages.Main(context.Background(), args, pages.Env{Stdout: io.Discard, Stderr: io.Discard, Listen: listen, Open: (&opener{}).open, Runs: keep(), After: never}); c != 64 {
			t.Errorf("%v: exit %d, want 64", args, c)
		}
	}
}

// Main is refused without each of its collaborators.
func TestMainRefusesAMissingCollaborator(t *testing.T) {
	t.Parallel()
	var stderr bytes.Buffer
	if c := pages.Main(context.Background(), nil, pages.Env{Stdout: io.Discard, Stderr: &stderr, Runs: keep()}); c != 1 || !strings.Contains(stderr.String(), "missing collaborator") {
		t.Fatalf("exit %d, stderr %q", c, stderr.String())
	}
}

// blocking is a run store whose IDs holds each caller until released.
type blocking struct{ entered, release chan struct{} }

func (b blocking) IDs() ([]string, error)        { b.entered <- struct{}{}; <-b.release; return nil, nil }
func (b blocking) Run(string) (pages.Run, error) { return pages.Run{}, pages.ErrNotFound }

// A request still running when the context ends is closed once the grace
// timer fires, and Main stops.
//
// Contract test: a real loopback socket and HTTP server; the grace timer
// is the test's.
func TestMainClosesARequestStillRunningWhenTheGraceEnds(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runs := blocking{entered: make(chan struct{}), release: make(chan struct{})}
	defer close(runs.release)
	listened := make(chan string, 1)
	listen := func(network, address string) (net.Listener, error) {
		l, err := net.Listen(network, address)
		if err == nil {
			listened <- l.Addr().String()
		}
		return l, err
	}
	asked, fire := make(chan time.Duration, 1), make(chan time.Time)
	after := func(d time.Duration) <-chan time.Time { asked <- d; return fire }
	code := make(chan int, 1)
	go func() {
		code <- pages.Main(ctx, []string{"--no-open", "--addr", "127.0.0.1:0"}, pages.Env{Stdout: io.Discard, Stderr: io.Discard, Listen: listen, Open: (&opener{}).open, Runs: runs, After: after})
	}()
	addr := <-listened
	failed := make(chan error, 1)
	go func() {
		res, err := http.Get("http://" + addr + "/api/runs")
		if err == nil {
			res.Body.Close()
		}
		failed <- err
	}()
	<-runs.entered
	cancel()
	if d := <-asked; d != pages.ShutdownGrace {
		t.Fatalf("grace %v, want %v", d, pages.ShutdownGrace)
	}
	select {
	case c := <-code:
		t.Fatalf("exit %d before the grace ended", c)
	default:
	}
	fire <- time.Time{}
	if c := <-code; c != 0 {
		t.Fatalf("exit %d, want 0", c)
	}
	if err := <-failed; err == nil {
		t.Fatal("the running request was answered, want it closed")
	}
}
