package flow

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
)

type storageSpy struct {
	state            State
	loadErr, saveErr error
	saves            int
}

func (s *storageSpy) Load() (State, error) { return s.state, s.loadErr }
func (s *storageSpy) Save(v State) error {
	s.saves++
	if s.saveErr != nil {
		return s.saveErr
	}
	s.state = v
	return nil
}

type activitySpy struct {
	apply   func(Session, Command) (*Snapshot, error)
	explain func(Session, Question) (Explanation, error)
}

func (a activitySpy) Apply(_ context.Context, s Session, c Command) (*Snapshot, error) {
	return a.apply(s, c)
}
func (a activitySpy) Explain(_ context.Context, s Session, q Question) (Explanation, error) {
	return a.explain(s, q)
}
func advancing(s Session, _ Command) (*Snapshot, error) {
	s.Step++
	return &Snapshot{Result: &Result{Session: s}}, nil
}

func TestServicePreservesCommittedStateOnActionAndStorageFailures(t *testing.T) {
	t.Parallel()
	for _, failure := range []string{"activity", "storage"} {
		t.Run(failure, func(t *testing.T) {
			t.Parallel()
			state := InitialState()
			state.Current.Page = n(2)
			state.Current.History = []Place{{Screen: "programs"}}
			disk := &storageSpy{state: state}
			failed := false
			a := activitySpy{apply: func(s Session, c Command) (*Snapshot, error) {
				if !failed {
					failed = true
					*s.Page = 99
					s.History[0].Screen = "damaged"
					if failure == "activity" {
						return nil, errors.New("content failed")
					}
				}
				return advancing(s, c)
			}}
			if failure == "storage" {
				disk.saveErr = errors.New("disk full")
			}
			service, err := NewService(a, disk)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = service.Apply(context.Background(), Command{}); err == nil {
				t.Fatal("failure accepted")
			}
			disk.saveErr = nil
			service.activity = activitySpy{apply: func(s Session, c Command) (*Snapshot, error) {
				if s.Step != 0 || *s.Page != 2 || s.History[0].Screen != "programs" {
					t.Fatalf("failed action mutated state: %+v", s)
				}
				return advancing(s, c)
			}}
			result, err := service.Apply(context.Background(), Command{Revision: n(0)})
			if err != nil || result.Result.Session.Step != 1 {
				t.Fatalf("retry: %+v %v", result, err)
			}
		})
	}
}
func TestServiceSerializesSimultaneousActionsAndRejectsTheLoser(t *testing.T) {
	t.Parallel()
	disk := &storageSpy{state: InitialState()}
	entered, release := make(chan struct{}), make(chan struct{})
	calls := 0
	a := activitySpy{apply: func(s Session, c Command) (*Snapshot, error) {
		calls++
		close(entered)
		<-release
		return advancing(s, c)
	}}
	service, err := NewService(a, disk)
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan error, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, e := service.Apply(context.Background(), Command{Revision: n(0)})
		results <- e
	}()
	<-entered
	go func() {
		defer wg.Done()
		_, e := service.Apply(context.Background(), Command{Revision: n(0)})
		results <- e
	}()
	close(release)
	wg.Wait()
	first, second := <-results, <-results
	if !((first == nil && errors.Is(second, ErrStale)) || (second == nil && errors.Is(first, ErrStale))) || calls != 1 || disk.saves != 1 {
		t.Fatalf("%v %v calls=%d saves=%d", first, second, calls, disk.saves)
	}
}
func TestServiceRejectsInvalidStorageAndMissingCollaborators(t *testing.T) {
	t.Parallel()
	for _, disk := range []*storageSpy{{loadErr: errors.New("read failure")}, {state: State{Version: 7}}, {state: State{Version: 1, Current: Session{Place: Place{Screen: "entity"}}}}} {
		if _, err := NewService(activitySpy{}, disk); err == nil {
			t.Fatal("invalid state accepted")
		}
	}
	if _, err := NewService(nil, &storageSpy{}); err == nil {
		t.Fatal("missing activity")
	}
	if _, err := NewService(activitySpy{}, nil); err == nil {
		t.Fatal("missing storage")
	}
}
func TestExplanationUsesCurrentSessionWithoutWritingIt(t *testing.T) {
	t.Parallel()
	disk := &storageSpy{state: InitialState()}
	q := Question{Kind: "simpler", MaterialID: "lecture", MaterialRevision: "rev", Reference: "ref", Text: "why", Revision: 0}
	called := 0
	service, err := NewService(activitySpy{explain: func(s Session, got Question) (Explanation, error) {
		called++
		if !reflect.DeepEqual(s, disk.state.Current) || got != q {
			t.Fatalf("%+v %+v", s, got)
		}
		return Explanation{Available: false, Paragraph: Paragraph{Text: "source"}}, nil
	}}, disk)
	if err != nil {
		t.Fatal(err)
	}
	answer, err := service.Explain(context.Background(), q)
	if err != nil || answer.Available || answer.Paragraph.Text != "source" || disk.saves != 0 {
		t.Fatalf("%+v %v saves=%d", answer, err, disk.saves)
	}
	q.Revision = 1
	if _, err = service.Explain(context.Background(), q); !errors.Is(err, ErrStale) || called != 1 {
		t.Fatalf("%v calls=%d", err, called)
	}
}
func TestParagraphContextBelongsToRevisionAndExplanationsAreUnavailable(t *testing.T) {
	t.Parallel()
	r := setup()
	makeMaterial(r)
	r.content = "# Title\n\nSame.\n\nSame.\n\n## Section\n\n- one\n- two"
	f := Flow{Reader: r, PageSize: 1000}
	first := act(t, f, entityState("material-id"), "")
	c := first.Context
	if len(c.Paragraphs) != 2 || c.Paragraphs[0].Text != "Same." || c.Paragraphs[0].Reference == c.Paragraphs[1].Reference {
		t.Fatalf("context %+v", c)
	}
	repeat := act(t, f, first.Session, "")
	if !reflect.DeepEqual(c, repeat.Context) {
		t.Fatal("references changed within revision")
	}
	for _, kind := range []string{"more", "simpler", "example", "ask"} {
		q := Question{Kind: kind, MaterialID: "material-id", MaterialRevision: c.Revision, Reference: c.Paragraphs[1].Reference, Text: "untrusted browser quote"}
		got, err := f.Explain(context.Background(), first.Session, q)
		if err != nil || got.Available || got.Paragraph.Text != "Same." || got.MaterialRevision != c.Revision {
			t.Fatalf("%+v %v", got, err)
		}
		q.Reference = "invented"
		if _, err = f.Explain(context.Background(), first.Session, q); !errors.Is(err, ErrInvalid) {
			t.Fatalf("bad ref: %v", err)
		}
	}
	r.content += "\n\nChanged."
	q := Question{Kind: "more", MaterialID: "material-id", MaterialRevision: c.Revision, Reference: c.Paragraphs[0].Reference}
	if _, err := f.Explain(context.Background(), first.Session, q); !errors.Is(err, ErrStale) {
		t.Fatalf("changed revision: %v", err)
	}
	r.err = errors.New("content unavailable")
	if _, err := f.Explain(context.Background(), first.Session, q); !errors.Is(err, r.err) {
		t.Fatalf("%v", err)
	}
}

