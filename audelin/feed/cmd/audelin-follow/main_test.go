package main

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func serve(t *testing.T, frames ...string) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("size") != "30" || r.URL.Query().Get("overlap") != "10" {
			http.Error(w, "size and overlap not passed on", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		for _, f := range frames {
			io.WriteString(w, f)
		}
	}))
	t.Cleanup(srv.Close)
	return strconv.Itoa(srv.Listener.Addr().(*net.TCPAddr).Port)
}

func follow(t *testing.T, port string) (string, string, int) {
	t.Helper()
	var out, errOut bytes.Buffer
	code := run(context.Background(), []string{"-port", port, "-size", "30", "-overlap", "10"}, &out, &errOut)
	return out.String(), errOut.String(), code
}

func TestPrintsTheSourcesEventsAsRecords(t *testing.T) {
	port := serve(t,
		"event: noCall\ndata: {}\n\n",
		`event: chunk`+"\n"+`data: {"from":20,"to":50,"context":[{"speaker":"Me","start":25,"words":"old"}],"new":[{"speaker":"Them","start":41,"words":"new"}]}`+"\n\n",
		"event: callEnded\ndata: {}\n\n")

	out, _, code := follow(t, port)

	lines := strings.Split(strings.TrimSpace(out), "\n")
	if code != 0 || len(lines) != 3 {
		t.Fatalf("exit %d, output:\n%s", code, out)
	}
	for _, want := range []string{`"type":"no_call"`, `"from":"00:00:20"`, `"at":"00:00:41","words":"new"`, `"type":"call_ended"`} {
		if !strings.Contains(out, want) {
			t.Errorf("output lacks %s:\n%s", want, out)
		}
	}
}

func TestALostSourceExitsOne(t *testing.T) {
	port := serve(t, "event: noCall\ndata: {}\n\n")

	out, _, code := follow(t, port)

	if code != 1 || !strings.Contains(out, `"type":"source_lost"`) {
		t.Fatalf("exit %d, output:\n%s", code, out)
	}
}

func TestNoSourceExitsTwo(t *testing.T) {
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	port := strconv.Itoa(ln.Addr().(*net.TCPAddr).Port)
	ln.Close()

	_, errOut, code := follow(t, port)

	if code != 2 || !strings.Contains(errOut, "could not start") {
		t.Fatalf("exit %d, stderr %q", code, errOut)
	}
}

func TestARefusalExitsThreeWithItsReason(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "overlap must be below size", http.StatusBadRequest)
	}))
	t.Cleanup(srv.Close)

	_, errOut, code := follow(t, strconv.Itoa(srv.Listener.Addr().(*net.TCPAddr).Port))

	if code != 3 || !strings.Contains(errOut, "overlap must be below size") {
		t.Fatalf("exit %d, stderr %q", code, errOut)
	}
}
