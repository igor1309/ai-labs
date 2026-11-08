package composition

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
	"github.com/igor1309/ai-labs/agonara/session/internal/sessionstore"
	"github.com/igor1309/ai-labs/agonara/session/internal/telegram"
)

type readingRecordsSpy struct {
	record sessionstore.ReadingRecord
	saved  []sessionstore.ReadingRecord
	loads  int
	err    error
}

func (s *readingRecordsSpy) Load() (sessionstore.ReadingRecord, error) {
	s.loads++
	return s.record, s.err
}
func (s *readingRecordsSpy) Save(r sessionstore.ReadingRecord) error {
	s.saved = append(s.saved, r)
	return s.err
}

func TestReadingPersistenceTranslatesEveryFieldAndPreservesErrors(t *testing.T) {
	t.Parallel()
	for _, shape := range []string{"full", "nil", "empty"} {
		for _, failed := range []bool{false, true} {
			t.Run(shape+"/"+map[bool]string{false: "success", true: "failure"}[failed], func(t *testing.T) {
				t.Parallel()
				state := flow.State{Current: flow.Session{MaterialRevision: "material-v2", Place: flow.Place{Screen: "entity", ProgramID: "program", EntityID: "material", Title: "Lecture", Page: number(2), Contents: true}, PageCount: number(5), Step: 19,
					Items: []flow.Item{{ID: "child", Title: "Child", Kind: "concept"}}, History: []flow.Place{{Screen: "program", ProgramID: "parent", Title: "Parent", Page: number(1), Contents: true}}},
					Resume: &flow.Bookmark{ProgramID: "resume-program", EntityID: "resume-material", Title: "Resume", Page: 3, Position: &flow.Position{Section: number(4), Label: "Section", Index: 2, Count: 7}, Course: &flow.Item{ID: "course", Title: "Course", Kind: "topic"}, Courses: []flow.Item{{ID: "other", Title: "Other", Kind: "program"}}}}
				record := sessionstore.ReadingRecord{Current: sessionstore.SessionRecord{MaterialRevision: "material-v2", PlaceRecord: sessionstore.PlaceRecord{Screen: "entity", ProgramID: "program", EntityID: "material", Title: "Lecture", Page: number(2), Contents: true}, PageCount: number(5), Step: 19,
					Items: []sessionstore.ItemRecord{{ID: "child", Title: "Child", Kind: "concept"}}, History: []sessionstore.PlaceRecord{{Screen: "program", ProgramID: "parent", Title: "Parent", Page: number(1), Contents: true}}},
					Resume: &sessionstore.BookmarkRecord{ProgramID: "resume-program", EntityID: "resume-material", Title: "Resume", Page: 3, Position: &sessionstore.PositionRecord{Section: number(4), Label: "Section", Index: 2, Count: 7}, Course: &sessionstore.ItemRecord{ID: "course", Title: "Course", Kind: "topic"}, Courses: []sessionstore.ItemRecord{{ID: "other", Title: "Other", Kind: "program"}}}}
				if shape != "full" {
					state.Current.Page, state.Current.PageCount = nil, nil
					record.Current.Page, record.Current.PageCount = nil, nil
					state.Current.Items, state.Current.History = nil, nil
					record.Current.Items, record.Current.History = nil, nil
					state.Resume, record.Resume = nil, nil
					if shape == "empty" {
						state.Current.Items, state.Current.History = []flow.Item{}, []flow.Place{}
						record.Current.Items, record.Current.History = []sessionstore.ItemRecord{}, []sessionstore.PlaceRecord{}
						state.Resume = &flow.Bookmark{Courses: []flow.Item{}}
						record.Resume = &sessionstore.BookmarkRecord{Courses: []sessionstore.ItemRecord{}}
					}
				}
				var wantErr error
				if failed {
					wantErr = errors.New("record unavailable")
				}
				spy := &readingRecordsSpy{record: record, err: wantErr}
				sut := ReadingPersistence{Records: spy}
				got, err := sut.Load()
				if !reflect.DeepEqual(got, state) || !errors.Is(err, wantErr) || spy.loads != 1 || len(spy.saved) != 0 {
					t.Fatalf("load: %+v %v spy=%+v", got, err, spy)
				}
				err = sut.Save(state)
				if !errors.Is(err, wantErr) || spy.loads != 1 || !reflect.DeepEqual(spy.saved, []sessionstore.ReadingRecord{record}) {
					t.Fatalf("save: %v spy=%+v", err, spy)
				}
			})
		}
	}
}

