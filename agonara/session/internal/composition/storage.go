package composition

import (
	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
	"github.com/igor1309/ai-labs/agonara/session/internal/sessionstore"
	"github.com/igor1309/ai-labs/agonara/session/internal/telegram"
)

// ReadingRecords supplies persisted records independently of the session model.
type ReadingRecords interface {
	Load() (sessionstore.ReadingRecord, error)
	Save(sessionstore.ReadingRecord) error
}
type ReadingPersistence struct{ Records ReadingRecords }

func newReadingPersistence(c Config) (ReadingPersistence, error) {
	records, err := sessionstore.NewReadingFile(c.StatePath, c.LegacyWeb, c.LegacyBot, func(r sessionstore.ReadingRecord) error {
		return flow.ValidateState(stateFromRecord(r))
	})
	return ReadingPersistence{Records: records}, err
}

func (a ReadingPersistence) Load() (flow.State, error) {
	r, err := a.Records.Load()
	return stateFromRecord(r), err
}
func (a ReadingPersistence) Save(s flow.State) error { return a.Records.Save(toRecord(s)) }

// TransportRecords supplies polling records independently of Telegram's runtime state.
type TransportRecords interface {
	Load() (sessionstore.TransportRecord, error)
	Save(sessionstore.TransportRecord) error
}
type TransportPersistence struct{ Records TransportRecords }

func (a TransportPersistence) Load() (telegram.State, error) {
	r, err := a.Records.Load()
	return telegram.State{Offset: r.Offset, Revision: r.Revision}, err
}
func (a TransportPersistence) Save(s telegram.State) error {
	return a.Records.Save(sessionstore.TransportRecord{Offset: s.Offset, Revision: s.Revision})
}

func placeToRecord(p flow.Place) sessionstore.PlaceRecord {
	return sessionstore.PlaceRecord{Screen: p.Screen, ProgramID: p.ProgramID, EntityID: p.EntityID, Title: p.Title, Page: p.Page, Contents: p.Contents}
}
func placeFromRecord(p sessionstore.PlaceRecord) flow.Place {
	return flow.Place{Screen: p.Screen, ProgramID: p.ProgramID, EntityID: p.EntityID, Title: p.Title, Page: p.Page, Contents: p.Contents}
}
func itemsToRecord(items []flow.Item) []sessionstore.ItemRecord {
	if items == nil {
		return nil
	}
	out := make([]sessionstore.ItemRecord, len(items))
	for i, p := range items {
		out[i] = sessionstore.ItemRecord{ID: p.ID, Title: p.Title, Kind: p.Kind}
	}
	return out
}
func itemsFromRecord(items []sessionstore.ItemRecord) []flow.Item {
	if items == nil {
		return nil
	}
	out := make([]flow.Item, len(items))
	for i, p := range items {
		out[i] = flow.Item{ID: p.ID, Title: p.Title, Kind: p.Kind}
	}
	return out
}
func sessionToRecord(s flow.Session) sessionstore.SessionRecord {
	r := sessionstore.SessionRecord{MaterialRevision: s.MaterialRevision, PlaceRecord: placeToRecord(s.Place), PageCount: s.PageCount, Items: itemsToRecord(s.Items), Step: s.Step}
	if s.History != nil {
		r.History = make([]sessionstore.PlaceRecord, len(s.History))
		for i, p := range s.History {
			r.History[i] = placeToRecord(p)
		}
	}
	return r
}
func sessionFromRecord(r sessionstore.SessionRecord) flow.Session {
	s := flow.Session{MaterialRevision: r.MaterialRevision, Place: placeFromRecord(r.PlaceRecord), PageCount: r.PageCount, Items: itemsFromRecord(r.Items), Step: r.Step}
	if r.History != nil {
		s.History = make([]flow.Place, len(r.History))
		for i, p := range r.History {
			s.History[i] = placeFromRecord(p)
		}
	}
	return s
}
func toRecord(s flow.State) sessionstore.ReadingRecord {
	r := sessionstore.ReadingRecord{Current: sessionToRecord(s.Current)}
	if b := s.Resume; b != nil {
		r.Resume = &sessionstore.BookmarkRecord{ProgramID: b.ProgramID, EntityID: b.EntityID, Title: b.Title, Page: b.Page, Courses: itemsToRecord(b.Courses)}
		if b.Course != nil {
			r.Resume.Course = &sessionstore.ItemRecord{ID: b.Course.ID, Title: b.Course.Title, Kind: b.Course.Kind}
		}
		if p := b.Position; p != nil {
			r.Resume.Position = &sessionstore.PositionRecord{Section: p.Section, Label: p.Label, Index: p.Index, Count: p.Count}
		}
	}
	return r
}
func stateFromRecord(r sessionstore.ReadingRecord) flow.State {
	s := flow.State{Current: sessionFromRecord(r.Current)}
	if b := r.Resume; b != nil {
		s.Resume = &flow.Bookmark{ProgramID: b.ProgramID, EntityID: b.EntityID, Title: b.Title, Page: b.Page, Courses: itemsFromRecord(b.Courses)}
		if b.Course != nil {
			s.Resume.Course = &flow.Item{ID: b.Course.ID, Title: b.Course.Title, Kind: b.Course.Kind}
		}
		if p := b.Position; p != nil {
			s.Resume.Position = &flow.Position{Section: p.Section, Label: p.Label, Index: p.Index, Count: p.Count}
		}
	}
	return s
}
