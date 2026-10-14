// Package fsprobes keeps the probes of runtime versions that passed
// (ADR-029), one file per adapter and version:
// <Dir>/<adapter>/<version>.json.
package fsprobes

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/app"
)

// Store keeps probes under Dir.
type Store struct {
	Dir string
}

// Read is the probe kept for the adapter's version, if one is.
func (s Store) Read(adapter, version string) (app.RuntimeProbe, bool, error) {
	path, err := s.path(adapter, version)
	if err != nil {
		return app.RuntimeProbe{}, false, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return app.RuntimeProbe{}, false, nil
	}
	if err != nil {
		return app.RuntimeProbe{}, false, err
	}
	var probe app.RuntimeProbe
	if err := json.Unmarshal(data, &probe); err != nil {
		return app.RuntimeProbe{}, false, fmt.Errorf("%s: %w", path, err)
	}
	if probe.Version != version {
		return app.RuntimeProbe{}, false, fmt.Errorf("%s holds the probe of version %q", path, probe.Version)
	}
	return probe, true, nil
}

// Write keeps probe as the adapter's, for its version, replacing the file
// whole, never leaving it half written.
func (s Store) Write(adapter string, probe app.RuntimeProbe) error {
	path, err := s.path(adapter, probe.Version)
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(probe, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(path), ".probe-*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if _, err := temp.Write(append(data, '\n')); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(temp.Name(), path)
}

func (s Store) path(adapter, version string) (string, error) {
	for _, name := range []string{adapter, version} {
		if name == "" || name == "." || name == ".." || strings.ContainsAny(name, `/\`) {
			return "", fmt.Errorf("%q is not a file name", name)
		}
	}
	return filepath.Join(s.Dir, adapter, version+".json"), nil
}
