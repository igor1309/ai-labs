package sessionstore

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Contract test: JSON migration and atomic replacement on the filesystem.
func TestMigrationPrefersSharedThenWebThenBotAndPreservesLegacyBytes(t *testing.T) {
	t.Parallel()
	for _, source := range []string{"shared", "web", "bot", "fresh"} {
		t.Run(source, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			f := readingFile(t, filepath.Join(dir, "shared.json"), filepath.Join(dir, "web-place.json"), filepath.Join(dir, "bot.json"), func(ReadingRecord) error { return nil })
			oldWeb := []byte(`{"programId":"p","entityId":"web-material","title":"Web","page":3}`)
			oldBot := []byte(`{"offset":71,"session":{"screen":"entity","entityId":"bot-material","page":2,"step":13,"items":[],"history":[]}}`)
			created := map[string][]byte{}
			if source != "fresh" {
				created[f.LegacyBot] = oldBot
				writeFile(t, f.LegacyBot, oldBot)
			}
			if source == "web" || source == "shared" {
				created[f.LegacyWeb] = oldWeb
				writeFile(t, f.LegacyWeb, oldWeb)
			}
			if source == "shared" {
				s := initialReading()
				s.Current.Step = 20
				s.Current.PlaceRecord = PlaceRecord{Screen: "entity", EntityID: "shared-material"}
				if err := f.Save(s); err != nil {
					t.Fatal(err)
				}
			}
			got, err := f.Load()
			if err != nil {
				t.Fatal(err)
			}
			want := map[string]string{"shared": "shared-material", "web": "web-material", "bot": "bot-material", "fresh": ""}[source]
			if got.Current.EntityID != want {
				t.Fatalf("source=%s state=%+v", source, got)
			}
			if source == "web" && (*got.Current.Page != 3 || got.Resume.ProgramID != "p") {
				t.Fatalf("web migration %+v", got)
			}
			if source == "bot" && (*got.Current.Page != 2 || got.Current.Step != 14) {
				t.Fatalf("bot migration %+v", got)
			}
			assertLegacy := func() {
				for path, data := range created {
					b, err := os.ReadFile(path)
					if err != nil || !reflect.DeepEqual(b, data) {
						t.Fatalf("legacy changed or missing %s: %v", path, err)
					}
				}
			}
			assertLegacy()
			if again, err := f.Load(); err != nil || !reflect.DeepEqual(got, again) {
				t.Fatalf("restart %+v %v", again, err)
			}
			assertLegacy()
		})
	}
}
func writeFile(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

// Contract test: corrupt files and unavailable filesystem locations fail without replacement.
// Reading semantics belong to core tests; these cases supply the validator decision.
func TestReadingFileRejectsCorruptionAndStorageFailures(t *testing.T) {
	t.Parallel()
	for _, source := range []string{"shared", "web", "bot", "read-error", "write-error", "bad-version"} {
		t.Run(source, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			f := readingFile(t, filepath.Join(dir, "shared.json"), filepath.Join(dir, "web.json"), filepath.Join(dir, "bot.json"), func(ReadingRecord) error { return nil })
			switch source {
			case "shared":
				writeFile(t, f.Path, []byte("{"))
			case "web":
				writeFile(t, f.LegacyWeb, []byte("{"))
			case "bot":
				writeFile(t, f.LegacyBot, []byte("{"))
			case "bad-version":
				writeFile(t, f.Path, []byte(`{"version":8}`))
			case "read-error":
				if err := os.Mkdir(f.Path, 0o700); err != nil {
					t.Fatal(err)
				}
			case "write-error":
				writeFile(t, filepath.Join(dir, "parent"), []byte("file"))
				f.Path = filepath.Join(dir, "parent", "state.json")
			}
			if _, err := f.Load(); err == nil {
				t.Fatalf("%s accepted", source)
			}
			if source == "shared" {
				b, _ := os.ReadFile(f.Path)
				if string(b) != "{" {
					t.Fatal("corrupt state replaced")
				}
			}
		})
	}
}

