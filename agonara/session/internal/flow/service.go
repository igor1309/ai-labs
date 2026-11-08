package flow

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

var ErrStale = errors.New("action is out of date")
var ErrInvalid = errors.New("action is unavailable")

// Storage saves the whole reading state atomically, independently of any surface.
type Storage interface {
	Load() (State, error)
	Save(State) error
}

// Activity is the service's reading collaborator. It has no persistence capability.
type Activity interface {
	Apply(context.Context, Session, Command) (*Snapshot, error)
	Explain(context.Context, Session, Question) (Explanation, error)
	Enrich(context.Context, *Snapshot) error
}

type State struct {
	Current Session
	Resume  *Bookmark
}
type Bookmark struct {
	ProgramID, EntityID, Title string
	Page                       int
	Position                   *Position
	Course                     *Item
	Courses                    []Item
}

type Command struct {
	Target, ID, Action string
	Page               *int
	Revision           *int
}
type ProgramSummary struct {
	ID, Title string
	Topics    int
}
type Snapshot struct {
	directEntity bool
	Result       *Result
	Programs     []ProgramSummary
	Program      *Program
	Resume       *Bookmark
}
type Question struct {
	Kind, MaterialID, MaterialRevision, Reference, Text string
	Revision                                            int
}
type Explanation struct {
	Available                    bool
	Paragraph                    Paragraph
	MaterialID, MaterialRevision string
}

// Service is one student's serialized session owner. Only a successful save publishes state.
type Service struct {
	mu       sync.Mutex
	activity Activity
	storage  Storage
	state    State
}

func NewService(activity Activity, storage Storage) (*Service, error) {
	if activity == nil || storage == nil {
		return nil, errors.New("activity and storage are required")
	}
	state, err := storage.Load()
	if err != nil {
		return nil, fmt.Errorf("load reading state: %w", err)
	}
	if err := ValidateState(state); err != nil {
		return nil, err
	}
	return &Service{activity: activity, storage: storage, state: cloneState(state)}, nil
}
func InitialState() State { return State{Current: InitialSession()} }
func ValidateState(s State) error {
	if s.Current.Step < 0 {
		return errors.New("invalid reading revision")
	}
	validPlace := func(p Place) bool {
		if p.Page != nil && *p.Page < 0 {
			return false
		}
		switch p.Screen {
		case "programs":
			return true
		case "program":
			return p.ProgramID != ""
		case "entity":
			return p.EntityID != ""
		}
		return false
	}
	if s.Current.PageCount != nil && (*s.Current.PageCount <= 0 || s.Current.Page == nil || *s.Current.Page >= *s.Current.PageCount) {
		return errors.New("invalid reading page count")
	}
	if !validPlace(s.Current.Place) {
		return errors.New("invalid reading place")
	}
	for _, p := range s.Current.History {
		if !validPlace(p) {
			return errors.New("invalid reading history")
		}
	}
	if s.Resume != nil && (s.Resume.EntityID == "" || s.Resume.Page < 0) {
		return errors.New("invalid reading bookmark")
	}
	return nil
}
func (s *Service) Apply(ctx context.Context, command Command) (*Result, error) {
	snapshot, err := s.apply(ctx, command, false)
	if err != nil || snapshot == nil {
		return nil, err
	}
	return snapshot.Result, nil
}

