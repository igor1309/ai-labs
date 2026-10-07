package supervisor

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"syscall"
	"testing"
)

// denying is a /proc whose files named in denied cannot be read, as a
// process's stat that this process may not read.
type denying struct {
	fs.FS
	denied map[string]bool
}

func (d denying) Open(name string) (fs.File, error) {
	if d.denied[name] {
		return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrPermission}
	}
	return d.FS.Open(name)
}

// proc writes a /proc in a temporary directory: each process's stat, by
// its PID, and a directory without one for each PID in gone.
func proc(t *testing.T, stats map[string]string, gone ...string) string {
	t.Helper()
	root := t.TempDir()
	for pid, stat := range stats {
		if err := os.Mkdir(filepath.Join(root, pid), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, pid, "stat"), []byte(stat), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for _, pid := range gone {
		if err := os.Mkdir(filepath.Join(root, pid), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(root, "self"), 0o755); err != nil {
		t.Fatal(err)
	}
	return root
}

// The listing says no other process only when it proves it: a process of
// another group is no member, a live one of the group is a leftover
// whatever else is found, and a zombie of the group, a stat gone since the
// listing or one that cannot be parsed leaves it unsettled (a zombie may
// be one the kill made, a gone process may have been the group's). A stat
// that cannot be read fails the listing: it may hide a leftover.
func TestTheListingSaysNoOtherProcessOnlyWhenItProvesIt(t *testing.T) {
	t.Parallel()
	const leader = "7 (lead) Z 1 7 7 0 -1"
	for _, c := range []struct {
		name   string
		stats  map[string]string
		gone   []string
		denied []string
		live   bool
		err    error
	}{
		{"a live one", map[string]string{"7": leader, "8": "8 (left (over)) S 1 7 7 0 -1"}, nil, nil, true, nil},
		{"a zombie", map[string]string{"7": leader, "8": "8 (left) Z 1 7 7 0 -1"}, nil, nil, false, errUnsettled},
		{"a live one beside a zombie", map[string]string{"7": leader, "8": "8 (left) Z 1 7 7 0 -1", "9": "9 (left) S 1 7 7 0 -1"}, nil, nil, true, nil},
		{"another group's", map[string]string{"7": leader, "8": "8 (other) S 1 8 8 0 -1"}, nil, nil, false, nil},
		{"another group's zombie", map[string]string{"7": leader, "8": "8 (other) Z 1 8 8 0 -1"}, nil, nil, false, nil},
		{"no other process", map[string]string{"7": leader}, nil, nil, false, nil},
		{"one gone since the listing", map[string]string{"7": leader}, []string{"8"}, nil, false, errUnsettled},
		{"one whose stat cannot be parsed", map[string]string{"7": leader, "8": "8 left S 1 7"}, nil, nil, false, errUnsettled},
		{"one whose stat is denied", map[string]string{"7": leader, "8": "8 (left) S 1 7 7 0 -1"}, nil, []string{"8/stat"}, false, fs.ErrPermission},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			denied := map[string]bool{}
			for _, name := range c.denied {
				denied[name] = true
			}
			live, err := procOthers(denying{FS: os.DirFS(proc(t, c.stats, c.gone...)), denied: denied}, 7)
			if !errors.Is(err, c.err) {
				t.Fatalf("listing: %v, want %v", err, c.err)
			}
			if live != c.live {
				t.Fatalf("live %v, want %v", live, c.live)
			}
		})
	}
}

// procs is a /proc that changes between listings: each listing reads the
// next of its fixtures.
type procs struct {
	mu       sync.Mutex
	fixtures []string
}

func (p *procs) others(group int) (bool, error) {
	p.mu.Lock()
	if len(p.fixtures) == 0 {
		p.mu.Unlock()
		panic("the group was listed more often than the test expects")
	}
	root := p.fixtures[0]
	p.fixtures = p.fixtures[1:]
	p.mu.Unlock()
	return procOthers(os.DirFS(root), group)
}

// On Linux the kill after the exit is answered alike for the zombie leader
// alone and for leftovers, so /proc, read before the kill and after it,
// says which: the cleanup is none (ESRCH) only when both listings prove the
// group had no other process. A member that turns zombie between them, or
// one seen before the kill and gone after it, leaves the cleanup unknown:
// an error, and not ESRCH, which reads as no leftovers.
func TestLinuxReportsTheCleanupUnknownWhenProcCannotProveIt(t *testing.T) {
	t.Parallel()
	const lead = "7 (lead) Z 1 7 7 0 -1"
	stranger := "9 (other) S 1 9 9 0 -1"
	for _, c := range []struct {
		name    string
		before  map[string]string
		after   map[string]string
		gone    []string
		unknown bool
	}{
		{"a member turns zombie between the listings", map[string]string{"7": lead, "9": stranger},
			map[string]string{"7": lead, "8": "8 (left) Z 1 7 7 0 -1", "9": stranger}, nil, true},
		{"a member seen as a zombie is gone after the kill", map[string]string{"7": lead, "8": "8 (left) Z 1 7 7 0 -1"},
			map[string]string{"7": lead}, nil, true},
		{"a process disappears as it is listed after the kill", map[string]string{"7": lead, "9": stranger},
			map[string]string{"7": lead, "9": stranger}, []string{"8"}, true},
		{"the group has no other member", map[string]string{"7": lead, "9": stranger},
			map[string]string{"7": lead, "9": stranger}, nil, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			list := &procs{fixtures: []string{proc(t, c.before), proc(t, c.after, c.gone...)}}
			spy := &kills{}
			l := &leader{
				pid: 7, kill: spy.kill, observe: func(int) error { return nil }, others: list.others, alone: nil,
				reap: func() Exit { return Exit{} },
			}
			if err := l.Exited(); err != nil {
				t.Fatal(err)
			}
			err := l.Signal(syscall.SIGKILL)
			switch {
			case c.unknown && (err == nil || errors.Is(err, syscall.ESRCH)):
				t.Fatalf("Signal after the exit: %v, want the cleanup unknown", err)
			case c.unknown && !errors.Is(err, errUnsettled):
				t.Fatalf("Signal after the exit: %v, want %v", err, errUnsettled)
			case !c.unknown && !errors.Is(err, syscall.ESRCH):
				t.Fatalf("Signal after the exit: %v, want %v", err, syscall.ESRCH)
			}
			if want := []string{"-7 killed"}; !reflect.DeepEqual(spy.asked(), want) {
				t.Fatalf("kills %q, want %q", spy.asked(), want)
			}
		})
	}
}
