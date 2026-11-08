package flow

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"
)

type fakeReader struct {
	calls      []string
	programs   []CatalogEntry
	navigation Navigation
	node       Entity
	content    string
	err        error
}

func (r *fakeReader) ListPrograms(context.Context) ([]CatalogEntry, error) {
	r.calls = append(r.calls, "listPrograms")
	return r.programs, r.err
}

func (r *fakeReader) Navigation(_ context.Context, id string) (Navigation, error) {
	r.calls = append(r.calls, "navigation "+id)
	return r.navigation, r.err
}

func (r *fakeReader) Entity(_ context.Context, id string) (Entity, error) {
	r.calls = append(r.calls, "entity "+id)
	return r.node, r.err
}

func (r *fakeReader) MaterialContent(_ context.Context, id string) (string, error) {
	r.calls = append(r.calls, "materialContent "+id)
	return r.content, r.err
}

func links(pairs ...string) []Item {
	var out []Item
	for i := 0; i < len(pairs); i += 3 {
		out = append(out, Item{ID: pairs[i], Kind: pairs[i+1], Title: pairs[i+2]})
	}
	return out
}

func setup() *fakeReader {
	r := &fakeReader{
		programs: []CatalogEntry{{ID: "program-a", Title: "Algebra"}, {ID: "program-b", Title: "Geometry"}},
		navigation: Navigation{
			Topics:    []Item{{ID: "topic-id", Kind: "topic", Title: "Vectors"}},
			Concepts:  []Item{{ID: "concept-id", Kind: "concept", Title: "Basis"}},
			Materials: []Item{{ID: "material-id", Kind: "material_reference", Title: "Notes"}},
		},
		node:    Entity{ID: "topic-id", Kind: "topic", Title: "Vectors", Body: "A vector has direction."},
		content: "---\nmodel: x\n---\n\n# Ethics\n\nFirst part.\n\nSecond part.",
	}
	r.node.Children = links("child-id", "concept", "Child", "reading-id", "material_reference", "Reading", "other-id", "concept", "Other")
	return r
}

func makeMaterial(r *fakeReader) {
	r.node = Entity{ID: "material-id", Kind: "material_reference", Title: "Notes", Body: "Lecture.", Readable: true}
}

func entityState(id string) Session {
	return Session{Place: Place{Screen: "entity", EntityID: id}, Items: []Item{}, History: []Place{}, Step: 1}
}

func ids(actions []Action) []string {
	var out []string
	for _, action := range actions {
		out = append(out, action.ID)
	}
	return out
}

func act(t *testing.T, f Flow, s Session, action string) *Result {
	t.Helper()
	result, err := f.Act(context.Background(), s, action)
	if err != nil {
		t.Fatal(err)
	}
	if result == nil {
		t.Fatalf("action %q refused", action)
	}
	return result
}

func refused(t *testing.T, f Flow, s Session, action string) {
	t.Helper()
	if result, err := f.Act(context.Background(), s, action); err != nil || result != nil {
		t.Fatalf("action %q: want refusal, got %v, %v", action, result, err)
	}
}

func n(value int) *int { return &value }

func equal(t *testing.T, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("\n got: %#v\nwant: %#v", got, want)
	}
}

func TestProgramListNumbersProgramsWithoutProgramsButton(t *testing.T) {
	t.Parallel()
	f := Flow{Reader: setup()}
	result := act(t, f, InitialSession(), "")
	equal(t, result.View, View{Title: "Programs", Lists: []List{{Entries: []Entry{{0, n(1), "Algebra"}, {1, n(2), "Geometry"}}}}})
	equal(t, result.Actions, []Action{{"open_0", "item", "1"}, {"open_1", "item", "2"}})
	equal(t, result.Session.Screen, "programs")
}

func TestProgramGroupsMaterialsFirstAndNumbersTheRest(t *testing.T) {
	t.Parallel()
	r := setup()
	f := Flow{Reader: r}
	list := act(t, f, InitialSession(), "")
	result := act(t, f, list.Session, "open_0")
	equal(t, r.calls[len(r.calls)-1], "navigation program-a")
	equal(t, result.View.Lists, []List{
		{Heading: "Materials", Entries: []Entry{{2, nil, "Notes"}}},
		{Heading: "Topics", Entries: []Entry{{0, n(1), "Vectors"}}},
		{Heading: "Concepts", Entries: []Entry{{1, n(2), "Basis"}}},
	})
	equal(t, result.Actions, []Action{
		{"open_0", "item", "1"}, {"open_1", "item", "2"}, {"open_2", "material", "Notes"},
		{"back", "nav", "Back"}, {"programs", "nav", "Programs"},
	})
}

