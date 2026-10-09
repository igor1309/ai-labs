package pages

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"gopkg.in/yaml.v3"
)

// settingsLayer is a directory selected for inspection, farthest first.
type settingsLayer struct {
	Layer string `json:"layer"`
	Dir   string `json:"dir"`
}

// settingsSelection keeps the worktree root independent of its optional
// settings folder. The binary selects and validates the settings layers.
type settingsSelection struct {
	root   string
	store  fsdefs.Layered
	layers []settingsLayer
}

func selectSettings(path, home string, read func(string) ([]byte, error)) (settingsSelection, error) {
	selected := settingsSelection{store: fsdefs.Layered{Home: fsdefs.Store{Dir: home}}}
	if path != Home && filepath.Clean(filepath.Join(path, ".agister")) != filepath.Clean(home) {
		if !filepath.IsAbs(path) {
			return selected, badRequest("path must be absolute or ~: " + path)
		}
		launch, err := filepath.EvalSymlinks(path)
		if err != nil || !isDir(launch) {
			return selected, notFound("no folder at " + path)
		}
		// Worktrees have a .git file instead of a directory. Pages only
		// discovers the root here; fsdefs owns settings selection below it.
		for dir := launch; ; dir = filepath.Dir(dir) {
			if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
				selected.root = dir
				break
			}
			if filepath.Dir(dir) == dir {
				break
			}
		}
		if selected.root != "" {
			selected.store, err = fsdefs.Select(selected.store.Home, selected.root, launch)
			if err != nil {
				return selected, err
			}
		}
	}
	selected.store = selected.store.WithReadFile(read)
	layers := selected.store.Layers(context.Background())
	for i := len(layers) - 1; i >= 0; i-- {
		layer := layers[i]
		for _, problem := range layer.Invalid {
			return selected, fmt.Errorf("%s: %s", problem.Path, problem.Reason)
		}
		selected.layers = append(selected.layers, settingsLayer{string(layer.Layer), layer.Dir})
	}
	return selected, nil
}

// pageSettingsReader adds Pages' size limit and refuses files that cannot
// safely be read as text. Definition symlinks are followed, as by the binary.
// texts records only files the store actually reads; replaced whole documents
// remain provenance alone and are never opened for the raw inventory either.
func pageSettingsReader(read func(string) ([]byte, error), texts map[string]string) func(string) ([]byte, error) {
	return func(path string) ([]byte, error) {
		info, err := os.Stat(path)
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() || info.Size() > fileCap {
			return nil, definition.ErrNotFound
		}
		data, err := read(path)
		if err == nil && len(data) > fileCap {
			return nil, definition.ErrNotFound
		}
		if err == nil {
			texts[path] = string(data)
		}
		return data, err
	}
}

// The store owns filename recognition and discovery. These kinds are the
// documents the view displays; skills have their own endpoint.
func settingsKinds() []definition.Kind {
	return []definition.Kind{definition.KindAgent, definition.KindPolicy,
		definition.KindProcess, definition.KindRuntime, definition.KindSchema,
		definition.KindVerify, definition.KindPrompt, definition.KindBrief,
		definition.KindWorkflow, definition.KindService}
}

// settingsComposition reads the binary's layered store, including unreferenced
// documents in its inventory. Prompt libraries supply only names a process gives.
func settingsComposition(store fsdefs.Layered) (map[string]string, map[string]any, error) {
	ctx := context.Background()
	composed := map[string]string{}
	sources := map[string]any{}
	add := func(kind definition.Kind, name string, listed bool) error {
		var doc definition.Document
		var err error
		if listed {
			doc, err = store.ReadListed(ctx, kind, name)
		} else {
			doc, err = store.Read(ctx, kind, name)
		}
		if errors.Is(err, definition.ErrNotFound) {
			return nil
		}
		if errors.Is(err, fs.ErrPermission) {
			return err
		}
		file := string(kind) + "/" + filepath.Base(doc.Source.Path)
		if kind == definition.KindService {
			file = "service.toml"
		}
		origin := make([]map[string]any, 0, len(doc.Source.Layers))
		for _, layer := range doc.Source.Layers {
			one := map[string]any{"layer": string(layer.Layer), "path": layer.Path}
			if layer.Fields != nil {
				one["fields"] = layer.Fields
			}
			origin = append(origin, one)
		}
		source := map[string]any{"layers": origin}
		if err != nil {
			source["error"] = err.Error()
		} else {
			composed[file] = string(doc.Bytes)
		}
		sources[file] = source
		return nil
	}
	for _, kind := range settingsKinds() {
		var names []string
		var err error
		if kind == definition.KindService {
			names = []string{"service"} // a singleton, not a folder
		} else {
			names, err = store.List(ctx, kind)
		}
		if err != nil {
			return nil, nil, err
		}
		for _, name := range names {
			if err := add(kind, name, true); err != nil {
				return nil, nil, err
			}
		}
	}
	for file, text := range composed {
		if !strings.HasPrefix(file, "processes/") {
			continue
		}
		var doc struct {
			Prompt   string   `yaml:"prompt"`
			Guidance []string `yaml:"guidance"`
		}
		if yaml.Unmarshal([]byte(text), &doc) != nil {
			continue
		}
		for _, name := range append(doc.Guidance, doc.Prompt) {
			if !definition.ValidName(name) {
				continue
			}
			if err := add(definition.KindPrompt, name, false); err != nil {
				return nil, nil, err
			}
		}
	}
	return composed, sources, nil
}
