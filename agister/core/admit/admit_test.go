package admit_test

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"slices"
	"sync"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/admit"
)

// trail is what the spies of one call were asked, in order. It is safe
// for concurrent use, and a nil trail keeps nothing.
type trail struct {
	mu    sync.Mutex
	steps []string
}

func (t *trail) add(step string) {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.steps = append(t.steps, step)
}

func (t *trail) all() []string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return slices.Clone(t.steps)
}

// worktreeSpy answers the worktree's facts with its test's HEAD,
// cleanness and content, HEAD's error headErr and content's contentErr
// where its test gives one, and keeps what it is asked on its trail. A
// fact asked on a context that has ended is an error, as for a git that
// ends with it.
type worktreeSpy struct {
	head       string
	clean      bool
	content    string
	headErr    error
	contentErr error
	trail      *trail
}

func (s *worktreeSpy) Head(ctx context.Context) (string, error) {
	s.trail.add("head")
	if err := cmp.Or(ctx.Err(), s.headErr); err != nil {
		return "", err
	}
	return s.head, nil
}

func (s *worktreeSpy) Clean(ctx context.Context) (bool, error) {
	s.trail.add("clean")
	if err := ctx.Err(); err != nil {
		return false, err
	}
	return s.clean, nil
}

func (s *worktreeSpy) Content(ctx context.Context) (string, error) {
	s.trail.add("content")
	if err := cmp.Or(ctx.Err(), s.contentErr); err != nil {
		return "", err
	}
	return s.content, nil
}

// holdSpy takes a hold unless its test gives err, and keeps how each was
// asked, alone or not, and whether it is held now; each take and release
// on its trail too. It is safe for concurrent use.
type holdSpy struct {
	err   error
	trail *trail
	mu    sync.Mutex
	takes []bool
	held  int
}

func (s *holdSpy) Take(alone bool) (func(), error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.trail.add("take")
	s.takes = append(s.takes, alone)
	if s.err != nil {
		return nil, s.err
	}
	s.held++
	var once sync.Once
	return func() {
		once.Do(func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			s.trail.add("release")
			s.held--
		})
	}, nil
}

func (s *holdSpy) state() (takes []bool, held int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.takes), s.held
}

// toldSpy keeps each admitted call's facts it is told, on its trail too.
type toldSpy struct {
	trail *trail
	facts []admit.Facts
}

func (s *toldSpy) told(facts admit.Facts) {
	s.trail.add("told")
	s.facts = append(s.facts, facts)
}

// ignored is a port told an admitted call's facts that keeps none, for a
// test about what else admit does.
func ignored(admit.Facts) {}

func admitter(t *testing.T, worktree admit.Worktree, hold admit.Hold) *admit.Admitter {
	t.Helper()
	a, err := admit.New(worktree, hold)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

// admit.feature, "A call's process decides what is checked". "The input"
// gives a commit, as git.revision does; "the param" none.
func TestACallsProcessDecidesWhatIsChecked(t *testing.T) {
	t.Parallel()
	free, taken := error(nil), fmt.Errorf("/l/k.lock: %w", admit.ErrHeld)
	rev := func(commit string) *admit.Pin {
		return &admit.Pin{Input: "rev", Source: "git.revision", Commit: commit}
	}
	cases := []struct {
		declares string
		request  admit.Request
		clean    bool
		hold     error
		refused  string
		takes    []bool
	}{
		{"nothing", admit.Request{}, true, free, "", []bool{false}},
		{"read-write access", admit.Request{Writer: true}, true, free, "", []bool{true}},
		{`the input "rev" of "c1"`, admit.Request{Pin: rev("c1")}, true, free, "", []bool{false}},
		{`the input "rev" of "c2"`, admit.Request{Pin: rev("c2")}, true, free, `HEAD is "c1", not the pinned "c2"`, nil},
		{`the param "what"`, admit.Request{Pin: &admit.Pin{Input: "what", Source: "param"}}, true, free,
			`a pin from the input "what", of the source "param", is not run yet`, nil},
		{"a clean worktree, not clean", admit.Request{Clean: true}, false, free, "the worktree is not clean", nil},
		{"nothing, not clean", admit.Request{}, false, free, "", []bool{false}},
		{"read-write access, held", admit.Request{Writer: true}, true, taken, "the worktree is held by another call", []bool{true}},
	}
	for _, c := range cases {
		t.Run(c.declares, func(t *testing.T) {
			t.Parallel()
			hold := &holdSpy{err: c.hold}
			made := false
			err := admitter(t, &worktreeSpy{head: "c1", clean: c.clean}, hold).Make(context.Background(), c.request,
				func(context.Context) { made = true }, ignored)
			takes, held := hold.state()
			switch {
			case c.refused == "" && (err != nil || !made):
				t.Errorf("error %v, made %v; want admitted and made", err, made)
			case c.refused != "" && (err == nil || err.Error() != c.refused || made):
				t.Errorf("error %v, made %v; want refused, %q, and not made", err, made, c.refused)
			}
			if !slices.Equal(takes, c.takes) || held != 0 {
				t.Errorf("holds taken %v, %d held after; want %v, none held", takes, held, c.takes)
			}
		})
	}
}

// Admit checks only what the process declares, and checks before it
// holds: a call that declares nothing asks no fact before its hold. Under
// the hold, every admitted call's HEAD is read before it is made and its
// content after.
func TestAdmitAsksOnlyTheFactsDeclared(t *testing.T) {
	t.Parallel()
	pin := &admit.Pin{Input: "rev", Source: "git.revision", Commit: "c1"}
	for name, c := range map[string]struct {
		request admit.Request
		asked   []string
	}{
		"nothing":       {admit.Request{}, nil},
		"a pin":         {admit.Request{Pin: pin}, []string{"head"}},
		"clean":         {admit.Request{Clean: true}, []string{"clean"}},
		"a pin, clean":  {admit.Request{Pin: pin, Clean: true}, []string{"head", "clean"}},
		"a writer only": {admit.Request{Writer: true}, nil},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			asked := &trail{}
			worktree := &worktreeSpy{head: "c1", clean: true, trail: asked}
			err := admitter(t, worktree, &holdSpy{trail: asked}).Make(context.Background(), c.request,
				func(context.Context) { asked.add("made") }, ignored)
			if err != nil {
				t.Fatal(err)
			}
			want := append(slices.Clone(c.asked), "take", "head", "made", "content", "release")
			if got := asked.all(); !slices.Equal(got, want) {
				t.Errorf("asked %q, want %q", got, want)
			}
		})
	}
}

