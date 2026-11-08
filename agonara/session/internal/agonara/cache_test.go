package agonara

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type cacheReader struct {
	mu    sync.Mutex
	calls map[string]int
	err   error
}

func (r *cacheReader) call(k string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls[k]++
	return r.err
}
func (r *cacheReader) ListPrograms(context.Context) ([]Program, error) {
	return []Program{{ProgramID: "p"}}, r.call("programs")
}
func (r *cacheReader) Navigation(_ context.Context, id string) (Navigation, error) {
	return Navigation{Topics: []Node{{EntityID: id}}}, r.call("nav " + id)
}
func (r *cacheReader) Entity(_ context.Context, id string) (Entity, error) {
	return Entity{EntityID: id, Body: "exact"}, r.call("entity " + id)
}
func (r *cacheReader) MaterialContent(_ context.Context, id string) (string, error) {
	return "exact **content** " + id, r.call("text " + id)
}
func TestCacheRetainsSuccessfulContentUntilInjectedClockExpires(t *testing.T) {
	t.Parallel()
	now := time.Unix(0, 0)
	r := &cacheReader{calls: map[string]int{}}
	c, err := NewCache(r, time.Minute, func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	read := func() {
		t.Helper()
		ps, _ := c.ListPrograms(ctx)
		nav, _ := c.Navigation(ctx, "p")
		entity, _ := c.Entity(ctx, "m")
		text, _ := c.MaterialContent(ctx, "m")
		if ps[0].ProgramID != "p" || nav.Topics[0].EntityID != "p" || entity.Body != "exact" || text != "exact **content** m" {
			t.Fatal("content altered")
		}
	}
	read()
	read()
	for key, n := range r.calls {
		if n != 1 {
			t.Fatalf("%s read %d times", key, n)
		}
	}
	now = now.Add(time.Minute)
	read()
	for key, n := range r.calls {
		if n != 2 {
			t.Fatalf("%s read %d times after expiry", key, n)
		}
	}
	r.err = errors.New("unavailable")
	for i := 0; i < 2; i++ {
		if _, err = c.MaterialContent(ctx, "failed"); !errors.Is(err, r.err) {
			t.Fatal(err)
		}
	}
	if r.calls["text failed"] != 2 {
		t.Fatal("error cached")
	}
}
func TestCacheRequiresExplicitReaderClockAndLifetime(t *testing.T) {
	t.Parallel()
	r := &cacheReader{}
	now := func() time.Time { return time.Time{} }
	if _, err := NewCache(nil, time.Minute, now); err == nil {
		t.Fatal("nil reader")
	}
	if _, err := NewCache(r, time.Minute, nil); err == nil {
		t.Fatal("nil clock")
	}
	if _, err := NewCache(r, 0, now); err == nil {
		t.Fatal("zero lifetime")
	}
}
