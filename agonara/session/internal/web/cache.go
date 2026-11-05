package web

import (
	"context"
	"sync"
	"time"

	"github.com/igor1309/ai-labs/agonara/session/internal/agonara"
	"github.com/igor1309/ai-labs/agonara/session/internal/flow"
)

// Cache keeps Agonara's answers for a while, so a page that reads a program,
// a lecture and its contents asks Agonara once. Errors are not kept.
type Cache struct {
	Reader flow.Reader
	TTL    time.Duration
	Now    func() time.Time

	mu      sync.Mutex
	entries map[string]cached
}

type cached struct {
	value any
	at    time.Time
}

func get[T any](c *Cache, key string, read func() (T, error)) (T, error) {
	now := time.Now
	if c.Now != nil {
		now = c.Now
	}
	c.mu.Lock()
	if entry, ok := c.entries[key]; ok && now().Sub(entry.at) < c.TTL {
		c.mu.Unlock()
		return entry.value.(T), nil
	}
	c.mu.Unlock()
	value, err := read()
	if err != nil {
		return value, err
	}
	c.mu.Lock()
	if c.entries == nil {
		c.entries = map[string]cached{}
	}
	c.entries[key] = cached{value, now()}
	c.mu.Unlock()
	return value, nil
}

func (c *Cache) ListPrograms(ctx context.Context) ([]agonara.Program, error) {
	return get(c, "programs", func() ([]agonara.Program, error) { return c.Reader.ListPrograms(ctx) })
}

func (c *Cache) Navigation(ctx context.Context, id string) (agonara.Navigation, error) {
	return get(c, "navigation "+id, func() (agonara.Navigation, error) { return c.Reader.Navigation(ctx, id) })
}

func (c *Cache) Entity(ctx context.Context, id string) (agonara.Entity, error) {
	return get(c, "entity "+id, func() (agonara.Entity, error) { return c.Reader.Entity(ctx, id) })
}

func (c *Cache) MaterialContent(ctx context.Context, id string) (string, error) {
	return get(c, "content "+id, func() (string, error) { return c.Reader.MaterialContent(ctx, id) })
}
