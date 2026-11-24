package callevents_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/callevents"
)

func TestS13_NewWordsCanBeToldFromTheOverlap(t *testing.T) {
	before := part("me", 30*time.Second, "before")
	inOverlap := part("them", 2*time.Minute+30*time.Second, "question?")
	after := part("me", 4*time.Minute, "answer")
	e, _ := newEvents(t, heard(before, inOverlap, after), 3*time.Minute, time.Minute)
	next(t, e)

	w := next(t, e).Window

	want := callevents.Window{From: 2 * time.Minute, To: 5 * time.Minute,
		Context: []callevents.Part{inOverlap}, New: []callevents.Part{after}}
	if !reflect.DeepEqual(w, want) {
		t.Fatalf("got %+v, want %+v", w, want)
	}
}

func TestS14_AnOverlapAloneReadsAsNoNewWords(t *testing.T) {
	inOverlap := part("them", 2*time.Minute+30*time.Second, "last words")
	e, _ := newEvents(t, heard(inOverlap), 3*time.Minute, time.Minute)
	next(t, e)

	w := next(t, e).Window

	if len(w.New) != 0 || !reflect.DeepEqual(w.Context, []callevents.Part{inOverlap}) {
		t.Fatalf("got %+v, want the overlap as context and no new words", w)
	}
}