type transportRecordsSpy struct {
	record sessionstore.TransportRecord
	saved  []sessionstore.TransportRecord
	loads  int
	err    error
}

func (s *transportRecordsSpy) Load() (sessionstore.TransportRecord, error) {
	s.loads++
	return s.record, s.err
}
func (s *transportRecordsSpy) Save(r sessionstore.TransportRecord) error {
	s.saved = append(s.saved, r)
	return s.err
}
func TestTransportPersistenceTranslatesRecordsAndPreservesErrors(t *testing.T) {
	t.Parallel()
	for _, failed := range []bool{false, true} {
		t.Run(map[bool]string{false: "success", true: "failure"}[failed], func(t *testing.T) {
			t.Parallel()
			var wantErr error
			if failed {
				wantErr = errors.New("transport unavailable")
			}
			spy := &transportRecordsSpy{record: sessionstore.TransportRecord{Offset: 77, Revision: 12}, err: wantErr}
			sut := TransportPersistence{Records: spy}
			got, err := sut.Load()
			if got != (telegram.State{Offset: 77, Revision: 12}) || !errors.Is(err, wantErr) || spy.loads != 1 || len(spy.saved) != 0 {
				t.Fatalf("load: %+v %v spy=%+v", got, err, spy)
			}
			err = sut.Save(telegram.State{Offset: 81, Revision: 14})
			if !errors.Is(err, wantErr) || spy.loads != 1 || !reflect.DeepEqual(spy.saved, []sessionstore.TransportRecord{{Offset: 81, Revision: 14}}) {
				t.Fatalf("save: %v spy=%+v", err, spy)
			}
		})
	}
}

// Contract test: production persistence wires core validation to real shared and migrated files.
func TestReadingPersistenceValidatesRecordsBeforeMigration(t *testing.T) {
	t.Parallel()
	for _, source := range []string{"shared", "web", "bot"} {
		for _, valid := range []bool{false, true} {
			t.Run(source+map[bool]string{false: "/rejected", true: "/accepted"}[valid], func(t *testing.T) {
				t.Parallel()
				dir := t.TempDir()
				c := Config{StatePath: filepath.Join(dir, "shared.json"), LegacyWeb: filepath.Join(dir, "web.json"), LegacyBot: filepath.Join(dir, "bot.json")}
				entity := ""
				if valid {
					entity = "m"
				}
				path, raw := c.StatePath, `{"version":1,"current":{"screen":"entity","entityId":"`+entity+`","page":0,"step":2}}`
				if source == "web" {
					path, raw = c.LegacyWeb, `{"entityId":"`+entity+`","page":0}`
				}
				if source == "bot" {
					path, raw = c.LegacyBot, `{"session":{"screen":"entity","entityId":"`+entity+`","page":0,"step":1}}`
				}
				writeFile(t, path, []byte(raw))
				disk, err := newReadingPersistence(c)
				if err != nil {
					t.Fatal(err)
				}
				got, err := disk.Load()
				if valid {
					if err != nil || got.Current.EntityID != "m" || got.Current.Page == nil || *got.Current.Page != 0 {
						t.Fatalf("loaded: %+v %v", got, err)
					}
					if _, err := os.Stat(c.StatePath); err != nil {
						t.Fatal(err)
					}
				} else {
					if err == nil || err.Error() != "invalid reading place" {
						t.Fatalf("core validation missing: %v", err)
					}
					if source != "shared" {
						if _, err := os.Stat(c.StatePath); !os.IsNotExist(err) {
							t.Fatalf("rejected migration saved: %v", err)
						}
					}
				}
				data, err := os.ReadFile(path)
				if err != nil || string(data) != raw {
					t.Fatalf("source changed: %s %v", data, err)
				}
			})
		}
	}
}
