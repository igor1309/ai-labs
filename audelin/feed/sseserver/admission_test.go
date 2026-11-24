package sseserver

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

type openFunc func(size, overlap time.Duration) (Stream, error)

func (f openFunc) Open(size, overlap time.Duration) (Stream, error) {
	return f(size, overlap)
}

type nextFunc func(context.Context) (Event, error)

func (f nextFunc) Next(ctx context.Context) (Event, error) { return f(ctx) }

func TestS7_OpeningClientKeepsServerRunning(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name     string
		openErr  error
		wantCode int
		wantBody string
	}{
		{"stream opens", nil, http.StatusOK, "event: chunk\ndata: {}\n\n"},
		{"stream is refused", errors.New("cannot open stream"), http.StatusBadRequest, "cannot open stream\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			readingA := make(chan struct{})
			openingB := make(chan struct{})
			release := make(chan struct{})
			releaseB := sync.OnceFunc(func() { close(release) })
			h := NewHandler(openFunc(func(size, _ time.Duration) (Stream, error) {
				switch size {
				case time.Second:
					return nextFunc(func(ctx context.Context) (Event, error) {
						close(readingA)
						<-ctx.Done()
						return Event{}, ctx.Err()
					}), nil
				case 2 * time.Second:
					close(openingB)
					<-release
					if tc.openErr != nil {
						return nil, tc.openErr
					}
					return nextFunc(func(context.Context) (Event, error) {
						return Event{Name: "chunk", Data: []byte("{}"), Last: true}, nil
					}), nil
				default:
					t.Error("source opened after shutdown")
					return nil, errors.New("unexpected request")
				}
			}))
			start := func(path string) (context.CancelFunc, *httptest.ResponseRecorder, <-chan struct{}) {
				ctx, cancel := context.WithCancel(context.Background())
				r := httptest.NewRequestWithContext(ctx, http.MethodGet, "http://localhost"+path, nil)
				w := httptest.NewRecorder()
				done := make(chan struct{})
				go func() {
					defer close(done)
					h.ServeHTTP(w, r)
				}()
				t.Cleanup(func() {
					cancel()
					releaseB()
					<-done
				})
				return cancel, w, done
			}
			disconnectA, _, doneA := start("/events?size=1")
			<-readingA
			_, responseB, doneB := start("/events?size=2")
			<-openingB

			disconnectA()
			<-doneA

			select {
			case <-h.idle:
				t.Fatal("shutdown started while B was opening")
			default:
			}
			releaseB()
			<-doneB
			if responseB.Code != tc.wantCode || responseB.Body.String() != tc.wantBody {
				t.Fatalf("B got %d %q, want %d %q", responseB.Code, responseB.Body.String(), tc.wantCode, tc.wantBody)
			}
			select {
			case <-h.idle:
			default:
				t.Fatal("shutdown did not start after B finished")
			}

			late := httptest.NewRecorder()
			h.ServeHTTP(late, httptest.NewRequest(http.MethodGet, "http://localhost/events?size=3", nil))
			if late.Code != http.StatusServiceUnavailable {
				t.Fatalf("after shutdown got %d, want 503", late.Code)
			}
		})
	}
}
