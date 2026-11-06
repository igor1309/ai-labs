// Package flow is the session flow: given the session state and an action, it
// returns the screen as meaning (title, text, numbered lists, actions by kind)
// and the updated state. How a screen is drawn is the surface's business.
package flow

import (
	"context"
	"regexp"
	"strconv"

	"github.com/igor1309/ai-labs/agonara/session/internal/agonara"
)

// PageSize fits one phone screen, so Next flips a page in place and nothing
// scrolls: about 1,000 characters of rich-message text on an iPhone.
const PageSize = 1000

const material = "material_reference"

// Reader is the part of Agonara the flow reads.
type Reader interface {
	ListPrograms(ctx context.Context) ([]agonara.Program, error)
	Navigation(ctx context.Context, programID string) (agonara.Navigation, error)
	Entity(ctx context.Context, entityID string) (agonara.Entity, error)
	MaterialContent(ctx context.Context, entityID string) (string, error)
}

// Place is a screen the session can return to.
type Place struct {
	Screen    string `json:"screen"`
	ProgramID string `json:"programId,omitempty"`
	EntityID  string `json:"entityId,omitempty"`
	Title     string `json:"title,omitempty"`
	Page      *int   `json:"page,omitempty"`
	Contents  bool   `json:"contents,omitempty"`
}

// Item is a listed name the student can open; IDs stay in the saved state.
type Item struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Kind  string `json:"kind"`
}

// Session is one student's place, saved after every update.
type Session struct {
	Place
	PageCount *int    `json:"pageCount,omitempty"`
	Items     []Item  `json:"items"`
	History   []Place `json:"history"`
	Step      int     `json:"step"`
}

// Entry is a listed name: Index is its item, N its number (nil for a material).
type Entry struct {
	Index int
	N     *int
	Label string
}

// List is a group of entries under an optional heading.
type List struct {
	Heading string
	Entries []Entry
}

// PageInfo is a page's index among a material's pages.
type PageInfo struct{ Index, Count int }

// Position is where a page is: its section (nil for the intro) and its page
// within that section.
type Position struct {
	Section *int
	Label   string
	Index   int
	Count   int
}

// ContentsEntry is the intro or a section on the contents page.
type ContentsEntry struct {
	Page    int
	N       *int
	Label   string
	Current bool
}

// View is a screen as meaning.
type View struct {
	Title    string
	Body     string
	Markdown string
	Page     *PageInfo
	Position *Position
	Contents []ContentsEntry
	Lists    []List
	Empty    string
}

// Action is something the student can do on a screen; Kind groups it for drawing.
type Action struct{ ID, Kind, Label string }

// Result is a screen and the session after it.
type Result struct {
	Session Session
	View    View
	Actions []Action
}

// InitialSession opens the program list.
func InitialSession() Session {
	return Session{Place: Place{Screen: "programs"}, Items: []Item{}, History: []Place{}}
}

// Flow runs the session over an Agonara reader.
type Flow struct {
	Reader   Reader
	PageSize int
}

var (
	openPattern    = regexp.MustCompile(`^open_(0|[1-9]\d*)$`)
	sectionPattern = regexp.MustCompile(`^sec_\d+$`)
)

