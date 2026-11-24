package callreader

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

// calls makes a temp calls folder with each named folder holding the
// named fixture as its transcript; an empty fixture makes no transcript.
func calls(t *testing.T, folders map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, fx := range folders {
		save(t, dir, name, fx)
	}
	return dir
}

func save(t *testing.T, dir, name, fx string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(dir, name), 0o755); err != nil {
		t.Fatal(err)
	}
	if fx == "" {
		return
	}
	if err := os.WriteFile(filepath.Join(dir, name, "transcript.md"), []byte(fixture(t, fx)), 0o644); err != nil {
		t.Fatal(err)
	}
}

var moscow = time.FixedZone("MSK", 3*3600)

func live(t *testing.T, r *Reader) (Call, bool) {
	t.Helper()
	call, ok, err := r.Live()
	if err != nil {
		t.Fatal(err)
	}
	return call, ok
}

func TestS1_WithNoCallRecordingThereIsNoLiveCall(t *testing.T) {
	dir := calls(t, map[string]string{
		"2026.11.24-0900 Standup": "finished.md",
		"2026.11.24-1000":         "split-told.md",
		"2026.11.20-1200 Old":     "no-origin.md",
		"notes":                   "live.md",
	})

	if call, ok := live(t, New(dir, moscow)); ok {
		t.Fatalf("live: %+v", call)
	}
}

func TestS2_TheCallBeingRecordedIsTheLiveCall(t *testing.T) {
	dir := calls(t, map[string]string{
		"2026.11.24-0900 Standup":  "finished.md",
		"2026.11.24-1015 Planning": "live.md",
		"2026.11.24-1030":          "",
	})

	call, ok := live(t, New(dir, moscow))

	if !ok || call.ID != "2026.11.24-1015" || !call.Start.Equal(time.Date(2026, 11, 24, 10, 15, 0, 0, moscow)) {
		t.Fatalf("got %+v, %v", call, ok)
	}
	if call.Ended || !reflect.DeepEqual(call.Parts, early) {
		t.Fatalf("parts %q, ended %v", call.Parts, call.Ended)
	}
}

func TestACallWithLiveTextOffIsLiveWithNoParts(t *testing.T) {
	dir := calls(t, map[string]string{"2026.11.24-1015": "live-no-text.md"})

	call, ok := live(t, New(dir, moscow))

	if !ok || len(call.Parts) != 0 {
		t.Fatalf("got %+v, %v", call, ok)
	}
}

func TestS2_DiscoverySkipsNewerIneligibleTranscripts(t *testing.T) {
	t.Parallel()
	for _, fixture := range []string{"finished.md", "split-told.md", "merged.md", "no-origin.md"} {
		t.Run(fixture, func(t *testing.T) {
			t.Parallel()
			dir := calls(t, map[string]string{
				"2026.11.24-0900": "live-later.md",
				"2026.11.24-1015": "live.md",
				"2026.11.24-1100": fixture,
			})

			call, ok := live(t, New(dir, moscow))

			if !ok || call.ID != "2026.11.24-1015" || call.Ended || !reflect.DeepEqual(call.Parts, early) {
				t.Fatalf("got %+v, %v; want the newest recording and its parts", call, ok)
			}
		})
	}
}

func TestS8_AMergedTranscriptIsNeverLive(t *testing.T) {
	dir := calls(t, map[string]string{
		"2026.11.24-0900":        "finished.md",
		"2026.11.24-1100 Merged": "merged.md",
	})

	if call, ok := live(t, New(dir, moscow)); ok {
		t.Fatalf("live: %+v", call)
	}
}

func TestS9_TheLaterOfTwoCallsInOneMinuteIsLive(t *testing.T) {
	dir := calls(t, map[string]string{
		"2026.11.24-1015 First":   "live.md",
		"2026.11.24-1015-2 Again": "live-later.md",
	})

	call, ok := live(t, New(dir, moscow))

	if !ok || call.ID != "2026.11.24-1015-2" || len(call.Parts) != 6 {
		t.Fatalf("got %s with %d parts, %v", call.ID, len(call.Parts), ok)
	}
}

func TestS3_NewTextOfTheFollowedCallIsRead(t *testing.T) {
	dir := calls(t, map[string]string{"2026.11.24-1015": "live.md"})
	r := New(dir, moscow)
	live(t, r)

	save(t, dir, "2026.11.24-1015", "live-later.md")
	call, ok := live(t, r)

	if !ok || call.Ended || len(call.Parts) != 6 {
		t.Fatalf("got %d parts, ended %v, %v", len(call.Parts), call.Ended, ok)
	}
}

