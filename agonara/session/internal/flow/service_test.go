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
func (a activitySpy) Enrich(context.Context, *Snapshot) error { return nil }
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
			state.Current.Place = Place{Screen: "entity", EntityID: "m", Title: "Committed", Page: n(2)}
			state.Current.PageCount = n(100)
			state.Current.MaterialRevision = "source"
			state.Current.Items = []Item{{ID: "linked", Title: "Linked", Kind: "concept"}}
			state.Resume = &Bookmark{ProgramID: "p", EntityID: "m", Title: "Committed", Page: 2, Position: &Position{Section: n(1), Label: "Section", Index: 1, Count: 99}, Course: &Item{ID: "t", Title: "Topic", Kind: "topic"}, Courses: []Item{{ID: "t", Title: "Topic", Kind: "topic"}}}
			state.Current.History = []Place{{Screen: "programs"}}
			disk := &storageSpy{state: state}
			failed := false
			injected := errors.New("injected failure")
			a := activitySpy{apply: func(s Session, c Command) (*Snapshot, error) {
				if !failed {
					failed = true
					*s.Page = 99
					s.History[0].Screen = "program"
					s.History[0].ProgramID = "candidate"
					if failure == "activity" {
						return nil, injected
					}
				}
				result, err := advancing(s, c)
				result.Result.Context = &ReadingContext{MaterialID: "m", Program: &Program{ID: "other"}, Course: &Item{ID: "other-topic"}, Courses: []Item{{ID: "other-topic"}}}
				result.Result.View = View{Title: "Candidate", Page: &PageInfo{Index: 99, Count: 100}, Position: &Position{Index: 98, Count: 99}}
				return result, err
			}}
			if failure == "storage" {
				disk.saveErr = injected
			}
			service, err := NewService(a, disk)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = service.Apply(context.Background(), Command{}); !errors.Is(err, injected) {
				t.Fatalf("wrong error: %v", err)
			}

			expectedSaves := 0
			if failure == "storage" {
				expectedSaves = 1
			}
			if disk.saves != expectedSaves || !reflect.DeepEqual(disk.state, state) || !reflect.DeepEqual(service.state, state) {
				t.Fatalf("failed work published: saves=%d disk=%+v memory=%+v", disk.saves, disk.state, service.state)
			}
			disk.saveErr = nil
			service.activity = activitySpy{apply: func(s Session, c Command) (*Snapshot, error) {
				if s.Step != 0 || *s.Page != 2 || s.History[0].Screen != "programs" {
					t.Fatalf("failed action mutated state: %+v", s)
				}
				return advancing(s, c)
			}}
			result, err := service.Apply(context.Background(), Command{Revision: n(0)})
			if err != nil || result.Session.Step != 1 {
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
	for _, disk := range []*storageSpy{{loadErr: errors.New("read failure")}, {state: State{Current: Session{Step: -1}}}, {state: State{Current: Session{Place: Place{Screen: "entity"}}}}} {
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

func TestValidateStateOwnsReadingSemantics(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name   string
		change func(*State)
		want   string
	}{
		{"initial", func(*State) {}, ""},
		{"revision", func(s *State) { s.Current.Step = -1 }, "invalid reading revision"},
		{"screen", func(s *State) { s.Current.Screen = "unknown" }, "invalid reading place"},
		{"program identity", func(s *State) { s.Current.Screen = "program" }, "invalid reading place"},
		{"entity identity", func(s *State) { s.Current.Screen = "entity" }, "invalid reading place"},
		{"negative page", func(s *State) { s.Current.Page = n(-1) }, "invalid reading place"},
		{"history identity", func(s *State) { s.Current.History = []Place{{Screen: "program"}} }, "invalid reading history"},
		{"history page", func(s *State) { s.Current.History = []Place{{Screen: "entity", EntityID: "m", Page: n(-1)}} }, "invalid reading history"},
		{"bookmark identity", func(s *State) { s.Resume = &Bookmark{} }, "invalid reading bookmark"},
		{"bookmark page", func(s *State) { s.Resume = &Bookmark{EntityID: "m", Page: -1} }, "invalid reading bookmark"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			state := InitialState()
			tc.change(&state)
			err := ValidateState(state)
			if tc.want == "" {
				if err != nil {
					t.Fatal(err)
				}
			} else if err == nil || err.Error() != tc.want {
				t.Fatalf("validation: %v, want %s", err, tc.want)
			}
		})
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

type failingSupplementaryReader struct {
	base    *fakeReader
	calls   []string
	failure string
	err     error
}

func (r *failingSupplementaryReader) ListPrograms(ctx context.Context) ([]CatalogEntry, error) {
	r.calls = append(r.calls, "catalog")
	return r.base.ListPrograms(ctx)
}
func (r *failingSupplementaryReader) Navigation(ctx context.Context, id string) (Navigation, error) {
	r.calls = append(r.calls, "navigation "+id)
	if r.failure == "navigation" {
		return Navigation{}, r.err
	}
	return r.base.Navigation(ctx, id)
}
func (r *failingSupplementaryReader) Entity(ctx context.Context, id string) (Entity, error) {
	r.calls = append(r.calls, "entity "+id)
	if id == "topic-id" {
		return Entity{}, r.err
	}
	return r.base.Entity(ctx, id)
}
func (r *failingSupplementaryReader) MaterialContent(ctx context.Context, id string) (string, error) {
	r.calls = append(r.calls, "content "+id)
	return r.base.MaterialContent(ctx, id)
}

func TestEssentialActionsAvoidSupplementaryFailuresAndWebQueriesRemainTransactional(t *testing.T) {
	t.Parallel()
	for _, scenario := range []string{"catalog", "program", "reading"} {
		t.Run(scenario, func(t *testing.T) {
			t.Parallel()
			base := setup()
			makeMaterial(base)
			base.node.ProgramID = "program-a"
			base.node.Parents = []Item{{ID: "topic-id", Title: "Vectors", Kind: "topic"}}
			base.content = "# First\n\nOne.\n\n## Second\n\nTwo."
			injected := errors.New("supplement unavailable")
			reader := &failingSupplementaryReader{base: base, err: injected}
			command := Command{Target: "programs"}
			essential := []string{"catalog"}
			supplementary := []string{"catalog", "navigation program-a"}
			switch scenario {
			case "catalog":
				reader.failure = "navigation"
			case "program":
				command = Command{Target: "program", ID: "program-a"}
				essential = []string{"navigation program-a"}
				supplementary = []string{"navigation program-a", "catalog", "navigation program-a", "entity topic-id"}
			case "reading":
				command = Command{Target: "entity", ID: "material-id", Page: n(1)}
				essential = []string{"entity material-id", "content material-id"}
				supplementary = []string{"entity material-id", "content material-id", "catalog", "navigation program-a", "entity topic-id"}
			}
			disk := &storageSpy{state: InitialState()}
			service, err := NewService(Flow{Reader: reader, PageSize: 1000}, disk)
			if err != nil {
				t.Fatal(err)
			}
			got, err := service.Apply(context.Background(), command)
			if err != nil || got == nil || !reflect.DeepEqual(reader.calls, essential) || disk.saves != 1 {
				t.Fatalf("essential action: %+v %v calls=%v saves=%d", got, err, reader.calls, disk.saves)
			}
			if scenario == "reading" {
				if got.View.Page.Index != 1 || disk.state.Resume.EntityID != "material-id" || disk.state.Resume.Course.ID != "topic-id" || !reflect.DeepEqual(got.Session.History, []Place{{Screen: "programs"}, {Screen: "program", ProgramID: "program-a"}, {Screen: "entity", EntityID: "topic-id"}}) {
					t.Fatalf("reading semantics: %+v", got)
				}
			}
			expectedSaves := 1
			if scenario == "reading" {
				reader.calls = nil
				moved, err := service.Apply(context.Background(), Command{Action: "prev", Revision: n(got.Session.Step)})
				if err != nil || moved.View.Page.Index != 0 || !reflect.DeepEqual(reader.calls, essential) {
					t.Fatalf("paging fetched unrelated content: %+v %v %v", moved, err, reader.calls)
				}
				expectedSaves++
			}
			committed := cloneState(disk.state)
			reader.calls = nil
			_, err = service.Open(context.Background(), command)
			if !errors.Is(err, injected) || disk.saves != expectedSaves || !reflect.DeepEqual(service.state, committed) || !reflect.DeepEqual(disk.state, committed) || !reflect.DeepEqual(reader.calls, supplementary) {
				t.Fatalf("supplement failure: %v calls=%v saves=%d state=%+v", err, reader.calls, disk.saves, service.state)
			}
		})
	}
}

func TestSupplementaryOutlinePreservesDuplicatePlacementsBookmarkAndDirectReturnPath(t *testing.T) {
	t.Parallel()
	reader := newTree()
	reader.entities["t2"] = Entity{ID: "t2", Children: []Item{{ID: "m1", Title: "Lecture", Kind: material}}}
	reader.entities["m1"] = Entity{ID: "m1", ProgramID: "p", Title: "Lecture", Kind: material, Readable: true, Parents: []Item{{ID: "t2", Title: "Checks", Kind: "topic"}, {ID: "t1", Title: "What an agent is", Kind: "topic"}}}
	reader.content = "# Intro\n\nText.\n\n## Section\n\nMore text."
	disk := &storageSpy{state: InitialState()}
	service, err := NewService(Flow{Reader: reader, PageSize: 1000}, disk)
	if err != nil {
		t.Fatal(err)
	}
	opened, err := service.Open(context.Background(), Command{Target: "entity", ID: "m1", Page: n(1)})
	if err != nil {
		t.Fatal(err)
	}
	wantCourses := []Item{{ID: "t1", Title: "What an agent is", Kind: "topic"}, {ID: "t2", Title: "Checks", Kind: "topic"}}
	if opened.Result.Context.Program.Title != "Agents" || !reflect.DeepEqual(opened.Resume.Courses, wantCourses) || opened.Resume.Course.ID != "t1" || !reflect.DeepEqual(opened.Result.Session.History, []Place{{Screen: "programs"}, {Screen: "program", ProgramID: "p", Title: "Agents"}, {Screen: "entity", EntityID: "t1"}}) {
		t.Fatalf("outline/bookmark/path: %+v %+v", opened.Result, opened.Resume)
	}
	bookmark := cloneBookmark(opened.Resume)
	if _, err = service.Apply(context.Background(), Command{Action: "programs"}); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(disk.state.Resume, bookmark) {
		t.Fatalf("browsing changed bookmark: %+v", disk.state.Resume)
	}
	resumed, err := service.Open(context.Background(), Command{Target: "entity", ID: "m1"})
	if err != nil || resumed.Result.View.Page.Index != 0 {
		t.Fatalf("direct link from browsing: %+v %v", resumed, err)
	}
	back, err := service.Apply(context.Background(), Command{Action: "back"})
	if err != nil || back.Session.EntityID != "t1" {
		t.Fatalf("return to course: %+v %v", back, err)
	}
	back, err = service.Apply(context.Background(), Command{Action: "back"})
	if err != nil || back.Session.ProgramID != "p" || back.View.Title != "Agents" {
		t.Fatalf("return to program: %+v %v", back, err)
	}
}