func TestReferencesNameSourceFragmentsAfterMetadataAndRepeatedHeadingText(t *testing.T) {
	t.Parallel()
	r := setup()
	makeMaterial(r)
	r.content = "---\nquote: Same.\n---\n\n# Same.\n\nSame.\n\nSame."
	result := act(t, Flow{Reader: r, PageSize: 1000}, entityState("material-id"), "")
	paragraphs := result.Context.Paragraphs
	for i, want := range []int{strings.Index(r.content, "\n\nSame.") + 2, strings.LastIndex(r.content, "Same.")} {
		expected := fmt.Sprintf("%s:%d", result.Context.Revision, want)
		if paragraphs[i].Reference != expected {
			t.Fatalf("reference %q want %q", paragraphs[i].Reference, expected)
		}
	}
	// A paragraph that stays whole keeps its identity when the page budget changes.
	smaller := act(t, Flow{Reader: r, PageSize: 10}, Session{Place: Place{Screen: "entity", EntityID: "material-id", Page: n(1)}}, "")
	if smaller.Context.Paragraphs[0].Reference != paragraphs[0].Reference {
		t.Fatalf("page budget changed source reference: %+v", smaller.Context)
	}
}
func TestServiceRejectsChangedMaterialAndInvalidActivityResultWithoutSaving(t *testing.T) {
	t.Parallel()
	state := InitialState()
	state.Current.Place = Place{Screen: "entity", EntityID: "m"}
	state.Current.MaterialRevision = "old"
	for _, invalid := range []bool{false, true} {
		disk := &storageSpy{state: state}
		activity := activitySpy{apply: func(s Session, c Command) (*Snapshot, error) {
			if invalid {
				return &Snapshot{}, nil
			}
			s.MaterialRevision = "new"
			return &Snapshot{Result: &Result{Session: s}}, nil
		}}
		service, err := NewService(activity, disk)
		if err != nil {
			t.Fatal(err)
		}
		_, err = service.Apply(context.Background(), Command{Revision: n(0), Action: "next"})
		if err == nil || (!invalid && !errors.Is(err, ErrStale)) || disk.saves != 0 {
			t.Fatalf("%v saves=%d", err, disk.saves)
		}
	}
}
func TestActivityRequiresReaderAndPositivePageBudget(t *testing.T) {
	t.Parallel()
	if _, err := New(nil, 1000); err == nil {
		t.Fatal("missing content")
	}
	if _, err := New(setup(), 0); err == nil {
		t.Fatal("invalid page budget")
	}
}

