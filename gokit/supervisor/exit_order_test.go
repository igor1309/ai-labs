package supervisor_test

import (
	"context"
	"errors"
	"io"
	"reflect"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/gokit/clocktest"
	"github.com/igor1309/ai-labs/gokit/supervisor"
	"github.com/igor1309/ai-labs/gokit/supervisor/supervisortest"
)

// spied is a process that has exited by the time it is asked, and keeps
// what it is asked, in order. A signal is answered with signalled, the
// observing of its exit with observed.
type spied struct {
	group     int
	signalled error
	observed  error

	mu    sync.Mutex
	calls []string
}

func (p *spied) Start(supervisor.Command) (supervisor.Process, error) { return p, nil }

func (p *spied) Stdout() io.ReadCloser { return io.NopCloser(strings.NewReader("")) }

func (p *spied) Group() int { return p.group }

func (p *spied) Token(context.Context) (string, error) { return "spied", nil }

func (p *spied) Signal(signal syscall.Signal) error {
	p.call("signal " + signal.String())
	return p.signalled
}

func (p *spied) Exited() error {
	p.call("exited")
	return p.observed
}

func (p *spied) Wait() supervisor.Exit {
	p.call("reaped")
	code := 0
	return supervisor.Exit{Code: &code}
}

func (p *spied) call(name string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls = append(p.calls, name)
}

// timer is the seam the supervisor's timers are started on.
type timer = func(time.Duration) (<-chan time.Time, func())

// ends runs a process through each place that waits for one, a runtime's
// run, a command and a runtime's version, on starter and timer, and gives
// the events a run reported (nil for the others, which report none).
var ends = map[string]func(ctx context.Context, starter supervisor.Starter, timer timer) *events{
	"run": func(ctx context.Context, starter supervisor.Starter, timer timer) *events {
		sink := &events{}
		supervisor.Runtime{Starter: starter, Timer: timer}.Run(ctx,
			supervisor.Spec{Command: "runtime", Timeout: time.Minute}, sink, func(string) {})
		return sink
	},
	"command": func(ctx context.Context, starter supervisor.Starter, timer timer) *events {
		supervisor.Commands{Starter: starter, Timer: timer}.Run(ctx,
			supervisor.CommandRequest{Command: "true", Timeout: time.Minute, Bound: 8}, func(string) error { return nil })
		return nil
	},
	"version": func(ctx context.Context, starter supervisor.Starter, timer timer) *events {
		_, _ = supervisor.Runtime{Starter: starter, Timer: timer}.Version(ctx, "runtime")
		return nil
	},
}

// through runs a spied process through end, on a manual clock.
func through(end func(context.Context, supervisor.Starter, timer) *events, p *spied) *events {
	return end(context.Background(), p, clocktest.NewClock(start).Timer)
}

// What the process left in its group is killed once its exit is observed
// and before it is reaped, while its unreaped leader keeps the group's ID
// from reuse.
func TestTheGroupIsKilledBetweenTheExitAndTheReap(t *testing.T) {
	t.Parallel()
	for name, run := range ends {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			p := &spied{group: supervisortest.NewGroups().Next(), signalled: syscall.ESRCH}
			through(run, p)
			if want := []string{"exited", "signal killed", "reaped"}; !reflect.DeepEqual(p.calls, want) {
				t.Fatalf("calls %q, want %q", p.calls, want)
			}
		})
	}
}

// An exit that cannot be observed without reaping the process is reaped,
// and nothing is signalled after: the group's ID may be reused by then.
func TestAnExitThatCannotBeObservedIsReapedWithoutAKill(t *testing.T) {
	t.Parallel()
	for name, run := range ends {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			p := &spied{group: supervisortest.NewGroups().Next(), observed: errors.ErrUnsupported}
			sink := through(run, p)
			if want := []string{"exited", "reaped"}; !reflect.DeepEqual(p.calls, want) {
				t.Fatalf("calls %q, want %q", p.calls, want)
			}
			if sink != nil && (!sink.has("LEFTOVER_CLEANUP_UNKNOWN") || sink.has("LEFTOVER_PROCESSES_KILLED")) {
				t.Fatalf("events = %v", sink.kinds)
			}
		})
	}
}

// The kill after the exit is classified: one that reached a process killed
// leftovers, one that found none (ESRCH) killed nothing, and any other
// answer cannot tell either and says so.
func TestTheKillAfterTheExitIsClassified(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name      string
		signalled error
		want      []string
	}{
		{"reached", nil, []string{"LEFTOVER_PROCESSES_KILLED"}},
		{"none", syscall.ESRCH, nil},
		{"refused", syscall.EPERM, []string{"LEFTOVER_CLEANUP_UNKNOWN"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			sink := through(ends["run"], &spied{group: supervisortest.NewGroups().Next(), signalled: c.signalled})
			var got []string
			for _, kind := range sink.kinds {
				if strings.HasPrefix(kind, "LEFTOVER_") {
					got = append(got, kind)
				}
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Fatalf("leftover events %q, want %q (all: %v)", got, c.want, sink.kinds)
			}
		})
	}
}