// Contract test: transport migration writes a distinct file containing no reading state.
func TestTransportMigrationPreservesOffsetAndLegacySession(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	legacy := filepath.Join(dir, "bot.json")
	data := []byte(`{"offset":77,"session":{"step":12,"entityId":"m","page":3}}`)
	writeFile(t, legacy, data)
	f := TransportFile{Path: filepath.Join(dir, "transport.json"), Legacy: legacy}
	got, err := f.Load()
	if err != nil || got.Offset != 77 || got.Revision != 12 {
		t.Fatalf("%+v %v", got, err)
	}
	b, _ := os.ReadFile(f.Path)
	if string(b) != `{"offset":77,"revision":12}` {
		t.Fatalf("transport format %s", b)
	}
	b, _ = os.ReadFile(legacy)
	if string(b) != string(data) {
		t.Fatal("legacy modified")
	}
	writeFile(t, f.Path, []byte("{"))
	if _, err = f.Load(); err == nil {
		t.Fatal("corrupt transport accepted")
	}
}

// Contract test: higher-priority persisted files are authoritative even when older files are corrupt.
func TestHigherPriorityStateIgnoresCorruptLowerPriorityFiles(t *testing.T) {
	t.Parallel()
	for _, shared := range []bool{false, true} {
		dir := t.TempDir()
		f := readingFile(t, filepath.Join(dir, "reading.json"), filepath.Join(dir, "web.json"), filepath.Join(dir, "bot.json"), func(ReadingRecord) error { return nil })
		writeFile(t, f.LegacyBot, []byte("{"))
		if shared {
			if err := f.Save(initialReading()); err != nil {
				t.Fatal(err)
			}
			writeFile(t, f.LegacyWeb, []byte("{"))
		} else {
			writeFile(t, f.LegacyWeb, []byte(`{"entityId":"m","page":1}`))
		}
		state, err := f.Load()
		if err != nil {
			t.Fatal(err)
		}
		if shared && state.Current.Screen != "programs" || !shared && state.Current.EntityID != "m" {
			t.Fatalf("%+v", state)
		}
	}
}

// Contract test: existing version-one JSON is translated and written without a format change.
func TestReadingRecordRetainsAllSemanticFieldsAndExistingJSONShape(t *testing.T) {
	t.Parallel()
	f := readingFile(t, filepath.Join(t.TempDir(), "shared.json"), "", "", func(ReadingRecord) error { return nil })
	fixture := []byte(`{"version":1,"current":{"materialRevision":"rev","screen":"entity","programId":"p","entityId":"m","title":"Lecture","page":1,"contents":true,"pageCount":3,"items":[{"id":"c","title":"Concept","kind":"concept"}],"history":[{"screen":"programs"},{"screen":"program","programId":"p","title":"Program"}],"step":9},"resume":{"ProgramID":"p","EntityID":"m","Title":"Lecture","Page":1,"Position":{"Section":2,"Label":"Section","Index":1,"Count":3},"Course":{"id":"t","title":"Topic","kind":"topic"},"Courses":[{"id":"t","title":"Topic","kind":"topic"}]}}`)
	writeFile(t, f.Path, fixture)
	s, err := f.Load()
	if err != nil {
		t.Fatal(err)
	}
	if s.Current.Step != 9 || s.Current.MaterialRevision != "rev" || *s.Current.Page != 1 || *s.Current.PageCount != 3 || !s.Current.Contents || s.Current.Items[0].ID != "c" || s.Current.History[1].Title != "Program" || s.Resume.Course.ID != "t" || s.Resume.Courses[0].Title != "Topic" || *s.Resume.Position.Section != 2 {
		t.Fatalf("lost fields: %+v", s)
	}
	if err = f.Save(s); err != nil {
		t.Fatal(err)
	}
	written, err := os.ReadFile(f.Path)
	if err != nil {
		t.Fatal(err)
	}
	var want, got any
	if err = json.Unmarshal(fixture, &want); err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(written, &got); err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("format changed: %s %v", written, err)
	}
	again, err := f.Load()
	if err != nil || !reflect.DeepEqual(s, again) {
		t.Fatalf("restart: %+v %v", again, err)
	}
}

