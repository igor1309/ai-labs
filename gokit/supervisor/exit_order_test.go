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

// ends runs a spied process through each place that waits for one, a
// runtime's run and a command, and gives the events the run reported.
var ends = map[string]func(p *spied) *events{
	"run": func(p *spied) *events {
		sink := &events{}
		supervisor.Runtime{Starter: p, Timer: clocktest.NewClock(start).Timer}.Run(context.Background(),
			supervisor.Spec{Command: "runtime", Timeout: time.Minute}, sink, func(string) {})
		return sink
	},
	"command": func(p *spied) *events {
		supervisor.Commands{Starter: p, Timer: clocktest.NewClock(start).Timer}.Run(context.Background(),
			supervisor.CommandRequest{Command: "true", Timeout: time.Minute, Bound: 8}, func(string) error { return nil })
		return nil
	},
}

// What the process left in its group is killed once its exit is observed
// and before it is reaped, while its unreaped leader keeps the group's ID
// from reuse.
func TestTheGroupIsKilledBetweenTheExitAndTheReap(t *testing.T) {
	t.Parallel()
	for name, end := range ends {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			p := &spied{group: supervisortest.NewGroups().Next(), signalled: syscall.ESRCH}
			end(p)
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
	for name, end := range ends {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			p := &spied{group: supervisortest.NewGroups().Next(), observed: errors.ErrUnsupported}
			sink := end(p)
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
			sink := ends["run"](&spied{group: supervisortest.NewGroups().Next(), signalled: c.signalled})
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