// pausing is a process whose exit cannot be observed apart from its reap,
// and whose reap, once done, pauses until the test resumes it. It keeps
// what it is asked, in order.
type pausing struct {
	group  int
	reaped chan struct{}
	resume chan struct{}

	mu    sync.Mutex
	calls []string
}

func (p *pausing) Start(supervisor.Command) (supervisor.Process, error) { return p, nil }

func (p *pausing) Stdout() io.ReadCloser { return io.NopCloser(strings.NewReader("")) }

func (p *pausing) Group() int { return p.group }

func (p *pausing) Token(context.Context) (string, error) { return "pausing", nil }

func (p *pausing) Signal(signal syscall.Signal) error {
	p.call("signal " + signal.String())
	return nil
}

func (p *pausing) Exited() error {
	p.call("exited")
	return errors.ErrUnsupported
}

func (p *pausing) Wait() supervisor.Exit {
	p.call("reaped")
	close(p.reaped)
	<-p.resume
	code := 0
	return supervisor.Exit{Code: &code}
}

func (p *pausing) call(name string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls = append(p.calls, name)
}

// firing is a timer whose first wait the test fires (fire), and which
// says when that wait is stopped (stopped); a later wait never passes.
type firing struct {
	fire    chan time.Time
	stopped chan struct{}

	mu      sync.Mutex
	started bool
}

func (f *firing) Timer(time.Duration) (<-chan time.Time, func()) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.started {
		return nil, func() {}
	}
	f.started = true
	return f.fire, sync.OnceFunc(func() { close(f.stopped) })
}

// An exit that cannot be observed apart from its reap ends the watcher's
// signals before the reap: a timeout or a cancellation that comes while
// the leader is reaped, its group's ID free for reuse, signals nothing.
// The watcher has ended once it stops its timer.
func TestNothingIsSignalledOnceAnUnobservedExitIsReaped(t *testing.T) {
	t.Parallel()
	for name, run := range ends {
		for _, by := range []string{"timeout", "cancellation"} {
			t.Run(name+" "+by, func(t *testing.T) {
				t.Parallel()
				p := &pausing{group: supervisortest.NewGroups().Next(), reaped: make(chan struct{}), resume: make(chan struct{})}
				timer := &firing{fire: make(chan time.Time), stopped: make(chan struct{})}
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				done := make(chan struct{})
				go func() {
					defer close(done)
					run(ctx, p, timer.Timer)
				}()
				<-p.reaped
				if by == "timeout" {
					timer.fire <- start
				} else {
					cancel()
				}
				<-timer.stopped
				close(p.resume)
				<-done
				if want := []string{"exited", "reaped"}; !reflect.DeepEqual(p.calls, want) {
					t.Fatalf("calls %q, want %q", p.calls, want)
				}
			})
		}
	}
}

// holding is a process that has exited by the time it is asked, leaving
// a descendant in its group that holds its stderr open: its reap, which
// waits for stderr to be copied, returns only once the group is killed.
type holding struct {
	group  int
	killed chan struct{}
	once   sync.Once
}

func (p *holding) Start(supervisor.Command) (supervisor.Process, error) { return p, nil }

func (p *holding) Stdout() io.ReadCloser { return io.NopCloser(strings.NewReader("1.0.0\n")) }

func (p *holding) Group() int { return p.group }

func (p *holding) Token(context.Context) (string, error) { return "holding", nil }

func (p *holding) Signal(signal syscall.Signal) error {
	if signal == syscall.SIGKILL {
		p.once.Do(func() { close(p.killed) })
	}
	return nil
}

func (p *holding) Exited() error { return nil }

func (p *holding) Wait() supervisor.Exit {
	<-p.killed
	code := 0
	return supervisor.Exit{Code: &code}
}

// A version whose runtime left a descendant holding stderr is read: the
// group is killed once the exit is observed, before the reap that waits
// for stderr. A reap before the kill is a hang the binary's -timeout
// names.
func TestAVersionWhoseDescendantHoldsStderrIsRead(t *testing.T) {
	t.Parallel()
	p := &holding{group: supervisortest.NewGroups().Next(), killed: make(chan struct{})}
	version, err := supervisor.Runtime{Starter: p, Timer: clocktest.NewClock(start).Timer}.Version(context.Background(), "runtime")
	if err != nil || version != "1.0.0" {
		t.Fatalf("version %q, %v", version, err)
	}
}
