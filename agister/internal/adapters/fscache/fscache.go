// Package fscache keeps the disposable working copies of runs' file inputs
// under Agister's cache directory (ADR-026 rule 6). Each copy is in a
// folder named by the sha256 digest of its bytes, so a copy is never
// overwritten with other bytes. The cache may be removed at any time.
package fscache

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Store keeps copies under Dir, as <Dir>/<sha256 hex>/<name>.
type Store struct {
	Dir string
}

// Keep writes data to <Dir>/<digest>/<name> and returns that path,
// absolute. A copy that already holds data is left as it is; any other
// file there is replaced whole, never left half written. It refuses a
// digest that is not data's, and a name that is not one file's.
func (s Store) Keep(digest, name string, data []byte) (string, error) {
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != digest {
		return "", fmt.Errorf("the bytes' sha256 digest is %s, not %s", hex.EncodeToString(sum[:]), digest)
	}
	if name == "" || name == "." || name == ".." || strings.ContainsAny(name, `/\`) {
		return "", fmt.Errorf("%q is not a file name", name)
	}
	dir, err := filepath.Abs(filepath.Join(s.Dir, digest))
	if err != nil {
		return "", err
	}
	path := filepath.Join(dir, name)
	if kept, err := os.ReadFile(path); err == nil && bytes.Equal(kept, data) {
		return path, nil
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	temp, err := os.CreateTemp(dir, ".keep-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(temp.Name())
	if _, err := temp.Write(data); err != nil {
		temp.Close()
		return "", err
	}
	if err := temp.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(temp.Name(), path); err != nil {
		return "", err
	}
	return path, nil
}
