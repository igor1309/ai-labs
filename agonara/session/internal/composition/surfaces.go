package composition

import (
	"context"
	"errors"
	"strconv"

	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
	"github.com/igor1309/ai-labs/agonara/session/internal/telegram"
	"github.com/igor1309/ai-labs/agonara/session/internal/web"
)

type WebSession interface {
	Apply(context.Context, flow.Command) (*flow.Snapshot, error)
	Explain(context.Context, flow.Question) (flow.Explanation, error)
}
type Web struct{ Session WebSession }

func webItem(i flow.Item) web.Item { return web.Item{ID: i.ID, Title: i.Title, Kind: i.Kind} }
func webItems(in []flow.Item) []web.Item {
	out := make([]web.Item, len(in))
	for i, x := range in {
		out[i] = webItem(x)
	}
	return out
}
func webProgram(in *flow.Program) *web.Program {
	if in == nil {
		return nil
	}
	out := &web.Program{ID: in.ID, Title: in.Title, Description: in.Description, Materials: webItems(in.Materials)}
	for _, c := range in.Courses {
		out.Courses = append(out.Courses, web.Course{Topic: webItem(c.Topic), ConceptCount: len(c.Concepts), Materials: webItems(c.Materials)})
	}
	return out
}
func webPosition(in *flow.Position) *web.Position {
	if in == nil {
		return nil
	}
	return &web.Position{Section: in.Section, Label: in.Label, Index: in.Index, Count: in.Count}
}
func webError(err error) error {
	if errors.Is(err, flow.ErrStale) {
		return web.ErrStale
	}
	if errors.Is(err, flow.ErrInvalid) {
		return web.ErrInvalid
	}
	return err
}
func (a Web) Open(ctx context.Context, q web.Request) (*web.Page, error) {
	in, err := a.Session.Apply(ctx, flow.Command{Target: q.Route, ID: q.ID, Page: q.Page, Revision: q.Revision})
	if err != nil {
		return nil, webError(err)
	}
	if in == nil {
		return nil, web.ErrInvalid
	}
	out := &web.Page{Program: webProgram(in.Program)}
	for _, p := range in.Programs {
		out.Programs = append(out.Programs, web.ProgramRow{ID: p.ID, Title: p.Title, Topics: p.Topics})
	}
	if b := in.Resume; b != nil {
		out.Resume = &web.Place{ProgramID: b.ProgramID, EntityID: b.EntityID, Title: b.Title, Page: b.Page, Position: webPosition(b.Position), Courses: webItems(b.Courses)}
		if b.Course != nil {
			out.Resume.Course = b.Course.Title
		}
	}
	r := in.Result
	d := &web.Document{ID: r.Session.EntityID, Title: r.View.Title, Body: r.View.Body, Markdown: r.View.Markdown, Kind: r.Kind, Items: webItems(r.Session.Items), Revision: r.Session.Step, Position: webPosition(r.View.Position)}
	if p := r.View.Page; p != nil {
		d.Page = &web.PageInfo{Index: p.Index, Count: p.Count}
	}
	if c := r.Context; c != nil {
		d.Previous = c.Previous
		d.Next = c.Next
		d.Program = webProgram(c.Program)
		d.MaterialRevision = c.Revision
		if c.Course != nil {
			i := webItem(*c.Course)
			d.Course = &i
		}
		for _, s := range c.Sections {
			d.Sections = append(d.Sections, web.ContentsEntry{Page: s.Page, N: s.N, Label: s.Label, Current: s.Current, Count: s.Count})
		}
		for _, p := range c.Paragraphs {
			d.References = append(d.References, p.Reference)
		}
	}
	out.Document = d
	return out, nil
}
func (a Web) Explain(ctx context.Context, q web.Question) (web.Answer, error) {
	out, err := a.Session.Explain(ctx, flow.Question{Kind: q.Kind, MaterialID: q.EntityID, MaterialRevision: q.MaterialRevision, Reference: q.Reference, Text: q.Text, Revision: q.Revision})
	return web.Answer{Available: out.Available}, webError(err)
}

type TelegramSession interface {
	Apply(context.Context, flow.Command) (*flow.Snapshot, error)
}
type Telegram struct{ Session TelegramSession }

func (a Telegram) Show(ctx context.Context, q telegram.Request) (*telegram.Result, error) {
	in, err := a.Session.Apply(ctx, flow.Command{Action: q.Action, Revision: q.Revision})
	if errors.Is(err, flow.ErrStale) {
		return nil, telegram.ErrStale
	}
	if err != nil || in == nil {
		return nil, err
	}
	r := in.Result
	v := r.View
	out := &telegram.Result{Revision: r.Session.Step, Screen: r.Session.Screen, Contents: r.Session.Contents}
	out.View = telegram.View{Title: v.Title, Body: v.Body, Markdown: v.Markdown, Empty: v.Empty}
	if p := v.Page; p != nil {
		out.Page = &telegram.PageInfo{Index: p.Index, Count: p.Count}
		out.View.Reading = &telegram.ReadingPosition{Page: p.Index, Pages: p.Count}
		if pos := v.Position; pos != nil {
			out.View.Reading.Section = pos.Section
			out.View.Reading.Heading = pos.Label
			out.View.Reading.Offset = pos.Index
			out.View.Reading.Length = pos.Count
		}
	}
	for _, s := range v.Contents {
		out.View.Contents = append(out.View.Contents, telegram.ContentsEntry{Page: s.Page, N: s.N, Label: s.Label, Current: s.Current})
	}
	for _, l := range v.Lists {
		list := telegram.List{Heading: l.Heading}
		for _, e := range l.Entries {
			list.Entries = append(list.Entries, telegram.Entry{ID: "open_" + strconv.Itoa(e.Index), N: e.N, Label: e.Label})
		}
		out.View.Lists = append(out.View.Lists, list)
	}
	for _, action := range r.Actions {
		out.Actions = append(out.Actions, telegram.Action{ID: action.ID, Kind: action.Kind, Label: action.Label})
	}
	return out, nil
}
