package tree

// Over is the node over under: two maps merge by key, each key both hold
// merged in turn, and the merged map keeps the node's origin; anything
// else replaces under whole. An empty tree is passed over, on either side.
// Which tree is over is the caller's; neither tree is changed.
func (n Node) Over(under Node) Node {
	if n.kind == Empty {
		return under
	}
	if n.kind != Map || under.kind != Map {
		return n
	}
	merged := make(map[string]Node, len(under.entries)+len(n.entries))
	for key, value := range under.entries {
		merged[key] = value
	}
	for key, value := range n.entries {
		merged[key] = value.Over(under.entries[key])
	}
	return Node{kind: Map, origin: n.origin, entries: merged}
}
