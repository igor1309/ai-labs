package documents

import "slices"

// Layering composes trees field by field, or selects a file whole
// (ADR-002, rules 3 and 4).

// nearest is the file of the nearest layer among files, which holds at
// least one; of two files of one layer, the later, as Compose layers them.
func nearest(files []File) File {
	found := files[0]
	for _, file := range files[1:] {
		if file.Layer >= found.Layer {
			found = file
		}
	}
	return found
}

// merged is over composed onto base, which may be nil: maps merge by key at
// every depth, a key only over holds coming after base's keys, and lists,
// scalars and unlike values replace whole. A map with no keys over a map
// changes nothing. It changes neither tree: what both leave unchanged is
// shared.
func merged(base, over *node) *node {
	if base == nil || !base.isMap || !over.isMap {
		return over
	}
	result := &node{isMap: true, origin: base.origin, entries: slices.Clone(base.entries)}
	for _, item := range over.entries {
		at := slices.IndexFunc(result.entries, func(e entry) bool { return e.key == item.key })
		if at < 0 {
			result.entries = append(result.entries, item)
			continue
		}
		result.entries[at].value = merged(result.entries[at].value, item.value)
	}
	return result
}

// fields appends to list the fields of n, at path, depth first.
func (n *node) fields(path []string, list []Field) []Field {
	if n == nil {
		return list
	}
	for _, entry := range n.entries {
		at := append(slices.Clone(path), entry.key)
		value := entry.value
		switch {
		case value.isMap && len(value.entries) > 0:
			list = value.fields(at, list)
		case value.isMap:
			list = append(list, Field{Path: at, Value: map[string]any{}, Origin: value.origin})
		default:
			list = append(list, Field{Path: at, Value: value.value, Origin: value.origin})
		}
	}
	return list
}
