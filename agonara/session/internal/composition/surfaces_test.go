package composition

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agonara/session/internal/agonara"
	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
	"github.com/igor1309/ai-labs/agonara/session/internal/telegram"
	"github.com/igor1309/ai-labs/agonara/session/internal/web"
)

type sessionSpy struct {
	command  flow.Command
	question flow.Question
	snapshot *flow.Snapshot
	err      error
}

func (s *sessionSpy) Apply(_ context.Context, q flow.Command) (*flow.Result, error) {
	s.command = q
	if s.snapshot == nil {
		return nil, s.err
	}
	return s.snapshot.Result, s.err
}
func (s *sessionSpy) Open(ctx context.Context, q flow.Command) (*flow.Snapshot, error) {
	s.command = q
	return s.snapshot, s.err
}
func (s *sessionSpy) Explain(_ context.Context, q flow.Question) (flow.Explanation, error) {
	s.question = q
	return flow.Explanation{Available: false}, s.err
}
func number(n int) *int { return &n }
func TestSurfaceAdaptersTranslateTheirOwnRequestsAndViews(t *testing.T) {
	t.Parallel()
	spy := &sessionSpy{snapshot: &flow.Snapshot{Result: &flow.Result{
		Session: flow.Session{Place: flow.Place{Screen: "entity", EntityID: "m"}, Step: 8, Items: []flow.Item{{ID: "child", Title: "Linked", Kind: "concept"}}}, Kind: "material_reference",
		View:    flow.View{Contents: []flow.ContentsEntry{{ActionID: "jump-unrelated", Page: 2, Label: "Jump"}}, Title: "Lecture", Markdown: "Exact **text**.", Page: &flow.PageInfo{Index: 2, Count: 4}, Position: &flow.Position{Section: number(1), Label: "Section", Index: 1, Count: 3}, Lists: []flow.List{{Heading: "Materials", Entries: []flow.Entry{{ActionID: "choose-reading", Index: 0, Label: "Reading"}}}}},
		Actions: []flow.Action{{ID: "next", Kind: "page", Label: "Next"}},
		Context: &flow.ReadingContext{Revision: "source-rev", MaterialID: "m", Fragments: []flow.Fragment{{Reference: "source-ref", Source: "Exact **text**."}}, Sections: []flow.ContentsEntry{{Page: 1, N: number(1), Label: "Section", Count: 3, Current: true}}, Next: number(3), Program: &flow.Program{ID: "p", Courses: []flow.Course{{Topic: flow.Item{ID: "t"}, Concepts: []flow.Item{{ID: "c"}}, Materials: []flow.Item{{ID: "m"}}}}}},
	}, Resume: &flow.Bookmark{EntityID: "m", Page: 2, Position: &flow.Position{Count: 3}}}}
	page, err := (Web{spy}).Open(context.Background(), web.Request{Route: "entity", ID: "m", Page: number(2), Revision: number(7)})
	if err != nil {
		t.Fatal(err)
	}
	if spy.command.Target != "entity" || spy.command.ID != "m" || *spy.command.Page != 2 || *spy.command.Revision != 7 {
		t.Fatalf("command %+v", spy.command)
	}
	d := page.Document
	if d.MaterialRevision != "source-rev" || d.Fragments[0] != (web.SourceBlock{Reference: "source-ref", Markdown: "Exact **text**."}) || d.Markdown != "Exact **text**." || d.Program.Courses[0].ConceptCount != 1 || *d.Next != 3 || d.Sections[0].Count != 3 || page.Resume.Page != 2 {
		t.Fatalf("page %+v document %+v", page, d)
	}
	got, err := (Telegram{spy}).Show(context.Background(), telegram.Request{Action: "next", Revision: number(8)})
	if err != nil {
		t.Fatal(err)
	}
	if spy.command.Action != "next" || spy.command.Target != "" || *spy.command.Revision != 8 || got.Revision != 8 || got.View.Markdown != d.Markdown || got.View.Reading.Heading != "Section" || got.View.Lists[0].Entries[0].Label != "Reading" || got.View.Lists[0].Entries[0].ID != "choose-reading" || got.View.Contents[0].ActionID != "jump-unrelated" || got.Actions[0].ID != "next" {
		t.Fatalf("command %+v result %+v", spy.command, got)
	}
	question := web.Question{Kind: "ask", EntityID: "m", MaterialRevision: "source-rev", Reference: "source-ref", Revision: 8, Text: "Why?"}
	answer, err := (Web{spy}).Explain(context.Background(), question)
	want := flow.Question{Kind: "ask", MaterialID: "m", MaterialRevision: "source-rev", Reference: "source-ref", Revision: 8, Text: "Why?"}
	if err != nil || answer.Available || spy.question != want {
		t.Fatalf("%+v %+v %v", spy.question, answer, err)
	}
}
func TestAdaptersPropagateTechnicalFailuresAndTranslateStaleActions(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct{ in, webErr, tgErr error }{{flow.ErrStale, web.ErrStale, telegram.ErrStale}, {flow.ErrInvalid, web.ErrInvalid, flow.ErrInvalid}, {errors.New("disk"), nil, nil}} {
		spy := &sessionSpy{err: tc.in}
		wantWeb, wantTG := tc.webErr, tc.tgErr
		if wantWeb == nil {
			wantWeb = tc.in
			wantTG = tc.in
		}
		if _, err := (Web{spy}).Open(context.Background(), web.Request{}); !errors.Is(err, wantWeb) {
			t.Fatal(err)
		}
		if _, err := (Web{spy}).Explain(context.Background(), web.Question{}); !errors.Is(err, wantWeb) {
			t.Fatal(err)
		}
		if _, err := (Telegram{spy}).Show(context.Background(), telegram.Request{}); !errors.Is(err, wantTG) {
			t.Fatal(err)
		}
	}
}

