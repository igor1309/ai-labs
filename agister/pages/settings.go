package pages

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
	"gopkg.in/yaml.v3"
)

// settingsLayer is a directory selected for inspection, farthest first.
type settingsLayer struct {
	Layer string `json:"layer"`
	Dir   string `json:"dir"`
}

// settingsLayers selects home, the worktree's repository and the nearest
// project below it. Git worktrees have a .git file instead of a folder;
// neither is opened. More than one project layer is refused.
func settingsLayers(path, home string) ([]settingsLayer, error) {
	if path == Home || filepath.Clean(filepath.Join(path, ".agister")) == filepath.Clean(home) {
		return []settingsLayer{{"home", home}}, nil
	}
	if !filepath.IsAbs(path) {
		return nil, badRequest("path must be absolute or ~: " + path)
	}
	launch := filepath.Clean(path)
	if !isDir(launch) {
		return nil, notFound("no folder at " + launch)
	}
	root := ""
	for dir := launch; ; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			root = dir
			break
		}
		if filepath.Dir(dir) == dir {
			break
		}
	}
	layers := []settingsLayer{{"home", home}}
	if root == "" {
		return layers, nil // outside a worktree, the binary reads only home
	}
	add := func(dir, layer string) error {
		if filepath.Clean(dir) == filepath.Clean(home) {
			return nil
		}
		info, err := os.Stat(dir)
		if errors.Is(err, fs.ErrNotExist) {
			if _, lerr := os.Lstat(dir); errors.Is(lerr, fs.ErrNotExist) {
				return nil
			}
		}
		if err != nil {
			return err
		}
		if !info.IsDir() {
			return fmt.Errorf("settings %s: not a directory", dir)
		}
		layers = append(layers, settingsLayer{layer, dir})
		return nil
	}
	if err := add(filepath.Join(root, ".agister"), "repository"); err != nil {
		return nil, err
	}
	var project string
	for dir := launch; dir != root; dir = filepath.Dir(dir) {
		settings := filepath.Join(dir, ".agister")
		before := len(layers)
		if err := add(settings, "project"); err != nil {
			return nil, err
		}
		if len(layers) == before {
			continue
		}
		if project != "" {
			return nil, fmt.Errorf("project layer %s: a second .agister between it and the worktree's root: %s", project, settings)
		}
		project = settings
	}
	return layers, nil
}

