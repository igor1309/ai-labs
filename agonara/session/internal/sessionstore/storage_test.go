package sessionstore

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
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
			if source != "fresh" {
				writeFile(t, f.LegacyBot, oldBot)
			}
			if source == "web" || source == "shared" {
				writeFile(t, f.LegacyWeb, oldWeb)
			}
			if source == "shared" {
				s := flow.InitialState()
				s.Current.Step = 20
				s.Current.Place = flow.Place{Screen: "entity", EntityID: "shared-material"}
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
			if source == "bot" && (*got.Current.Page != 2 || got.Current.Step != 13) {
				t.Fatalf("bot migration %+v", got)
			}
			for path, data := range map[string][]byte{f.LegacyWeb: oldWeb, f.LegacyBot: oldBot} {
				b, err := os.ReadFile(path)
				if errors.Is(err, os.ErrNotExist) {
					continue
				}
				if err != nil || !reflect.DeepEqual(b, data) {
					t.Fatalf("legacy changed %s", path)
				}
			}
			if again, err := f.Load(); err != nil || !reflect.DeepEqual(got, again) {
				t.Fatalf("restart %+v %v", again, err)
			}
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
			if err := f.Save(flow.InitialState()); err != nil {
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
