package sessionstore

import "github.com/igor1309/ai-labs/agonara/session/internal/flow"

// The file adapter owns schema evolution independently of reading semantics.
type readingRecord struct {
	Version int             `json:"version"`
	Current sessionRecord   `json:"current"`
	Resume  *bookmarkRecord `json:"resume,omitempty"`
}
type legacyBotRecord struct {
	Offset  int64         `json:"offset"`
	Session sessionRecord `json:"session"`
}
type placeRecord struct {
	Screen    string `json:"screen"`
	ProgramID string `json:"programId,omitempty"`
	EntityID  string `json:"entityId,omitempty"`
	Title     string `json:"title,omitempty"`
	Page      *int   `json:"page,omitempty"`
	Contents  bool   `json:"contents,omitempty"`
}
type itemRecord struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Kind  string `json:"kind"`
}
type sessionRecord struct {
	MaterialRevision string `json:"materialRevision,omitempty"`
	placeRecord
	PageCount *int          `json:"pageCount,omitempty"`
	Items     []itemRecord  `json:"items"`
	History   []placeRecord `json:"history"`
	Step      int           `json:"step"`
}
type positionRecord struct {
	Section      *int
	Label        string
	Index, Count int
}
type bookmarkRecord struct {
	ProgramID, EntityID, Title string
	Page                       int
	Position                   *positionRecord
	Course                     *itemRecord
	Courses                    []itemRecord
}

func placeToRecord(p flow.Place) placeRecord {
	return placeRecord{p.Screen, p.ProgramID, p.EntityID, p.Title, p.Page, p.Contents}
}
func (p placeRecord) state() flow.Place {
	return flow.Place{Screen: p.Screen, ProgramID: p.ProgramID, EntityID: p.EntityID, Title: p.Title, Page: p.Page, Contents: p.Contents}
}
func itemsToRecord(items []flow.Item) []itemRecord {
	if items == nil {
		return nil
	}
	out := make([]itemRecord, len(items))
	for i, p := range items {
		out[i] = itemRecord{p.ID, p.Title, p.Kind}
	}
	return out
}
func itemsFromRecord(items []itemRecord) []flow.Item {
	if items == nil {
		return nil
	}
	out := make([]flow.Item, len(items))
	for i, p := range items {
		out[i] = flow.Item{ID: p.ID, Title: p.Title, Kind: p.Kind}
	}
	return out
}
func sessionToRecord(s flow.Session) sessionRecord {
	r := sessionRecord{MaterialRevision: s.MaterialRevision, placeRecord: placeToRecord(s.Place), PageCount: s.PageCount, Items: itemsToRecord(s.Items), Step: s.Step}
	if s.History != nil {
		r.History = make([]placeRecord, len(s.History))
		for i, p := range s.History {
			r.History[i] = placeToRecord(p)
		}
	}
	return r
}
func (r sessionRecord) state() flow.Session {
	s := flow.Session{MaterialRevision: r.MaterialRevision, Place: r.placeRecord.state(), PageCount: r.PageCount, Items: itemsFromRecord(r.Items), Step: r.Step}
	if r.History != nil {
		s.History = make([]flow.Place, len(r.History))
		for i, p := range r.History {
			s.History[i] = p.state()
		}
	}
	return s
}
func toRecord(s flow.State) readingRecord {
	r := readingRecord{Version: 1, Current: sessionToRecord(s.Current)}
	if b := s.Resume; b != nil {
		r.Resume = &bookmarkRecord{ProgramID: b.ProgramID, EntityID: b.EntityID, Title: b.Title, Page: b.Page, Courses: itemsToRecord(b.Courses)}
		if b.Course != nil {
			r.Resume.Course = &itemRecord{b.Course.ID, b.Course.Title, b.Course.Kind}
		}
		if p := b.Position; p != nil {
			r.Resume.Position = &positionRecord{p.Section, p.Label, p.Index, p.Count}
		}
	}
	return r
}
func (r readingRecord) state() flow.State {
	s := flow.State{Current: r.Current.state()}
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
