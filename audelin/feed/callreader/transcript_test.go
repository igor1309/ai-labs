package callreader

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func fixture(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

var early = []Part{
	{"Me/2s/1", "Me", 2 * time.Second, "Hello, can you hear me?"},
	{"Them/5s/1", "Them 1", 5 * time.Second, `Yes. The code word is "**Them** 00:00:09".`},
	{"Them/1m4s/1", "Them 2", 64 * time.Second, "Where are call notes saved?"},
	{"Me/1m30s/1", "Me", 90 * time.Second, "Next to the transcript,\nin the call's folder."},
}

func TestReadsEachPartsSpeakerStartAndWords(t *testing.T) {
	got, err := parse(fixture(t, "live.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.parts, early) {
		t.Fatalf("got %q, want %q", got.parts, early)
	}
	if got.origin == nil || len(got.origin.Calls) != 1 || got.origin.Calls[0].Origin.Hearing == nil {
		t.Fatalf("origin %+v, want one call that tells its hearing", got.origin)
	}
}

func TestReadsTheTailAsTheFileShowsIt(t *testing.T) {
	got, err := parse(fixture(t, "live-later.md"))
	if err != nil {
		t.Fatal(err)
	}
	want := append(append([]Part{}, early...),
		Part{"Them/2m5s/1", "Them 1", 125 * time.Second, "And the CLI is called what?"},
		Part{"Me/2m10s/1", "Me", 130 * time.Second, "It is still being"})
	if !reflect.DeepEqual(got.parts, want) {
		t.Fatalf("got %q, want %q", got.parts, want)
	}
}

func TestATranscriptWithNoTextHasNoParts(t *testing.T) {
	got, err := parse(fixture(t, "live-no-text.md"))
	if err != nil || len(got.parts) != 0 || got.origin == nil {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestATranscriptWithNoOriginStillReads(t *testing.T) {
	got, err := parse(fixture(t, "no-origin.md"))
	unnamed := append([]Part(nil), early...)
	unnamed[1].Speaker, unnamed[2].Speaker = "Them", "Them"
	if err != nil || got.origin != nil || !reflect.DeepEqual(got.parts, unnamed) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestPartIDsSurviveRelabelingAndDistinguishRowsInOneSecond(t *testing.T) {
	t.Parallel()
	before, err := parse("# Transcript\n\n**Them** 00:00:05\nOne\n\n**Them** 00:00:05\nTwo\n")
	if err != nil {
		t.Fatal(err)
	}
	if len(before.parts) != 2 || before.parts[0].ID == "" || before.parts[1].ID == "" || before.parts[0].ID == before.parts[1].ID {
		t.Fatalf("want distinct IDs for both rows, got %+v", before.parts)
	}
	after, err := parse("# Transcript\n\n**Them 1** 00:00:02\nSaved late\n\n**Them 1** 00:00:05\nOne revised\n\n**Them 1** 00:00:05\nTwo\n\n**Them 2** 00:00:06\nThree\n")
	if err != nil {
		t.Fatal(err)
	}
	if len(after.parts) != 4 {
		t.Fatalf("want four rows, got %+v", after.parts)
	}
	want := []Part{
		{ID: before.parts[0].ID, Speaker: "Them 1", Start: 5 * time.Second, Words: "One revised"},
		{ID: before.parts[1].ID, Speaker: "Them 1", Start: 5 * time.Second, Words: "Two"},
	}
	if !reflect.DeepEqual(after.parts[1:3], want) {
		t.Fatalf("relabeled parts %+v, want %+v", after.parts[1:3], want)
	}
}

func TestS11_AHalfWrittenLastLineIsLeftForLater(t *testing.T) {
	whole := fixture(t, "live-later.md")
	cut := strings.Index(whole, "And the CLI") + len("And the")

	half, err := parse(whole[:cut])
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(half.parts, early) {
		t.Fatalf("half-written: got %q, want the parts before it", half.parts)
	}
}

func TestTextNotAsAudelinWritesItIsRefused(t *testing.T) {
	for _, text := range []string{"", "hello\n", "## Notes\n\n**Me** 00:00:01\nhi\n"} {
		if _, err := parse(text); err == nil {
			t.Errorf("%q read as a transcript", text)
		}
	}
}
