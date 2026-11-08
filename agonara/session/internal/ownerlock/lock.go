// Package ownerlock prevents overlapping local owners, including pollers started by hand.
package ownerlock

import (
	"fmt"
	"os"
	"syscall"
)

type Lock struct{ file *os.File }

func Acquire(path string) (*Lock, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, fmt.Errorf("runner already owns %s: %w", path, err)
	}
	return &Lock{f}, nil
}
func (l *Lock) Close() error { return l.file.Close() }
