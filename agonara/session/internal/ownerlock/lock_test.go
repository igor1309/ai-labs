package ownerlock

import (
	"path/filepath"
	"testing"
)

// Contract test: kernel file locks reject an overlapping owner and release on close.
func TestOneOwnerUntilClose(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "owner.lock")
	first, err := Acquire(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { first.Close() })
	if duplicate, err := Acquire(path); err == nil {
		duplicate.Close()
		t.Fatal("second owner accepted")
	}
	if err = first.Close(); err != nil {
		t.Fatal(err)
	}
	next, err := Acquire(path)
	if err != nil {
		t.Fatal(err)
	}
	defer next.Close()
}