func TestDirectReadingUsesContentCollaboratorOnceAndOwnsTheReturnPath(t *testing.T) {
	t.Parallel()
	r := setup()
	makeMaterial(r)
	result, err := (Flow{Reader: r, PageSize: 1000}).Apply(context.Background(), InitialSession(), Command{Target: "entity", ID: "material-id"})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(r.calls, []string{"entity material-id", "materialContent material-id"}) || result.Result.Context.MaterialID != "material-id" || result.Result.Session.History[0].Screen != "programs" {
		t.Fatalf("calls=%v snapshot=%+v", r.calls, result)
	}
}

func TestCanceledActionsNeverPublishOrPersistWork(t *testing.T) {
	t.Parallel()
	for _, cancelBefore := range []bool{false, true} {
		ctx, cancel := context.WithCancel(context.Background())
		disk := &storageSpy{state: InitialState()}
		calls := 0
		service, err := NewService(activitySpy{apply: func(s Session, c Command) (*Snapshot, error) { calls++; cancel(); return advancing(s, c) }}, disk)
		if err != nil {
			t.Fatal(err)
		}
		if cancelBefore {
			cancel()
		}
		_, err = service.Apply(ctx, Command{})
		if !errors.Is(err, context.Canceled) || disk.saves != 0 || cancelBefore && calls != 0 || !cancelBefore && calls != 1 {
			t.Fatalf("%v calls=%d saves=%d", err, calls, disk.saves)
		}
	}
}

func TestStoredPageCountsMustContainTheSavedPage(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		count int
		page  *int
	}{{0, n(0)}, {-1, n(0)}, {2, nil}, {2, n(2)}, {2, n(-1)}} {
		state := InitialState()
		state.Current.Place = Place{Screen: "entity", EntityID: "m", Page: tc.page}
		state.Current.PageCount = n(tc.count)
		if err := ValidateState(state); err == nil {
			t.Fatalf("invalid page count accepted: %+v", state.Current)
		}
	}
}