// Open includes catalog counts and the complete outline before committing the action.
// Supplementary read failures therefore leave the committed reading position intact.
func (s *Service) Open(ctx context.Context, command Command) (*Snapshot, error) {
	return s.apply(ctx, command, true)
}
func (s *Service) apply(ctx context.Context, command Command, enriched bool) (*Snapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if command.Revision != nil && *command.Revision != s.state.Current.Step {
		return nil, ErrStale
	}
	// Give the collaborator owned values: failed work cannot mutate the committed state.
	current := cloneSession(s.state.Current)
	next, err := s.activity.Apply(ctx, current, command)
	if err != nil || next == nil {
		return nil, err
	}
	if next.Result == nil {
		return nil, errors.New("activity returned no reading result")
	}
	if command.Revision != nil && current.EntityID == next.Result.Session.EntityID && current.MaterialRevision != "" && current.MaterialRevision != next.Result.Session.MaterialRevision {
		return nil, ErrStale
	}
	if enriched {
		if err := s.activity.Enrich(ctx, next); err != nil {
			return nil, err
		}
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	candidate := s.state
	candidate.Current = cloneSession(next.Result.Session)
	candidate.Current.Step = s.state.Current.Step + 1
	next.Result.Session.Step = candidate.Current.Step
	if c := next.Result.Context; c != nil && next.Result.View.Page != nil {
		candidate.Resume = &Bookmark{EntityID: c.MaterialID, Title: next.Result.View.Title, Page: next.Result.View.Page.Index, Position: next.Result.View.Position, Course: c.Course, Courses: append([]Item{}, c.Courses...)}
		if c.Program != nil {
			candidate.Resume.ProgramID = c.Program.ID
		}
	}
	candidate.Resume = cloneBookmark(candidate.Resume)
	if err := ValidateState(candidate); err != nil {
		return nil, err
	}
	if err := s.storage.Save(cloneState(candidate)); err != nil {
		return nil, fmt.Errorf("save reading state: %w", err)
	}
	s.state = candidate
	next.Resume = cloneBookmark(candidate.Resume)
	return next, nil
}
func (s *Service) Explain(ctx context.Context, q Question) (Explanation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return Explanation{}, err
	}
	if q.Revision != s.state.Current.Step {
		return Explanation{}, ErrStale
	}
	return s.activity.Explain(ctx, cloneSession(s.state.Current), q)
}
func cloneSession(s Session) Session {
	s.Place = clonePlace(s.Place)
	if s.PageCount != nil {
		n := *s.PageCount
		s.PageCount = &n
	}
	s.Items = append([]Item{}, s.Items...)
	s.History = append([]Place{}, s.History...)
	for i := range s.History {
		s.History[i] = clonePlace(s.History[i])
	}
	return s
}
func clonePlace(p Place) Place {
	if p.Page != nil {
		n := *p.Page
		p.Page = &n
	}
	return p
}
func cloneBookmark(p *Bookmark) *Bookmark {
	if p == nil {
		return nil
	}
	out := *p
	out.Courses = append([]Item{}, p.Courses...)
	if p.Position != nil {
		pos := *p.Position
		if pos.Section != nil {
			n := *pos.Section
			pos.Section = &n
		}
		out.Position = &pos
	}
	if p.Course != nil {
		course := *p.Course
		out.Course = &course
	}
	return &out
}

func (f Flow) Apply(ctx context.Context, session Session, command Command) (*Snapshot, error) {
	switch command.Target {
	case "programs":
		command.Action = "programs"
	case "program":
		if command.ID == "" {
			return nil, ErrInvalid
		}
		session.Place = Place{Screen: "program", ProgramID: command.ID}
		session.History = []Place{{Screen: "programs"}}
	case "entity":
		if command.ID == "" {
			return nil, ErrInvalid
		}
		page := command.Page
		if page == nil && session.Screen == "entity" && session.EntityID == command.ID {
			page = session.Page
		}
		session.Place = Place{Screen: "entity", EntityID: command.ID, Page: page}
		session.History = []Place{{Screen: "programs"}}
	case "":
	default:
		return nil, ErrInvalid
	}
	result, err := f.Act(ctx, session, command.Action)
	if err != nil || result == nil {
		return nil, err
	}
	f.locateParents(result)
	if command.Target == "entity" {
		directHistory(result)
	}
	out := &Snapshot{Result: result, directEntity: command.Target == "entity"}
	return out, nil
}

// Enrich queries supplementary catalog data for surfaces that render it.
func (f Flow) Enrich(ctx context.Context, out *Snapshot) error {
	result := out.Result
	var err error
	switch result.Session.Screen {
	case "programs":
		for _, p := range result.Session.Items {
			nav, err := f.Reader.Navigation(ctx, p.ID)
			if err != nil {
				return err
			}
			out.Programs = append(out.Programs, ProgramSummary{ID: p.ID, Title: p.Title, Topics: len(nav.Topics)})
		}
	case "program":
		out.Program, err = f.Program(ctx, result.Session.ProgramID)
		if err != nil {
			return err
		}
		result.View.Title = out.Program.Title
		result.Session.Title = out.Program.Title
	case "entity":
		if err := f.describe(ctx, result); err != nil {
			return err
		}
		if out.directEntity {
			directHistory(result)
		}
	}
	return nil
}

func (f Flow) Explain(ctx context.Context, session Session, q Question) (Explanation, error) {
	switch q.Kind {
	case "more", "simpler", "example", "ask":
	default:
		return Explanation{}, ErrInvalid
	}
	if session.Screen != "entity" || session.Contents || q.MaterialID != session.EntityID {
		return Explanation{}, ErrStale
	}
	result, err := f.Act(ctx, session, "")
	if err != nil {
		return Explanation{}, err
	}
	c := result.Context
	if c == nil || c.Revision != q.MaterialRevision {
		return Explanation{}, ErrStale
	}
	for _, fragment := range c.Fragments {
		if fragment.Reference != "" && fragment.Reference == q.Reference {
			return Explanation{Available: false, Paragraph: Paragraph{Reference: fragment.Reference, Text: fragment.Source}, MaterialID: c.MaterialID, MaterialRevision: c.Revision}, nil
		}
	}
	return Explanation{}, ErrInvalid
}

func cloneState(s State) State {
	s.Current = cloneSession(s.Current)
	s.Resume = cloneBookmark(s.Resume)
	return s
}
