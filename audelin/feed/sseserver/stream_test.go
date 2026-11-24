package sseserver_test

import (
	"bufio"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/sseserver"
)

func TestS1_EachEventIsSentAsItComes(t *testing.T) {
	src := newSource()
	srv := httptest.NewServer(sseserver.NewHandler(src))
	t.Cleanup(srv.Close)

	resp := get(t, srv.URL+"/events?size=180&overlap=60")
	o := <-src.opened
	o.stream.events <- sseserver.Event{Name: "chunk", Data: []byte(`{"words":"a\nb"}`)}

	name, data, ok := frames{bufio.NewReader(resp.Body)}.next(t)

	if !ok || name != "chunk" || data != `{"words":"a\nb"}` {
		t.Fatalf("got %q %q %v", name, data, ok)
	}
	if o.size != 3*time.Minute || o.overlap != time.Minute {
		t.Fatalf("opened with %v/%v", o.size, o.overlap)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content type %q", ct)
	}
}

func TestS2_ARequestThatCannotBeServedIsRefused(t *testing.T) {
	srv := httptest.NewServer(sseserver.NewHandler(newSource()))
	t.Cleanup(srv.Close)

	for query, reason := range map[string]string{
		"":                      "size",
		"?size=0":               "size",
		"?size=1.5":             "size",
		"?size=60&overlap=60":   "overlap",
		"?size=60&overlap=-1":   "overlap",
		"?size=60&overlap=lots": "overlap",
	} {
		resp := get(t, srv.URL+"/events"+query)
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusBadRequest || !strings.Contains(string(body), reason) {
			t.Errorf("%q: %d %q, want 400 naming %s", query, resp.StatusCode, body, reason)
		}
	}
}

func TestS4_TheStreamEndsAfterTheCallsEnd(t *testing.T) {
	src := newSource()
	srv := httptest.NewServer(sseserver.NewHandler(src))
	t.Cleanup(srv.Close)
	resp := get(t, srv.URL+"/events?size=60")
	o := <-src.opened

	o.stream.events <- sseserver.Event{Name: "callEnded", Data: []byte(`{}`), Last: true}

	f := frames{bufio.NewReader(resp.Body)}
	if name, _, ok := f.next(t); !ok || name != "callEnded" {
		t.Fatalf("got %q %v", name, ok)
	}
	if _, _, ok := f.next(t); ok {
		t.Fatal("the stream went on after the end")
	}
}
