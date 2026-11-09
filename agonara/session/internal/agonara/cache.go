package agonara

import (
	"context"
	"errors"
	"sync"
	"time"
)

type Reader interface {
	ListPrograms(context.Context) ([]Program, error)
	Navigation(context.Context, string) (Navigation, error)
	Entity(context.Context, string) (Entity, error)
	MaterialContent(context.Context, string) (string, error)
}

// Cache keeps Agonara's answers for a while, so a page that reads a program,
// a lecture and its contents asks Agonara once. Errors are not kept.
type Cache struct {
	Reader Reader
	TTL    time.Duration
	Now    func() time.Time

	mu      sync.Mutex
	entries map[string]cached
}

func NewCache(reader Reader, ttl time.Duration, now func() time.Time) (*Cache, error) {
	if reader == nil || now == nil || ttl <= 0 {
		return nil, errors.New("content reader, positive TTL and clock are required")
	}
	return &Cache{Reader: reader, TTL: ttl, Now: now}, nil
}

type cached struct {
	value any
	at    time.Time
}

func get[T any](c *Cache, key string, read func() (T, error)) (T, error) {
	now := c.Now
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

func (c *Cache) ListPrograms(ctx context.Context) ([]Program, error) {
	return get(c, "programs", func() ([]Program, error) { return c.Reader.ListPrograms(ctx) })
}

func (c *Cache) Navigation(ctx context.Context, id string) (Navigation, error) {
	return get(c, "navigation "+id, func() (Navigation, error) { return c.Reader.Navigation(ctx, id) })
}

func (c *Cache) Entity(ctx context.Context, id string) (Entity, error) {
	return get(c, "entity "+id, func() (Entity, error) { return c.Reader.Entity(ctx, id) })
}

func (c *Cache) MaterialContent(ctx context.Context, id string) (string, error) {
	return get(c, "content "+id, func() (string, error) { return c.Reader.MaterialContent(ctx, id) })
}