// admit.feature, "A refused call takes no hold and starts nothing".
func TestARefusedCallTakesNoHoldAndStartsNothing(t *testing.T) {
	t.Parallel()
	hold := &holdSpy{}
	made := false
	err := admitter(t, &worktreeSpy{head: "c1", clean: true}, hold).Make(context.Background(),
		admit.Request{Pin: &admit.Pin{Input: "rev", Source: "git.revision", Commit: "c2"}},
		func(context.Context) { made = true }, ignored)
	if takes, _ := hold.state(); err == nil || made || len(takes) > 0 {
		t.Errorf("error %v, made %v, holds taken %v; want refused, not made, none taken", err, made, takes)
	}
}

// failingWorktree answers every fact with its error.
type failingWorktree struct{ err error }

func (f failingWorktree) Head(context.Context) (string, error)    { return "", f.err }
func (f failingWorktree) Clean(context.Context) (bool, error)     { return false, f.err }
func (f failingWorktree) Content(context.Context) (string, error) { return "", f.err }

// A fact or a hold that cannot be told refuses the call, with its words.
func TestAFactOrAHoldThatCannotBeToldRefusesTheCall(t *testing.T) {
	t.Parallel()
	broken := errors.New("broken")
	pin := &admit.Pin{Input: "rev", Source: "git.revision", Commit: "c1"}
	for name, c := range map[string]struct {
		worktree admit.Worktree
		hold     error
		request  admit.Request
		refused  string
	}{
		"HEAD":  {failingWorktree{broken}, nil, admit.Request{Pin: pin}, "the worktree's HEAD: broken"},
		"clean": {failingWorktree{broken}, nil, admit.Request{Clean: true}, "whether the worktree is clean: broken"},
		"hold":  {&worktreeSpy{}, broken, admit.Request{}, "the worktree's hold: broken"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			made := false
			err := admitter(t, c.worktree, &holdSpy{err: c.hold}).Make(context.Background(), c.request, func(context.Context) { made = true }, ignored)
			if err == nil || err.Error() != c.refused || made {
				t.Errorf("error %v, made %v; want %q, not made", err, made, c.refused)
			}
		})
	}
}

// admit.feature, "The hold is released when the call ends": held while
// the call is made, released once it ends, a call that panics included.
func TestTheHoldIsReleasedWhenTheCallEnds(t *testing.T) {
	t.Parallel()
	for name, ends := range map[string]func(ctx context.Context, cancel context.CancelFunc) string{
		"completes": func(context.Context, context.CancelFunc) string { return "completed" },
		"fails":     func(context.Context, context.CancelFunc) string { return "failed" },
		"is cancelled": func(ctx context.Context, cancel context.CancelFunc) string {
			cancel()
			<-ctx.Done()
			return "cancelled"
		},
		"panics": func(context.Context, context.CancelFunc) string { panic("the call panics") },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			hold := &holdSpy{}
			heldDuring := 0
			func() {
				defer func() { _ = recover() }()
				err := admitter(t, &worktreeSpy{}, hold).Make(ctx, admit.Request{Writer: true}, func(ctx context.Context) {
					_, heldDuring = hold.state()
					ends(ctx, cancel)
				}, ignored)
				if err != nil {
					t.Error(err)
				}
			}()
			if _, held := hold.state(); heldDuring != 1 || held != 0 {
				t.Errorf("held %d while made, %d after; want 1, then none", heldDuring, held)
			}
		})
	}
}