type contentSpy struct {
	id  string
	err error
}

func (c *contentSpy) ListPrograms(context.Context) ([]agonara.Program, error) {
	return []agonara.Program{{ProgramID: "p", Title: "Program", Description: "Description"}}, c.err
}
func (c *contentSpy) Navigation(_ context.Context, id string) (agonara.Navigation, error) {
	c.id = id
	return agonara.Navigation{Topics: []agonara.Node{{EntityID: "t", Title: "Topic", AcceptedKind: "topic"}}, UngroupedConcepts: []agonara.Node{{EntityID: "ungrouped-c", Title: "Ungrouped concept", AcceptedKind: "concept"}}, UngroupedMaterials: []agonara.Node{{EntityID: "m", Title: "Material", AcceptedKind: "material_reference"}}}, c.err
}
func (c *contentSpy) Entity(_ context.Context, id string) (agonara.Entity, error) {
	c.id = id
	e := agonara.Entity{EntityID: id, ProgramID: "p", Title: "Entity", AcceptedKind: "material_reference", HasContent: true, Body: "Body"}
	e.Relationships.Incoming = []agonara.Link{{FromEntityID: "t", FromTitle: "Parent", FromKind: "topic"}}
	e.Relationships.Outgoing = []agonara.Link{{ToEntityID: "c", ToTitle: "Child", ToKind: "concept"}}
	return e, c.err
}
func (c *contentSpy) MaterialContent(_ context.Context, id string) (string, error) {
	c.id = id
	return "# Exact\n\n**Content**.", c.err
}
func TestContentAdapterReducesWireRelationshipsToReadingEntries(t *testing.T) {
	t.Parallel()
	spy := &contentSpy{}
	a := Content{spy}
	ctx := context.Background()
	ps, err := a.ListPrograms(ctx)
	if err != nil || !reflect.DeepEqual(ps, []flow.CatalogEntry{{ID: "p", Title: "Program", Description: "Description"}}) {
		t.Fatalf("%+v %v", ps, err)
	}
	nav, err := a.Navigation(ctx, "program-id")
	if err != nil || spy.id != "program-id" || !reflect.DeepEqual(nav, flow.Navigation{Topics: []flow.Item{{ID: "t", Title: "Topic", Kind: "topic"}}, Concepts: []flow.Item{{ID: "ungrouped-c", Title: "Ungrouped concept", Kind: "concept"}}, Materials: []flow.Item{{ID: "m", Title: "Material", Kind: "material_reference"}}}) {
		t.Fatalf("%+v %v", nav, err)
	}
	entity, err := a.Entity(ctx, "entity-id")
	if err != nil || spy.id != "entity-id" || !reflect.DeepEqual(entity, flow.Entity{ID: "entity-id", ProgramID: "p", Title: "Entity", Kind: "material_reference", Readable: true, Body: "Body", Parents: []flow.Item{{ID: "t", Title: "Parent", Kind: "topic"}}, Children: []flow.Item{{ID: "c", Title: "Child", Kind: "concept"}}}) {
		t.Fatalf("%+v %v", entity, err)
	}
	text, err := a.MaterialContent(ctx, "material-id")
	if err != nil || spy.id != "material-id" || text != "# Exact\n\n**Content**." {
		t.Fatalf("%q %v", text, err)
	}
	spy.err = errors.New("API refused")
	if _, err = a.ListPrograms(ctx); !errors.Is(err, spy.err) {
		t.Fatal(err)
	}
	if _, err = a.Navigation(ctx, "p"); !errors.Is(err, spy.err) {
		t.Fatal(err)
	}
	if _, err = a.Entity(ctx, "e"); !errors.Is(err, spy.err) {
		t.Fatal(err)
	}
	if _, err = a.MaterialContent(ctx, "m"); !errors.Is(err, spy.err) {
		t.Fatal(err)
	}
}
