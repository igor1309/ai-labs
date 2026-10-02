package definition

import (
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

// Strict YAML reading over yaml.Node: unknown fields and wrong types are
// reported with field paths, and mapping order is preserved where it matters.

type pair struct {
	key   string
	value *yaml.Node
}

func parseYAML(data []byte, p *problems) *yaml.Node {
	if !readable(data, p) {
		return nil
	}
	var document yaml.Node
	if err := yaml.Unmarshal(data, &document); err != nil {
		p.add("", "%v", err)
		return nil
	}
	if len(document.Content) == 0 {
		p.add("", "empty document")
		return nil
	}
	return document.Content[0]
}

func mapping(node *yaml.Node, field string, p *problems) []pair {
	if node == nil {
		return nil
	}
	if node.Kind != yaml.MappingNode {
		p.add(field, "must be a mapping")
		return nil
	}
	pairs := make([]pair, 0, len(node.Content)/2)
	for i := 0; i+1 < len(node.Content); i += 2 {
		pairs = append(pairs, pair{key: node.Content[i].Value, value: node.Content[i+1]})
	}
	return pairs
}

// declared counts the entries of key in a mapping; none in anything else.
func declared(node *yaml.Node, key string) int {
	count := 0
	if node != nil && node.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(node.Content); i += 2 {
			if node.Content[i].Value == key {
				count++
			}
		}
	}
	return count
}

// fields returns a mapping's values by key and reports keys not in allowed.
func fields(node *yaml.Node, field string, allowed []string, p *problems) map[string]*yaml.Node {
	out := map[string]*yaml.Node{}
	for _, entry := range mapping(node, field, p) {
		if !contains(allowed, entry.key) {
			p.unknown(join(field, entry.key), "unknown field")
			continue
		}
		out[entry.key] = entry.value
	}
	return out
}

func scalar(node *yaml.Node, field string, p *problems) (string, bool) {
	if node == nil {
		return "", false
	}
	if node.Kind != yaml.ScalarNode || node.Tag == "!!null" {
		p.add(field, "must be a scalar")
		return "", false
	}
	return node.Value, true
}

func nonEmpty(node *yaml.Node, field string, p *problems) string {
	value, ok := scalar(node, field, p)
	if ok && value == "" {
		p.add(field, "must not be empty")
	}
	return value
}

func required(values map[string]*yaml.Node, key, field string, p *problems) string {
	node, ok := values[key]
	if !ok {
		p.add(join(field, key), "is required")
		return ""
	}
	return nonEmpty(node, join(field, key), p)
}

func stringList(node *yaml.Node, field string, p *problems) []string {
	if node == nil {
		return nil
	}
	if node.Kind != yaml.SequenceNode {
		p.add(field, "must be a list")
		return nil
	}
	items := make([]string, 0, len(node.Content))
	for i, item := range node.Content {
		value, ok := scalar(item, fieldIndex(field, i), p)
		if ok {
			items = append(items, value)
		}
	}
	return items
}

func boolean(node *yaml.Node, field string, p *problems) (bool, bool) {
	var value bool
	if node == nil {
		return false, false
	}
	if err := node.Decode(&value); err != nil || node.Tag != "!!bool" {
		p.add(field, "must be true or false")
		return false, false
	}
	return value, true
}

func integer(node *yaml.Node, field string, p *problems) (int, bool) {
	var value int
	if node == nil {
		return 0, false
	}
	if err := node.Decode(&value); err != nil || node.Tag != "!!int" {
		p.add(field, "must be an integer")
		return 0, false
	}
	return value, true
}

func number(node *yaml.Node, field string, p *problems) (float64, bool) {
	var value float64
	if node == nil {
		return 0, false
	}
	if err := node.Decode(&value); err != nil || (node.Tag != "!!float" && node.Tag != "!!int") {
		p.add(field, "must be a number")
		return 0, false
	}
	return value, true
}

func duration(text, field string, p *problems) (time.Duration, bool) {
	value, err := time.ParseDuration(text)
	if err != nil || value <= 0 {
		p.add(field, "invalid duration %q (use e.g. 90s, 20m, 1h)", text)
		return 0, false
	}
	return value, true
}

func fieldIndex(field string, index int) string {
	return field + "[" + strconv.Itoa(index) + "]"
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}
