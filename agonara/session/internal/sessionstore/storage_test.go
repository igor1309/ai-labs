package sessionstore

import (
	"encoding/json"
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
			f := ReadingFile{Path: filepath.Join(dir, "shared.json"), LegacyWeb: filepath.Join(dir, "web-place.json"), LegacyBot: filepath.Join(dir, "bot.json")}
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
func TestReadingFileRejectsCorruptionAndStorageFailures(t *testing.T) {
	t.Parallel()
	for _, source := range []string{"shared", "web", "bot", "read-error", "write-error", "bad-version", "bad-place"} {
		t.Run(source, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			f := ReadingFile{Path: filepath.Join(dir, "shared.json"), LegacyWeb: filepath.Join(dir, "web.json"), LegacyBot: filepath.Join(dir, "bot.json")}
			switch source {
			case "shared":
				writeFile(t, f.Path, []byte("{"))
			case "web":
				writeFile(t, f.LegacyWeb, []byte("{"))
			case "bot":
				writeFile(t, f.LegacyBot, []byte("{"))
			case "bad-version":
				writeFile(t, f.Path, []byte(`{"version":8}`))
			case "bad-place":
				writeFile(t, f.LegacyWeb, []byte(`{"page":-1,"entityId":"m"}`))
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
		f := ReadingFile{Path: filepath.Join(dir, "reading.json"), LegacyWeb: filepath.Join(dir, "web.json"), LegacyBot: filepath.Join(dir, "bot.json")}
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
	f := ReadingFile{Path: filepath.Join(t.TempDir(), "shared.json")}
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
	f := ReadingFile{Path: filepath.Join(dir, "shared.json"), LegacyBot: filepath.Join(dir, "bot.json")}
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

// Contract test: invalid version-one records remain authoritative failures without filesystem replacement or legacy fallback.
func TestInvalidReadingRecordsArePreservedWithoutLegacyFallback(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct{ name, fields string }{
		{"revision", `"current":{"screen":"programs","step":-1}`},
		{"screen", `"current":{"screen":"unknown"}`},
		{"program identity", `"current":{"screen":"program"}`},
		{"material identity", `"current":{"screen":"entity"}`},
		{"negative page", `"current":{"screen":"entity","entityId":"m","page":-1}`},
		{"page count", `"current":{"screen":"entity","entityId":"m","page":0,"pageCount":0}`},
		{"missing page", `"current":{"screen":"entity","entityId":"m","pageCount":1}`},
		{"page outside count", `"current":{"screen":"entity","entityId":"m","page":2,"pageCount":2}`},
		{"history identity", `"current":{"screen":"programs","history":[{"screen":"program"}]}`},
		{"history page", `"current":{"screen":"programs","history":[{"screen":"entity","entityId":"m","page":-1}]}`},
		{"bookmark identity", `"current":{"screen":"programs"},"resume":{"Page":0}`},
		{"bookmark page", `"current":{"screen":"programs"},"resume":{"EntityID":"m","Page":-1}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			f := ReadingFile{Path: filepath.Join(dir, "reading.json"), LegacyWeb: filepath.Join(dir, "web.json")}
			raw := []byte(`{"version":1,` + tc.fields + `}`)
			writeFile(t, f.Path, raw)
			writeFile(t, f.LegacyWeb, []byte(`{"entityId":"legacy","page":1}`))
			if _, err := f.Load(); err == nil {
				t.Fatal("invalid shared record replaced with legacy state")
			}
			got, err := os.ReadFile(f.Path)
			if err != nil || string(got) != string(raw) {
				t.Fatalf("invalid record changed: %s %v", got, err)
			}
		})
	}
}
