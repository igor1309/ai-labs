package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// The settings this repository ships carry no comments: home's folder, the
// examples, the repository's layer and each project's. What a document is
// for is its name and fields; why it is so is its commit's message, and a
// choice that must hold is a test.
func TestTheSettingsCarryNoComments(t *testing.T) {
	t.Parallel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	dirs := []string{
		filepath.Join(root, "agister", "home"),
		filepath.Join(root, "agister", "examples"),
		filepath.Join(root, ".agister"),
	}
	projects, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, project := range projects {
		layer := filepath.Join(root, project.Name(), ".agister")
		if info, err := os.Stat(layer); project.IsDir() && err == nil && info.IsDir() {
			dirs = append(dirs, layer)
		}
	}
	checked := 0
	for _, dir := range dirs {
		err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
			if err != nil || entry.IsDir() {
				return err
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			var line int
			switch filepath.Ext(path) {
			case ".yaml", ".yml":
				line, err = yamlComment(data)
			case ".toml":
				line = tomlComment(data)
			default:
				return nil
			}
			if err != nil {
				return err
			}
			checked++
			if line > 0 {
				rel, _ := filepath.Rel(root, path)
				t.Errorf("%s:%d has a comment", rel, line)
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if checked < 50 {
		t.Fatalf("checked %d settings files, want the shipped ones (more than 50)", checked)
	}
}

// yamlComment is the line of the first comment in a YAML document, or 0.
func yamlComment(data []byte) (int, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return 0, err
	}
	var first func(n *yaml.Node) int
	first = func(n *yaml.Node) int {
		if n.HeadComment != "" || n.LineComment != "" || n.FootComment != "" {
			return max(n.Line, 1)
		}
		for _, child := range n.Content {
			if line := first(child); line > 0 {
				return line
			}
		}
		return 0
	}
	return first(&doc), nil
}

var tomlString = regexp.MustCompile(`"(\\.|[^"\\])*"|'[^']*'`)

// tomlComment is the line of the first comment in a TOML document, or 0.
// The shipped documents hold no multi-line strings.
func tomlComment(data []byte) int {
	for i, line := range strings.Split(string(data), "\n") {
		if strings.Contains(tomlString.ReplaceAllString(line, ""), "#") {
			return i + 1
		}
	}
	return 0
}
