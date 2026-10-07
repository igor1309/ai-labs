package supervisor

import (
	"errors"
	"fmt"
	"reflect"
	"sync"
	"syscall"
	"testing"
)

// kills is a spy of kill(2): it keeps each kill it is asked for, and
// answers each with answer.
type kills struct {
	mu     sync.Mutex
	answer error
	sent   []string
}

func (k *kills) kill(pid int, signal syscall.Signal) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.sent = append(k.sent, fmt.Sprintf("%d %s", pid, signal))
	return k.answer
}

func (k *kills) asked() []string {
	k.mu.Lock()
	defer k.mu.Unlock()
	return append([]string(nil), k.sent...)
}

// listing answers each listing of the group's processes with the next of
// its answers.
type listing struct {
	mu      sync.Mutex
	answers []listed
}

type listed struct {
	live bool
	err  error
}

func (l *listing) others(int) (bool, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.answers) == 0 {
		panic("the group was listed more often than the test expects")
	}
	answer := l.answers[0]
	l.answers = l.answers[1:]
	return answer.live, answer.err
}

// The group is signalled until Wait begins, and never from then: a
// cleanup that comes while the leader is reaped, or after, signals
// nothing, and a second Wait says the same without reaping again.
func TestALeaderSignalsItsGroupOnlyUntilItsReap(t *testing.T) {
	t.Parallel()
	spy := &kills{}
	var l *leader
	reaps := 0
	var during error
	l = &leader{
		pid: 7, kill: spy.kill, observe: func(int) error { return nil }, alone: syscall.EPERM,
		others: func(int) (bool, error) { panic("an unobserved exit lists nothing") },
		reap: func() Exit {
			reaps++
			during = l.Signal(syscall.SIGKILL)
			code := 3
			return Exit{Code: &code}
		},
	}
	if err := l.Signal(syscall.SIGTERM); err != nil {
		t.Fatalf("Signal before the exit: %v", err)
	}
	if exit := l.Wait(); exit.Code == nil || *exit.Code != 3 {
		t.Fatalf("exit %+v, want code 3", exit)
	}
	if !errors.Is(during, errReaped) {
		t.Fatalf("Signal during the reap: %v, want %v", during, errReaped)
	}
	if err := l.Signal(syscall.SIGKILL); !errors.Is(err, errReaped) {
		t.Fatalf("Signal after the reap: %v, want %v", err, errReaped)
	}
	if exit := l.Wait(); exit.Code == nil || *exit.Code != 3 || reaps != 1 {
		t.Fatalf("second Wait: exit %+v after %d reaps, want code 3 after 1", exit, reaps)
	}
	if want := []string{"-7 terminated"}; !reflect.DeepEqual(spy.asked(), want) {
		t.Fatalf("kills %q, want %q", spy.asked(), want)
	}
}

// Once the exit is observed the group is killed whatever its listing
// finds: the listing only says what the kill reached. A listing that
// failed, or that the group changed under, says it cannot be told (an
// error other than ESRCH); the kill's answer for the exited leader alone
// (alone) with nothing listed before or after it is none (ESRCH).
func TestTheKillAfterTheExitIsSentWhateverTheListingFinds(t *testing.T) {
	t.Parallel()
	denied := errors.New("permission denied")
	for _, c := range []struct {
		name     string
		alone    error
		answer   error
		listings []listed
		want     error
	}{
		{"leftovers", syscall.EPERM, nil, []listed{{live: true}}, nil},
		{"none, as macOS answers", syscall.EPERM, syscall.EPERM, []listed{{}, {}}, syscall.ESRCH},
		{"no process at all", nil, syscall.ESRCH, []listed{{}}, syscall.ESRCH},
		{"the listing fails", syscall.EPERM, nil, []listed{{err: denied}}, denied},
		{"one joins as the group is listed", syscall.EPERM, nil, []listed{{}}, errChanged},
		{"one is listed after the kill", nil, nil, []listed{{}, {live: true}}, errChanged},
		{"the listing after the kill fails", nil, nil, []listed{{}, {err: denied}}, denied},
		{"a listed one cannot be signalled", nil, syscall.EPERM, []listed{{live: true}}, syscall.EPERM},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			spy := &kills{answer: c.answer}
			list := &listing{answers: c.listings}
			l := &leader{
				pid: 7, kill: spy.kill, observe: func(int) error { return nil }, others: list.others, alone: c.alone,
				reap: func() Exit { return Exit{} },
			}
			if err := l.Exited(); err != nil {
				t.Fatal(err)
			}
			err := l.Signal(syscall.SIGKILL)
			if !errors.Is(err, c.want) {
				t.Fatalf("Signal after the exit: %v, want %v", err, c.want)
			}
			if c.want != syscall.ESRCH && errors.Is(err, syscall.ESRCH) {
				t.Fatalf("Signal after the exit: %v reads as no leftovers", err)
			}
			if want := []string{"-7 killed"}; !reflect.DeepEqual(spy.asked(), want) {
				t.Fatalf("kills %q, want %q", spy.asked(), want)
			}
			if len(list.answers) != 0 {
				t.Fatalf("%d listings left unasked", len(list.answers))
			}
		})
	}
}