// settingsComposition uses the definition language's composition and
// field attribution, also used by the CLI. files stays the selected
// folder's raw inventory; composedFiles and sources are what the view uses.
func settingsComposition(layers []settingsLayer, read func(string) ([]byte, error)) (map[string]string, map[string]any, error) {
	texts := map[string][]definition.LayerText{}
	folders := map[string][]string{}
	for _, layer := range layers {
		files, err := settings(layer.Dir, read)
		if err != nil {
			if layer.Layer == "home" && !isDir(layer.Dir) {
				continue
			}
			return nil, nil, err
		}
		if layer.Layer == "project" {
			if _, err := os.Lstat(filepath.Join(layer.Dir, "blocks.yaml")); !errors.Is(err, fs.ErrNotExist) {
				return nil, nil, fmt.Errorf("project layer %s holds no blocks.yaml: blocks are the repository layer's alone", layer.Dir)
			}
		}
		layerPath := filepath.Join(layer.Dir, "layer.yaml")
		if _, err := os.Lstat(layerPath); !errors.Is(err, fs.ErrNotExist) {
			if layer.Layer == "home" {
				return nil, nil, fmt.Errorf("home holds no layer.yaml: %s", layerPath)
			}
			data, err := read(layerPath)
			if err != nil {
				return nil, nil, err
			}
			spec, err := definition.ParseLayer(data)
			if err != nil {
				return nil, nil, fmt.Errorf("%s: %w", layerPath, err)
			}
			base := filepath.Dir(layer.Dir)
			for _, folder := range spec.Prompts {
				path := filepath.Join(base, folder)
				resolved, err := filepath.EvalSymlinks(path)
				basePath, baseErr := filepath.EvalSymlinks(base)
				rel, relErr := filepath.Rel(basePath, resolved)
				if err != nil || baseErr != nil || relErr != nil || rel != "." && !filepath.IsLocal(rel) || !isDir(path) {
					return nil, nil, fmt.Errorf("%s: prompts folder %s must exist inside %s", layerPath, folder, base)
				}
				folders[layer.Dir] = append(folders[layer.Dir], path)
			}
		}
		for _, file := range sortedSettingsFiles(files) {
			text := files[file]
			texts[file] = append([]definition.LayerText{{File: definition.LayerFile{Layer: definition.Layer(layer.Layer), Path: filepath.Join(layer.Dir, filepath.FromSlash(file))}, Bytes: []byte(text)}}, texts[file]...)
		}
	}
	composed := map[string]string{}
	sources := map[string]any{}
	compose := func(file string, parts []definition.LayerText) error {
		kind := definition.Kind(strings.Split(file, "/")[0])
		if file == "service.toml" {
			kind = definition.KindService
		}
		data, files := parts[0].Bytes, []definition.LayerFile{}
		var err error
		if definition.Composed(kind) {
			data, files, err = definition.Compose(kind, parts)
		} else {
			for _, part := range parts {
				files = append(files, part.File)
			}
		}
		origin := make([]map[string]any, 0, len(files))
		for _, file := range files {
			one := map[string]any{"layer": string(file.Layer), "path": file.Path}
			if file.Fields != nil {
				one["fields"] = file.Fields
			}
			origin = append(origin, one)
		}
		source := map[string]any{"layers": origin}
		if err != nil {
			source["error"] = err.Error()
		} else {
			composed[file] = string(data)
		}
		sources[file] = source
		return err
	}
	for file, parts := range texts {
		_ = compose(file, parts) // one broken document does not hide the rest
	}
	// Library folders supply only the names a composed process gives.
	names := map[string]bool{}
	for file, text := range composed {
		if !strings.HasPrefix(file, "processes/") {
			continue
		}
		var doc struct {
			Prompt   string   `yaml:"prompt"`
			Guidance []string `yaml:"guidance"`
		}
		if yaml.Unmarshal([]byte(text), &doc) == nil {
			for _, name := range append(doc.Guidance, doc.Prompt) {
				if name != "" && filepath.Base(name) == name {
					names[name] = true
				}
			}
		}
	}
	for name := range names {
		file := "prompts/" + name + ".md"
		var parts []definition.LayerText
		for i := len(layers) - 1; i >= 0; i-- {
			layer := layers[i]
			paths := []string{filepath.Join(layer.Dir, "prompts", name+".md")}
			for _, folder := range folders[layer.Dir] {
				paths = append(paths, filepath.Join(folder, name+".md"))
			}
			for _, path := range paths {
				if _, err := os.Lstat(path); errors.Is(err, fs.ErrNotExist) {
					continue
				}
				part := definition.LayerText{File: definition.LayerFile{Layer: definition.Layer(layer.Layer), Path: path}}
				// Farther prompt files are metadata only, as in the CLI.
				if len(parts) == 0 {
					data, err := read(path)
					if err != nil {
						return nil, nil, err
					}
					if len(data) > fileCap {
						return nil, nil, fmt.Errorf("prompt %s exceeds the page's file limit", path)
					}
					part.Bytes = data
				}
				parts = append(parts, part)
				break
			}
		}
		if len(parts) > 0 {
			_ = compose(file, parts)
		}
	}
	return composed, sources, nil
}

// layerDirectories is the selected directories for the skill inventory.
func layerDirectories(layers []settingsLayer) []string {
	dirs := make([]string, len(layers))
	for i, layer := range layers {
		dirs[i] = layer.Dir
	}
	return dirs
}

// sortedSettingsFiles keeps inventory processing stable.
func sortedSettingsFiles(files map[string]string) []string {
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
