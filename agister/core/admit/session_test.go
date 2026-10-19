package admit_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/admit"
)

// notAsLeft is the refusal of a worktree not as the session's latest call
// left it.
const notAsLeft = "the worktree is not as the session's latest call left it"

// session.feature, "The worktree is checked against what was left", over
// a worktree at HEAD "c1" and of the content "t1"; and a content that
// cannot be read refuses the call, with its words.
func TestTheWorktreeIsCheckedAgainstWhatWasLeft(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name       string
		left       admit.Facts
		contentErr error
		refused    string
	}{
		{"as left", admit.Facts{EndHead: "c1", Content: "t1"}, nil, ""},
		{"another HEAD", admit.Facts{EndHead: "c2", Content: "t1"}, nil, `HEAD is "c1", not the session's latest call's "c2"`},
		{"another content", admit.Facts{EndHead: "c1", Content: "t2"}, nil, notAsLeft},
		{"no content left", admit.Facts{EndHead: "c1"}, nil, notAsLeft},
		{"no HEAD left", admit.Facts{Content: "t1"}, nil, notAsLeft},
		{"a content that cannot be read", admit.Facts{EndHead: "c1", Content: "t1"}, errors.New("broken"), "the worktree's content: broken"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			hold := &holdSpy{}
			made := false
			worktree := &worktreeSpy{head: "c1", clean: true, content: "t1", contentErr: c.contentErr}
			err := admitter(t, worktree, hold).Make(context.Background(), admit.Request{Left: &c.left},
				func(context.Context) { made = true }, ignored)
			takes, _ := hold.state()
			switch {
			case c.refused == "" && (err != nil || !made || len(takes) != 1):
				t.Errorf("error %v, made %v, holds taken %v; want admitted, held and made", err, made, takes)
			case c.refused != "" && (err == nil || err.Error() != c.refused || made || len(takes) > 0):
				t.Errorf("error %v, made %v, holds taken %v; want refused, %q, not held, not made", err, made, takes, c.refused)
			}
		})
	}
}

// session.feature, "A pin is checked first".
func TestAPinIsCheckedFirst(t *testing.T) {
	t.Parallel()
	request := admit.Request{Pin: &admit.Pin{Input: "rev", Source: "git.revision", Commit: "c2"}, Left: &admit.Facts{EndHead: "c3", Content: "t1"}}
	err := admitter(t, &worktreeSpy{head: "c1", content: "t1"}, &holdSpy{}).Make(context.Background(), request,
		func(context.Context) {}, ignored)
	if want := `HEAD is "c1", not the pinned "c2"`; err == nil || err.Error() != want {
		t.Errorf("error %v, want %q", err, want)
	}
}

// session.feature, "A call refused so takes no hold and starts nothing":
// its checks are made before the hold, and the port is told nothing.
func TestACallRefusedSoTakesNoHoldAndStartsNothing(t *testing.T) {
	t.Parallel()
	asked := &trail{}
	told := &toldSpy{trail: asked}
	worktree := &worktreeSpy{head: "c1", content: "t1", trail: asked}
	err := admitter(t, worktree, &holdSpy{trail: asked}).Make(context.Background(), admit.Request{Left: &admit.Facts{EndHead: "c2", Content: "t1"}},
		func(context.Context) { asked.add("made") }, told.told)
	if err == nil {
		t.Fatal("the call was admitted, want refused")
	}
	if got := asked.all(); !slices.Equal(got, []string{"head"}) || len(told.facts) > 0 {
		t.Errorf("asked %q, told %+v; want HEAD alone asked, nothing told", got, told.facts)
	}
}

// A call continuing a session, as left, has its HEAD and content checked
// before its hold, and is then admitted as any call is.
func TestASessionsWorktreeIsCheckedBeforeTheHold(t *testing.T) {
	t.Parallel()
	asked := &trail{}
	worktree := &worktreeSpy{head: "c1", content: "t1", trail: asked}
	err := admitter(t, worktree, &holdSpy{trail: asked}).Make(context.Background(), admit.Request{Left: &admit.Facts{EndHead: "c1", Content: "t1"}},
		func(context.Context) { asked.add("made") }, ignored)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := asked.all(), []string{"head", "content", "take", "head", "made", "head", "content", "release"}; !slices.Equal(got, want) {
		t.Errorf("asked %q, want %q", got, want)
	}
}