// Act applies an action ("" for a typed message, which redraws the screen).
// It returns nil for an action the screen does not offer.
func (f Flow) Act(ctx context.Context, session Session, actionID string) (*Result, error) {
	current := session
	// Older state files have no screen; the next message opens the program list.
	if current.Screen == "" {
		current = InitialSession()
		current.Step = session.Step
	}
	if current.History == nil {
		current.History = []Place{}
	}
	target := descriptor(current.Place)
	history := current.History
	paged := current.Screen == "entity" && current.PageCount != nil
	switch {
	case actionID == "programs":
		target, history = Place{Screen: "programs"}, []Place{}
	case actionID == "back":
		if len(history) == 0 {
			return nil, nil
		}
		target, history = history[len(history)-1], history[:len(history)-1]
	case actionID == "next" || actionID == "prev":
		if !paged {
			return nil, nil
		}
		page := deref(current.Page)
		if actionID == "next" {
			page++
		} else {
			page--
		}
		if page < 0 || page >= *current.PageCount {
			return nil, nil
		}
		target = Place{Screen: "entity", EntityID: current.EntityID, Page: &page}
	case actionID == "contents":
		if !paged || current.Contents {
			return nil, nil
		}
		target.Contents = true
	case actionID == "read":
		if !current.Contents {
			return nil, nil
		}
		page := deref(current.Page)
		target = Place{Screen: "entity", EntityID: current.EntityID, Page: &page}
	case sectionPattern.MatchString(actionID):
		page, _ := strconv.Atoi(actionID[4:])
		if !paged || page >= *current.PageCount {
			return nil, nil
		}
		target = Place{Screen: "entity", EntityID: current.EntityID, Page: &page}
	case actionID != "":
		match := openPattern.FindStringSubmatch(actionID)
		if match == nil {
			return nil, nil
		}
		index, _ := strconv.Atoi(match[1])
		if index >= len(current.Items) {
			return nil, nil
		}
		item := current.Items[index]
		if current.Screen == "programs" {
			target = Place{Screen: "program", ProgramID: item.ID, Title: item.Title}
		} else {
			target = Place{Screen: "entity", EntityID: item.ID}
		}
		history = append(append([]Place{}, history...), descriptor(current.Place))
	}

	var view View
	items := []Item{}
	var pageCount *int
	switch target.Screen {
	case "programs":
		programs, err := f.Reader.ListPrograms(ctx)
		if err != nil {
			return nil, err
		}
		for _, program := range programs {
			items = append(items, Item{ID: program.ProgramID, Title: program.Title, Kind: "program"})
		}
		view = View{Title: "Programs", Lists: []List{numbered(items)}}
		if len(items) == 0 {
			view.Empty = "No programs."
		}
	case "program":
		navigation, err := f.Reader.Navigation(ctx, target.ProgramID)
		if err != nil {
			return nil, err
		}
		for _, group := range [][]agonara.Node{navigation.Topics, navigation.UngroupedConcepts, navigation.UngroupedMaterials} {
			for _, node := range group {
				items = append(items, Item{ID: node.EntityID, Title: node.Title, Kind: node.AcceptedKind})
			}
		}
		view = View{Title: target.Title, Lists: grouped(items)}
	default:
		node, err := f.Reader.Entity(ctx, target.EntityID)
		if err != nil {
			return nil, err
		}
		for _, link := range node.Relationships.Outgoing {
			items = append(items, Item{ID: link.ToEntityID, Title: link.ToTitle, Kind: link.ToKind})
		}
		view = View{Title: node.Title, Body: node.Body, Lists: grouped(items)}
		if node.AcceptedKind == material && node.HasContent {
			content, err := f.Reader.MaterialContent(ctx, node.EntityID)
			if err != nil {
				return nil, err
			}
			size := f.PageSize
			if size <= 0 {
				size = PageSize
			}
			pages := SectionPages(withoutFrontMatter(content), size)
			count := len(pages)
			pageCount = &count
			page := min(deref(target.Page), count-1)
			target.Page = &page
			view.Markdown = pages[page].Text
			view.Page = &PageInfo{Index: page, Count: count}
			if page != 0 {
				view.Body = ""
			}
			view.Position, view.Contents = locate(pages, page)
			if target.Contents {
				view = View{Title: node.Title, Contents: view.Contents, Lists: view.Lists}
			} else {
				if count > 1 {
					// Linked items live on the contents page, keeping each page one screen.
					view.Lists = []List{}
				}
				if len(view.Contents) < 2 {
					view.Contents = nil
				}
			}
		}
	}

	actions := []Action{}
	for index, item := range items {
		if item.Kind == material {
			actions = append(actions, Action{ID: "open_" + strconv.Itoa(index), Kind: "material", Label: item.Title})
		} else {
			actions = append(actions, Action{ID: "open_" + strconv.Itoa(index), Kind: "item", Label: strconv.Itoa(numberOf(view.Lists, index))})
		}
	}
	switch {
	case target.Contents && view.Contents != nil:
		for _, entry := range view.Contents {
			actions = append(actions, Action{ID: "sec_" + strconv.Itoa(entry.Page), Kind: "section", Label: entry.Label})
		}
		actions = append(actions, Action{ID: "read", Kind: "page", Label: "📖 Continue reading"})
	case view.Page != nil:
		if view.Page.Index > 0 {
			actions = append(actions, Action{ID: "prev", Kind: "page", Label: "◀ Prev"})
		}
		if view.Page.Index < view.Page.Count-1 {
			actions = append(actions, Action{ID: "next", Kind: "page", Label: "Next ▶"})
		}
		if view.Contents != nil {
			actions = append(actions, Action{ID: "contents", Kind: "page", Label: "☰ Contents"})
		}
		// A reading page lists no sections; the contents page does.
		view.Contents = nil
	}
	if len(history) > 0 {
		actions = append(actions, Action{ID: "back", Kind: "nav", Label: "◀ Back"})
	}
	if target.Screen != "programs" {
		actions = append(actions, Action{ID: "programs", Kind: "nav", Label: "Programs"})
	}
	return &Result{
		Session: Session{Place: target, PageCount: pageCount, Items: items, History: history, Step: session.Step + 1},
		View:    view,
		Actions: actions,
	}, nil
}