// Contract test: the JavaScript bot's JSON retains page bounds, item indices and return history during migration.
func TestStateSavedByJavaScriptBotStillLoads(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	f := readingFile(t, filepath.Join(dir, "shared.json"), "", filepath.Join(dir, "bot.json"), func(ReadingRecord) error { return nil })
	raw := []byte(`{"offset":7,"session":{"screen":"entity","entityId":"material-id","page":2,"items":[{"id":"linked","title":"Linked","kind":"concept"}],"history":[{"screen":"programs"},{"screen":"program","programId":"p","title":"Course"},{"screen":"entity","entityId":"topic-id"}],"step":72,"pageCount":23}}`)
	writeFile(t, f.LegacyBot, raw)
	state, err := f.Load()
	if err != nil {
		t.Fatal(err)
	}
	expected := initialReading()
	expected.Current = SessionRecord{PlaceRecord: PlaceRecord{Screen: "entity", EntityID: "material-id", Page: intPointer(2)}, Items: []ItemRecord{{ID: "linked", Title: "Linked", Kind: "concept"}}, History: []PlaceRecord{{Screen: "programs"}, {Screen: "program", ProgramID: "p", Title: "Course"}, {Screen: "entity", EntityID: "topic-id"}}, Step: 73, PageCount: intPointer(23)}
	expected.Resume = &BookmarkRecord{EntityID: "material-id", Page: 2}
	if !reflect.DeepEqual(state, expected) {
		t.Fatalf("legacy translation: %+v", state)
	}
}
func intPointer(n int) *int { return &n }

// Contract test: validator decisions gate shared records and migrations before any replacement.
func TestReadingFileDelegatesValidationAndPreservesRejectedSources(t *testing.T) {
	t.Parallel()
	for _, source := range []string{"shared", "web", "bot", "fresh"} {
		for _, rejected := range []bool{false, true} {
			t.Run(source+map[bool]string{false: "/accepted", true: "/rejected"}[rejected], func(t *testing.T) {
				t.Parallel()
				dir := t.TempDir()
				candidate := initialReading()
				candidate.Current.Step = 8
				candidate.Current.PlaceRecord = PlaceRecord{Screen: "entity", EntityID: "m", Page: intPointer(2)}
				candidate.Resume = &BookmarkRecord{EntityID: "m", Page: 2}
				var wantErr error
				if rejected {
					wantErr = errors.New("validator rejected candidate")
				}
				var calls []ReadingRecord
				f, err := NewReadingFile(filepath.Join(dir, "shared.json"), filepath.Join(dir, "web.json"), filepath.Join(dir, "bot.json"), func(r ReadingRecord) error {
					calls = append(calls, r)
					if source != "shared" {
						if _, err := os.Stat(filepath.Join(dir, "shared.json")); !os.IsNotExist(err) {
							t.Errorf("migration wrote before validation: %v", err)
						}
					}
					return wantErr
				})
				if err != nil {
					t.Fatal(err)
				}
				original := map[string][]byte{}
				if source != "fresh" {
					original[f.LegacyWeb] = []byte(`{"entityId":"m","page":2}`)
					original[f.LegacyBot] = []byte(`{"session":{"screen":"entity","entityId":"m","page":2,"step":7,"items":[],"history":[]}}`)
				}
				switch source {
				case "shared":
					data, err := json.Marshal(readingFileRecord{Version: 1, ReadingRecord: candidate})
					if err != nil {
						t.Fatal(err)
					}
					original[f.Path] = data
				case "bot":
					delete(original, f.LegacyWeb)
				case "fresh":
					candidate = initialReading()
				}
				for path, data := range original {
					writeFile(t, path, data)
				}
				got, err := f.Load()
				if !errors.Is(err, wantErr) || !reflect.DeepEqual(got, candidate) || !reflect.DeepEqual(calls, []ReadingRecord{candidate}) {
					t.Fatalf("state=%+v err=%v calls=%+v want=%+v", got, err, calls, candidate)
				}
				for path, data := range original {
					got, err := os.ReadFile(path)
					if err != nil || string(got) != string(data) {
						t.Fatalf("source changed: %s %v", path, err)
					}
				}
				if source != "shared" {
					data, err := os.ReadFile(f.Path)
					if rejected {
						if !os.IsNotExist(err) {
							t.Fatalf("rejected migration became authoritative: %s %v", data, err)
						}
					} else {
						var record readingFileRecord
						if err != nil {
							t.Fatal(err)
						}
						if err := json.Unmarshal(data, &record); err != nil || record.Version != 1 || !reflect.DeepEqual(record.ReadingRecord, candidate) {
							t.Fatalf("saved migration: %s %v", data, err)
						}
					}
				}
			})
		}
	}
}

func TestReadingFileRequiresValidator(t *testing.T) {
	t.Parallel()
	if f, err := NewReadingFile("reading.json", "", "", nil); err == nil || f != nil {
		t.Fatalf("missing validator accepted: %v %v", f, err)
	}
}

func readingFile(t *testing.T, path, web, bot string, validate func(ReadingRecord) error) *ReadingFile {
	t.Helper()
	f, err := NewReadingFile(path, web, bot, validate)
	if err != nil {
		t.Fatal(err)
	}
	return f
}