func TestNumbersFollowTheListsAndEachOpensItsItem(t *testing.T) {
	t.Parallel()
	r := setup()
	f := Flow{Reader: r}
	result := act(t, f, entityState("topic-id"), "")
	equal(t, result.View.Lists, []List{
		{Heading: "Materials", Entries: []Entry{{1, nil, "Reading"}}},
		{Heading: "Concepts", Entries: []Entry{{0, n(1), "Child"}, {2, n(2), "Other"}}},
	})
	equal(t, result.Actions[:3], []Action{{"open_0", "item", "1"}, {"open_1", "material", "Reading"}, {"open_2", "item", "2"}})
	for action, id := range map[string]string{"open_0": "child-id", "open_1": "reading-id", "open_2": "other-id"} {
		act(t, f, result.Session, action)
		equal(t, r.calls[len(r.calls)-1], "entity "+id)
	}
}

func TestItemIndexResolvesFromTheSavedScreen(t *testing.T) {
	t.Parallel()
	r := setup()
	f := Flow{Reader: r}
	program := act(t, f, act(t, f, InitialSession(), "").Session, "open_0")
	slices.Reverse(r.navigation.Topics)
	data, _ := json.Marshal(program.Session)
	var saved Session
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatal(err)
	}
	act(t, f, saved, "open_1")
	equal(t, r.calls[len(r.calls)-1], "entity concept-id")
}

func TestBackRetracesAndProgramsResets(t *testing.T) {
	t.Parallel()
	f := Flow{Reader: setup()}
	list := act(t, f, InitialSession(), "")
	program := act(t, f, list.Session, "open_0")
	topic := act(t, f, program.Session, "open_0")
	equal(t, act(t, f, topic.Session, "back").Session.Screen, "program")
	home := act(t, f, topic.Session, "programs")
	equal(t, home.Session.Screen, "programs")
	equal(t, home.Session.History, []Place{})
	refused(t, f, home.Session, "back")
}

func TestUnknownActionsAndIndicesAreRefused(t *testing.T) {
	t.Parallel()
	f := Flow{Reader: setup()}
	list := act(t, f, InitialSession(), "")
	for _, action := range []string{"open_9", "open_01", "open_x", "dance"} {
		refused(t, f, list.Session, action)
	}
}

func TestOldStateWithoutScreenOpensProgramList(t *testing.T) {
	t.Parallel()
	f := Flow{Reader: setup()}
	result := act(t, f, Session{Step: 4}, "")
	equal(t, result.Session.Screen, "programs")
	equal(t, result.Session.Step, 5)
}

func TestAgonaraErrorsPassThrough(t *testing.T) {
	t.Parallel()
	r := setup()
	r.err = errors.New("GET /programs failed (HTTP 503): request rejected")
	if _, err := (Flow{Reader: r}).Act(context.Background(), InitialSession(), ""); err == nil {
		t.Fatal("want error")
	}
}

func TestMaterialIsPagedWithoutFrontMatterBodyOnFirstPage(t *testing.T) {
	t.Parallel()
	r := setup()
	makeMaterial(r)
	f := Flow{Reader: r, PageSize: 25}
	first := act(t, f, entityState("material-id"), "")
	equal(t, r.calls, []string{"entity material-id", "materialContent material-id"})
	equal(t, first.View, View{Title: "Notes", Body: "Lecture.", Lists: []List{}, Markdown: "# Ethics\n\nFirst part.",
		Page: &PageInfo{0, 2}, Position: &Position{Index: 0, Count: 2}})
	equal(t, ids(first.Actions), []string{"next", "programs"})
	equal(t, *first.Session.PageCount, 2)
	second := act(t, f, first.Session, "next")
	equal(t, second.View.Markdown, "Second part.")
	equal(t, second.View.Body, "")
	equal(t, ids(second.Actions), []string{"prev", "programs"})
	equal(t, act(t, f, second.Session, "prev").View.Page.Index, 0)
	refused(t, f, first.Session, "prev")
	refused(t, f, second.Session, "next")
	refused(t, f, act(t, f, InitialSession(), "").Session, "next")
}

func TestPageBeyondAShortenedMaterialShowsItsLastPage(t *testing.T) {
	t.Parallel()
	r := setup()
	makeMaterial(r)
	s := entityState("material-id")
	s.Page, s.PageCount = n(5), n(6)
	result := act(t, Flow{Reader: r, PageSize: 25}, s, "")
	equal(t, *result.View.Page, PageInfo{1, 2})
	equal(t, *result.Session.Page, 1)
}

