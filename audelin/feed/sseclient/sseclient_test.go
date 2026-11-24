package sseclient_test

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/igor1309/ai-labs/audelin/feed/sseclient"
)

// server sends each frame it is given on next, flushed, and ends the
// response when next is closed.
func server(t *testing.T) (*httptest.Server, chan string) {
	t.Helper()
	next := make(chan string)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		w.(http.Flusher).Flush()
		for {
			select {
			case frame, ok := <-next:
				if !ok {
					return
				}
				io.WriteString(w, frame)
				w.(http.Flusher).Flush()
			case <-r.Context().Done():
				return
			}
		}
	}))
	t.Cleanup(srv.Close)
	return srv, next
}

func connect(t *testing.T, base string) *sseclient.Stream {
	t.Helper()
	s, err := sseclient.New(base, "callEnded").Connect(context.Background(), time.Minute, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestS1_EachEventIsReadAsItComes(t *testing.T) {
	srv, next := server(t)
	s := connect(t, srv.URL)

	next <- "event: chunk\ndata: {\"a\":1}\n\n"
	ev, err := s.Next()

	if err != nil || ev.Name != "chunk" || string(ev.Data) != `{"a":1}` {
		t.Fatalf("got %+v, %v", ev, err)
	}
}

func TestS2_AServerThatIsNotRunningIsSaid(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	ln.Close()

	_, err = sseclient.New("http://"+addr, "callEnded").Connect(context.Background(), time.Minute, 0)

	if !errors.Is(err, sseclient.ErrNotRunning) {
		t.Fatalf("got %v", err)
	}
}

func TestS3_ARefusedRequestIsSaid(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("size") != "60" || r.URL.Query().Get("overlap") != "0" {
			t.Errorf("asked %s", r.URL.RawQuery)
		}
		http.Error(w, "overlap must be below size", http.StatusBadRequest)
	}))
	t.Cleanup(srv.Close)

	_, err := sseclient.New(srv.URL, "callEnded").Connect(context.Background(), time.Minute, 0)

	var refused *sseclient.RefusedError
	if !errors.As(err, &refused) || refused.Reason != "overlap must be below size" {
		t.Fatalf("got %v", err)
	}
}

func TestS4_ALostConnectionIsSaid(t *testing.T) {
	srv, next := server(t)
	s := connect(t, srv.URL)
	next <- "event: chunk\ndata: {}\n\n"
	s.Next()

	close(next)
	_, err := s.Next()

	if !errors.Is(err, sseclient.ErrLost) {
		t.Fatalf("got %v", err)
	}
}

func TestS5_TheStreamClosingAfterTheEndIsNotALoss(t *testing.T) {
	srv, next := server(t)
	s := connect(t, srv.URL)
	next <- "event: callEnded\ndata: {}\n\n"

	ev, err := s.Next()
	if err != nil || ev.Name != "callEnded" {
		t.Fatalf("got %+v, %v", ev, err)
	}
	close(next)

	if _, err := s.Next(); err != io.EOF {
		t.Fatalf("after the end got %v, want EOF", err)
	}
}