// locate says where a page is and builds the contents: the intro, if any, and
// each section by its first page.
func locate(pages []Page, page int) (*Position, []ContentsEntry) {
	starts := []int{}
	for index := range pages {
		if index == 0 || pages[index-1].Title != pages[index].Title {
			starts = append(starts, index)
		}
	}
	section := 0
	for index, start := range starts {
		if start <= page {
			section = index
		}
	}
	end := len(pages)
	if section+1 < len(starts) {
		end = starts[section+1]
	}
	number := func(index int) *int {
		if pages[starts[index]].Title == nil {
			return nil
		}
		n := index + 1
		if pages[0].Title == nil {
			n = index
		}
		return &n
	}
	position := &Position{Section: number(section), Index: page - starts[section], Count: end - starts[section]}
	if title := pages[page].Title; title != nil {
		position.Label = *title
	}
	contents := make([]ContentsEntry, len(starts))
	for index, start := range starts {
		label := "Intro"
		if title := pages[start].Title; title != nil {
			label = *title
		}
		contents[index] = ContentsEntry{Page: start, N: number(index), Label: label, Current: index == section}
	}
	return position, contents
}

var headings = map[string]string{"topic": "Topics", "concept": "Concepts", material: "Materials"}

// grouped lists items by kind, materials first; topics and concepts are
// numbered across the screen in the order of the items.
func grouped(items []Item) []List {
	order := []string{material, "topic", "concept", "other"}
	kindOf := func(item Item) string {
		if _, ok := headings[item.Kind]; ok {
			return item.Kind
		}
		return "other"
	}
	numbers := map[int]int{}
	n := 0
	for _, kind := range order[1:] {
		for index, item := range items {
			if kindOf(item) == kind {
				n++
				numbers[index] = n
			}
		}
	}
	lists := []List{}
	for _, kind := range order {
		heading, ok := headings[kind]
		if !ok {
			heading = "Related"
		}
		list := List{Heading: heading}
		for index, item := range items {
			if kindOf(item) != kind {
				continue
			}
			entry := Entry{Index: index, Label: item.Title}
			if number, ok := numbers[index]; ok {
				entry.N = &number
			}
			list.Entries = append(list.Entries, entry)
		}
		if len(list.Entries) > 0 {
			lists = append(lists, list)
		}
	}
	return lists
}

func numbered(items []Item) List {
	list := List{Entries: []Entry{}}
	for index, item := range items {
		n := index + 1
		list.Entries = append(list.Entries, Entry{Index: index, N: &n, Label: item.Title})
	}
	return list
}

func numberOf(lists []List, index int) int {
	for _, list := range lists {
		for _, entry := range list.Entries {
			if entry.Index == index && entry.N != nil {
				return *entry.N
			}
		}
	}
	return index + 1
}

// descriptor is the part of a place worth returning to.
func descriptor(place Place) Place {
	switch place.Screen {
	case "program":
		return Place{Screen: "program", ProgramID: place.ProgramID, Title: place.Title}
	case "entity":
		out := Place{Screen: "entity", EntityID: place.EntityID}
		if deref(place.Page) != 0 {
			page := *place.Page
			out.Page = &page
		}
		return out
	}
	return Place{Screen: "programs"}
}

func deref(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}
