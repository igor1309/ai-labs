// Package fsprovenance reads provenance Agister recorded for revisions it
// produced: <dir>/<revision>.json.
package fsprovenance

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"

	"github.com/igor1309/ai-labs/agister/internal/domain/constraint"
)

type Store struct {
	Dir string
}

var revisionPattern = regexp.MustCompile(`^[0-9a-f]{7,64}$`)

func (s Store) Writer(_ context.Context, revision string) (*constraint.Writer, error) {
	if !revisionPattern.MatchString(revision) {
		return nil, nil
	}
	data, err := os.ReadFile(filepath.Join(s.Dir, revision+".json"))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var record struct {
		Writer *constraint.Writer `json:"writer"`
	}
	if err := json.Unmarshal(data, &record); err != nil {
		return nil, err
	}
	return record.Writer, nil
}
