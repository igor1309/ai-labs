// Package inputs provides caller-param and file input sources.
package inputs

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

// Param passes {name} from the caller's params; a literal is its own identity.
type Param struct{}

func (Param) Resolve(_ context.Context, spec app.InputSpec) (app.Resolved, error) {
	value, ok := spec.Params[spec.Args["name"]]
	if !ok {
		return app.Resolved{}, fmt.Errorf("no param %q", spec.Args["name"])
	}
	return app.Resolved{Value: value, Identity: value}, nil
}

// File reads {path}, relative to the caller's directory, identified by
// digest. It also tells whether a file a brief refers to exists.
type File struct{}

func (File) Resolve(_ context.Context, spec app.InputSpec) (app.Resolved, error) {
	path := spec.Args["path"]
	if path == "" {
		return app.Resolved{}, fmt.Errorf("path is required")
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(spec.Cwd, path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return app.Resolved{}, err
	}
	sum := sha256.Sum256(data)
	return app.Resolved{Value: string(data), Identity: "sha256:" + hex.EncodeToString(sum[:]), File: filepath.Base(path)}, nil
}

// Exists tells whether path names a file or folder; one that cannot be
// looked up for any other reason is an error.
func (File) Exists(_ context.Context, path string) (bool, error) {
	_, err := os.Stat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	return err == nil, err
}