func TestTopicOrMaterialWithoutContentHasNoPages(t *testing.T) {
	t.Parallel()
	r := setup()
	result := act(t, Flow{Reader: r}, entityState("topic-id"), "")
	equal(t, r.calls, []string{"entity topic-id"})
	if result.View.Page != nil || result.Session.PageCount != nil {
		t.Fatal("want no pages")
	}
}

func TestLectureReadAScreenAtATimeWithContents(t *testing.T) {
	t.Parallel()
	r := setup()
	makeMaterial(r)
	r.node.Children = links("c", "concept", "Concept")
	r.content = "---\nx: 1\n---\n# Lecture\n\nIntro.\n\n## A\n\naaaa\n\nbbbb\n\n## B\n\nb text"
	f := Flow{Reader: r, PageSize: 12}
	intro := act(t, f, entityState("material-id"), "")
	equal(t, intro.View.Markdown, "# Lecture")
	equal(t, *intro.View.Position, Position{Index: 0, Count: 2})
	equal(t, intro.View.Lists, []List{})
	equal(t, ids(intro.Actions), []string{"open_0", "next", "contents", "programs"})

	a2 := act(t, f, act(t, f, act(t, f, intro.Session, "next").Session, "next").Session, "next")
	equal(t, a2.View.Markdown, "bbbb")
	equal(t, *a2.View.Position, Position{Section: n(1), Label: "A", Index: 1, Count: 2})

	contents := act(t, f, a2.Session, "contents")
	equal(t, contents.View.Contents, []ContentsEntry{
		{Count: 2, Page: 0, Label: "Intro"}, {Count: 2, Page: 2, N: n(1), Label: "A", Current: true}, {Count: 1, Page: 4, N: n(2), Label: "B"},
	})
	equal(t, contents.View.Lists[0].Entries[0].Label, "Concept")
	equal(t, ids(contents.Actions), []string{"open_0", "sec_0", "sec_2", "sec_4", "read", "programs"})
	refused(t, f, contents.Session, "contents")
	equal(t, act(t, f, contents.Session, "read").View.Markdown, "bbbb")

	b := act(t, f, contents.Session, "sec_4")
	equal(t, *b.View.Position, Position{Section: n(2), Label: "B", Index: 0, Count: 1})
	equal(t, b.Session.Contents, false)
	refused(t, f, b.Session, "read")
	refused(t, f, b.Session, "sec_9")
	list := act(t, f, InitialSession(), "")
	refused(t, f, list.Session, "sec_1")
	refused(t, f, list.Session, "contents")
}

func TestStateSavedByTheJavaScriptBotStillLoads(t *testing.T) {
	t.Parallel()
	r := setup()
	makeMaterial(r)
	r.content = "# L\n\n## A\n\na\n\n## B\n\nb"
	raw := `{"screen":"entity","entityId":"material-id","page":2,"items":[],"history":[{"screen":"programs"},` +
		`{"screen":"program","programId":"p","title":"Course"},{"screen":"entity","entityId":"topic-id"}],"step":72,"pageCount":23}`
	var s Session
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		t.Fatal(err)
	}
	result := act(t, Flow{Reader: r}, s, "")
	equal(t, result.View.Markdown, "## B\n\nb")
	equal(t, result.Session.Step, 73)
	equal(t, len(result.Session.History), 3)
	back := act(t, Flow{Reader: r}, result.Session, "back")
	equal(t, back.Session.EntityID, "topic-id")
}

func TestSectionPagesRunOnUnderTheSameTitle(t *testing.T) {
	t.Parallel()
	var got [][2]string
	for _, page := range SectionPages("## A\n\naaaa\n\nbbbb\n\n## B\n\nc", 10) {
		got = append(got, [2]string{*page.Title, page.Text})
	}
	equal(t, got, [][2]string{{"A", "## A\n\naaaa"}, {"A", "bbbb"}, {"B", "## B\n\nc"}})
	equal(t, SectionPages("plain\n\ntext", 100), []Page{{Text: "plain\n\ntext"}})
}

func TestPagesBreakAtParagraphsThenLinesThenAnywhere(t *testing.T) {
	t.Parallel()
	equal(t, Paginate("aaaa\n\nbbbb\n\ncc", 10), []string{"aaaa\n\nbbbb", "cc"})
	equal(t, Paginate("aaaa\nbbbb\ncccc", 10), []string{"aaaa\nbbbb", "cccc"})
	equal(t, Paginate(strings.Repeat("x", 25), 10), []string{strings.Repeat("x", 10), strings.Repeat("x", 10), "xxxxx"})
	for _, page := range Paginate(strings.Repeat("слово ", 2000), 2500) {
		if len([]rune(page)) > 2500 {
			t.Fatal("page over size")
		}
	}
}
