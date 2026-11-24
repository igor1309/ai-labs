package sseserver_test

import (
	"bufio"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/sseserver"
)

func TestS3_TwoClientsGetTheirOwnWindows(t *testing.T) {
	src := newSource()
	srv := httptest.NewServer(sseserver.NewHandler(src))
	t.Cleanup(srv.Close)
	a := get(t, srv.URL+"/events?size=60")
	oa := <-src.opened
	b := get(t, srv.URL+"/events?size=180&overlap=60")
	ob := <-src.opened

	ob.stream.events <- sseserver.Event{Name: "chunk", Data: []byte(`"b"`)}
	oa.stream.events <- sseserver.Event{Name: "chunk", Data: []byte(`"a"`)}

	if _, data, _ := (frames{bufio.NewReader(a.Body)}).next(t); data != `"a"` {
		t.Fatalf("a read %s", data)
	}
	if _, data, _ := (frames{bufio.NewReader(b.Body)}).next(t); data != `"b"` {
		t.Fatalf("b read %s", data)
	}
	if oa.size != time.Minute || ob.size != 3*time.Minute || ob.overlap != time.Minute {
		t.Fatalf("opened %v and %v/%v", oa.size, ob.size, ob.overlap)
	}
}

// Contract test: a loopback client closing its HTTP response cancels the source's read.
func TestS5_AClientLeavingLetsItsSourceGo(t *testing.T) {
	t.Parallel()
	src := newSource()
	srv := httptest.NewServer(sseserver.NewHandler(src))
	t.Cleanup(srv.Close)
	first := get(t, srv.URL+"/events?size=60")
	o := <-src.opened
	get(t, srv.URL+"/events?size=60")
	<-src.opened

	first.Body.Close()
	<-o.stream.let

	later := get(t, srv.URL+"/events?size=60")
	ol := <-src.opened
	ol.stream.events <- sseserver.Event{Name: "noCall", Data: []byte(`{}`)}
	if name, _, ok := (frames{bufio.NewReader(later.Body)}).next(t); !ok || name != "noCall" {
		t.Fatalf("later client read %q %v", name, ok)
	}
}

func TestS7_TheLastClientLeavingEndsTheProgram(t *testing.T) {
	ln, err := sseserver.Listen(0)
	if err != nil {
		t.Fatal(err)
	}
	src := newSource()
	served := make(chan error, 1)
	go func() { served <- sseserver.Serve(ln, src) }()
	url := "http://" + ln.Addr().String() + "/events?size=60"
	one := get(t, url)
	o1 := <-src.opened
	two := get(t, url)
	o2 := <-src.opened

	one.Body.Close()
	<-o1.stream.let
	o2.stream.events <- sseserver.Event{Name: "chunk", Data: []byte(`{}`)}
	if _, _, ok := (frames{bufio.NewReader(two.Body)}).next(t); !ok {
		t.Fatal("the other client was cut when one left")
	}
	two.Body.Close()

	if err := <-served; err != nil {
		t.Fatalf("serve ended with %v", err)
	}
	if _, err := http.Get(url); err == nil {
		t.Fatal("still serving after the last client left")
	}
}
