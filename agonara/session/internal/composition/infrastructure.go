package composition

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// ResolveStatePath resolves existing ancestors without creating a destination.
// Final symlinks are rejected: atomic replacement would write a different file
// from the one read at startup, leaving rollback state ambiguous.
func ResolveStatePath(path string) (string, error) {
	if !filepath.IsAbs(path) {
		return "", errors.New("state paths must be absolute")
	}
	path = filepath.Clean(path)
	info, err := os.Lstat(path)
	if err == nil && info.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("state file must not be a symlink")
	}
	if err != nil && !os.IsNotExist(err) {
		return "", err
	}
	dir, err := resolveDirectory(filepath.Dir(path))
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, filepath.Base(path)), nil
}
func resolveDirectory(path string) (string, error) {
	_, err := os.Lstat(path)
	if err == nil {
		return filepath.EvalSymlinks(path)
	}
	if !os.IsNotExist(err) {
		return "", err
	}
	parent, err := resolveDirectory(filepath.Dir(path))
	if err != nil {
		return "", err
	}
	return filepath.Join(parent, filepath.Base(path)), nil
}

type boundHTTP struct {
	server   *http.Server
	listener net.Listener
}

func (s *boundHTTP) Serve() error                       { return s.server.Serve(s.listener) }
func (s *boundHTTP) Shutdown(ctx context.Context) error { return s.server.Shutdown(ctx) }
func (s *boundHTTP) Close() error {
	if err := s.server.Close(); err != nil {
		return fmt.Errorf("close HTTP server: %w", err)
	}
	return s.listener.Close()
}

func wait(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