// An admitter is given its worktree and its hold; one missing fails at
// construction.
func TestNewFailsWithoutACollaborator(t *testing.T) {
	t.Parallel()
	if _, err := admit.New(nil, &holdSpy{}); err == nil {
		t.Error("New with no worktree gave no error")
	}
	if _, err := admit.New(&worktreeSpy{}, nil); err == nil {
		t.Error("New with no hold gave no error")
	}
}

// admit.feature, "An admitted call's worktree is told, read under its
// hold": once, the content as the call left it, a call cancelled
// included, and before the hold is released.
func TestAnAdmittedCallsWorktreeIsToldReadUnderItsHold(t *testing.T) {
	t.Parallel()
	for name, ends := range map[string]func(ctx context.Context, cancel context.CancelFunc){
		"completes": func(context.Context, context.CancelFunc) {},
		"is cancelled": func(ctx context.Context, cancel context.CancelFunc) {
			cancel()
			<-ctx.Done()
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			asked := &trail{}
			worktree := &worktreeSpy{head: "c1", clean: true, content: "t1", trail: asked}
			told := &toldSpy{trail: asked}
			err := admitter(t, worktree, &holdSpy{trail: asked}).Make(ctx, admit.Request{Writer: true}, func(ctx context.Context) {
				worktree.content = "t2"
				ends(ctx, cancel)
			}, told.told)
			if err != nil {
				t.Fatal(err)
			}
			if want := []admit.Facts{{Head: "c1", Content: "t2"}}; !slices.Equal(told.facts, want) {
				t.Errorf("told %+v, want %+v", told.facts, want)
			}
			if got, want := asked.all(), []string{"take", "head", "content", "told", "release"}; !slices.Equal(got, want) {
				t.Errorf("asked %q, want %q", got, want)
			}
		})
	}
}

// admit.feature, "A refused call's worktree is not told": a call refused
// at any check, its content not read either.
func TestARefusedCallsWorktreeIsNotTold(t *testing.T) {
	t.Parallel()
	for name, c := range map[string]struct {
		request admit.Request
		hold    error
	}{
		"not clean": {admit.Request{Clean: true}, nil},
		"pinned to another commit": {admit.Request{Pin: &admit.Pin{Input: "rev", Source: "git.revision", Commit: "c2"}},
			nil},
		"held": {admit.Request{}, fmt.Errorf("/l/k.lock: %w", admit.ErrHeld)},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			asked := &trail{}
			told := &toldSpy{trail: asked}
			worktree := &worktreeSpy{head: "c1", clean: false, content: "t1", trail: asked}
			err := admitter(t, worktree, &holdSpy{err: c.hold, trail: asked}).Make(context.Background(), c.request,
				func(context.Context) {}, told.told)
			if err == nil {
				t.Fatal("the call was admitted, want refused")
			}
			if got := asked.all(); len(told.facts) > 0 || slices.Contains(got, "content") {
				t.Errorf("told %+v, asked %q; want nothing told, no content read", told.facts, got)
			}
		})
	}
}

// admit.feature, "A fact that cannot be read is told empty", for each
// fact: the call is made, and the other fact told as it is.
func TestAFactThatCannotBeReadIsToldEmpty(t *testing.T) {
	t.Parallel()
	broken := errors.New("broken")
	for name, c := range map[string]struct {
		headErr, contentErr error
		want                admit.Facts
	}{
		"HEAD":    {broken, nil, admit.Facts{Content: "t1"}},
		"content": {nil, broken, admit.Facts{Head: "c1"}},
		"both":    {broken, broken, admit.Facts{}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			told := &toldSpy{}
			worktree := &worktreeSpy{head: "c1", content: "t1", headErr: c.headErr, contentErr: c.contentErr}
			made := false
			err := admitter(t, worktree, &holdSpy{}).Make(context.Background(), admit.Request{},
				func(context.Context) { made = true }, told.told)
			if err != nil || !made {
				t.Fatalf("error %v, made %v; want admitted and made", err, made)
			}
			if want := []admit.Facts{c.want}; !slices.Equal(told.facts, want) {
				t.Errorf("told %+v, want %+v", told.facts, want)
			}
		})
	}
}