func TestS4_AFinishingStageToldEndsTheCall(t *testing.T) {
	for _, fx := range []string{"finished.md", "split-told.md"} {
		dir := calls(t, map[string]string{"2026.11.24-1015": "live.md"})
		r := New(dir, moscow)
		live(t, r)

		save(t, dir, "2026.11.24-1015", fx)
		call, ok := live(t, r)

		if !ok || !call.Ended {
			t.Fatalf("%s: ended %v, %v", fx, call.Ended, ok)
		}
	}
}

func TestS7_ANewerCallDoesNotTakeTheFollowedOnesPlace(t *testing.T) {
	dir := calls(t, map[string]string{"2026.11.24-1015": "live.md"})
	r := New(dir, moscow)
	live(t, r)

	save(t, dir, "2026.11.24-1100", "live-later.md")
	call, ok := live(t, r)

	if !ok || call.ID != "2026.11.24-1015" || len(call.Parts) != 4 {
		t.Fatalf("got %s with %d parts, %v", call.ID, len(call.Parts), ok)
	}
}

func TestS10_ARenamedFolderIsStillFollowed(t *testing.T) {
	dir := calls(t, map[string]string{"2026.11.24-1015-2": "live.md"})
	r := New(dir, moscow)
	live(t, r)

	if err := os.Rename(filepath.Join(dir, "2026.11.24-1015-2"), filepath.Join(dir, "2026.11.24-1015-2 Planning")); err != nil {
		t.Fatal(err)
	}
	save(t, dir, "2026.11.24-1015-2 Planning", "live-later.md")
	call, ok := live(t, r)

	if !ok || call.ID != "2026.11.24-1015-2" || len(call.Parts) != 6 {
		t.Fatalf("got %s with %d parts, %v", call.ID, len(call.Parts), ok)
	}
}

// following gives a reader following a live call in a temp calls folder.
func following(t *testing.T) (*Reader, string) {
	t.Helper()
	dir := calls(t, map[string]string{"2026.11.24-1015": "live.md"})
	r := New(dir, moscow)
	live(t, r)
	return r, filepath.Join(dir, "2026.11.24-1015")
}

func failed(t *testing.T, r *Reader) {
	t.Helper()
	call, ok, err := r.Live()
	if err == nil || ok || call.Ended {
		t.Fatalf("got %+v, %v, %v; want a failed read", call, ok, err)
	}
}

func TestS5_AVanishedTranscriptIsAFailedRead(t *testing.T) {
	r, folder := following(t)
	if err := os.Remove(filepath.Join(folder, "transcript.md")); err != nil {
		t.Fatal(err)
	}
	failed(t, r)
}

func TestS5_AVanishedFolderIsAFailedRead(t *testing.T) {
	r, folder := following(t)
	if err := os.RemoveAll(folder); err != nil {
		t.Fatal(err)
	}
	failed(t, r)
}

func TestS5_AnUnreadableTranscriptIsAFailedRead(t *testing.T) {
	r, folder := following(t)
	path := filepath.Join(folder, "transcript.md")
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0o755); err != nil {
		t.Fatal(err)
	}
	failed(t, r)
}

func TestS6_AMalformedTranscriptIsAFailedRead(t *testing.T) {
	r, folder := following(t)
	if err := os.WriteFile(filepath.Join(folder, "transcript.md"), []byte("not a transcript\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	failed(t, r)

	save(t, filepath.Dir(folder), "2026.11.24-1015", "live-later.md")
	if call, ok := live(t, r); !ok || len(call.Parts) != 6 {
		t.Fatalf("after the failure: %d parts, %v", len(call.Parts), ok)
	}
}

func TestS6_AMalformedTranscriptOnDiscoveryIsAFailedRead(t *testing.T) {
	t.Parallel()
	const newest = "2026.11.24-1015"
	dir := calls(t, map[string]string{"2026.11.24-0900": "live.md", newest: ""})
	path := filepath.Join(dir, newest, "transcript.md")
	if err := os.WriteFile(path, []byte("---\n{\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := New(dir, moscow)

	if call, ok, err := r.Live(); ok || !errors.Is(err, errNotATranscript) {
		t.Fatalf("got %+v, %v, %v; want a parse error", call, ok, err)
	}
	save(t, dir, newest, "live.md")
	if call, ok := live(t, r); !ok || call.ID != newest || !reflect.DeepEqual(call.Parts, early) {
		t.Fatalf("after the failure: %+v, %v; want the repaired transcript", call, ok)
	}
}

func TestAMissingCallsFolderIsAFailedRead(t *testing.T) {
	r := New(filepath.Join(t.TempDir(), "none"), moscow)
	if _, _, err := r.Live(); err == nil {
		t.Fatal("no error")
	}
}
