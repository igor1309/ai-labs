package admit_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/igor1309/ai-labs/agister/core/admit"
)

// admit.feature, "A pinned call's patch is told, asked under its hold".
func TestAPinnedCallsPatchIsToldUnderItsHold(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name                   string
		pinned                 bool
		patch                  string
		contentErr, changesErr error
		why                    string
	}{
		{name: "patch", pinned: true, patch: "d1"},
		{name: "empty patch", pinned: true},
		{name: "changes unavailable", pinned: true, changesErr: errors.New("diff failed"), why: "diff failed"},
		{name: "content unavailable", pinned: true, contentErr: errors.New("tree failed"), why: "tree failed"},
		{name: "unpinned", patch: "d1"},
	} {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			asked := &trail{}
			worktree := &worktreeSpy{head: "c1", content: "t2", patch: c.patch, contentErr: c.contentErr, changesErr: c.changesErr, trail: asked}
			request := admit.Request{}
			if c.pinned {
				request.Pin = &admit.Pin{Input: "rev", Source: "git.revision", Commit: "c1"}
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			var got admit.Facts
			err := admitter(t, worktree, &holdSpy{trail: asked}).Make(ctx, request, func(context.Context) { cancel() }, func(f admit.Facts) { got = f; asked.add("told") })
			if err != nil {
				t.Fatal(err)
			}
			if c.pinned && c.why == "" {
				if got.Patch == nil || *got.Patch != c.patch {
					t.Errorf("patch %v, want %q", got.Patch, c.patch)
				}
			} else if got.Patch != nil {
				t.Errorf("patch %v, want none", got.Patch)
			}
			if c.why == "" && got.PatchError != "" || c.why != "" && !strings.Contains(got.PatchError, c.why) {
				t.Errorf("patch error %q, want %q", got.PatchError, c.why)
			}
			want := []string{"take", "head", "head", "content"}
			if c.pinned {
				want = append([]string{"head"}, want...)
			}
			if c.pinned && c.contentErr == nil {
				want = append(want, "changes c1 t2")
			}
			want = append(want, "told", "release")
			if got := asked.all(); !slices.Equal(got, want) {
				t.Errorf("asked %q, want %q", got, want)
			}
		})
	}
}

// The final HEAD is independent of the admitted HEAD and final content.
func TestAnUnreadableFinalHeadIsToldEmpty(t *testing.T) {
	t.Parallel()
	worktree := &worktreeSpy{head: "c1", content: "t2", patch: "d1"}
	var got admit.Facts
	err := admitter(t, worktree, &holdSpy{}).Make(context.Background(), admit.Request{Pin: &admit.Pin{Commit: "c1"}}, func(context.Context) { worktree.headErr = errors.New("HEAD unreadable") }, func(f admit.Facts) { got = f })
	if err != nil {
		t.Fatal(err)
	}
	if got.Head != "c1" || got.EndHead != "" || got.Content != "t2" || got.Patch == nil || *got.Patch != "d1" {
		t.Errorf("facts %+v", got)
	}
}
