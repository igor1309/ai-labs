package run

import "slices"

// Trail is what the runtime reported a call's agent did on the way, over
// every turn of the call, in the order reported: the paths its tool calls
// wrote and the tool calls it was denied. It is evidence and judges
// nothing: the patch says what the call left, the trail what it reached
// for.
type Trail struct {
	// Touched are the paths the agent's tool calls wrote, each as the
	// runtime gave it, neither resolved nor checked, and once, where it was
	// first written.
	Touched []Touched `json:"touched,omitempty"`
	// Denied are the tool calls the runtime refused for want of a
	// permission, every one.
	Denied []Denial `json:"denied,omitempty"`
}

// Touched is a path a tool call wrote, and the tool of its first write.
type Touched struct {
	Path string `json:"path"`
	Tool string `json:"tool"`
}

// Denial is a tool call the runtime refused for want of a permission: the
// tool and its input, as the runtime adapter bounded it.
type Denial struct {
	Tool  string `json:"tool"`
	Input string `json:"input,omitempty"`
}

// Touch is the trail with path, which tool wrote, added: the trail itself
// when it has the path already. A nil trail is an empty one, and the trail
// it is called on is left as it was.
func (t *Trail) Touch(path, tool string) *Trail {
	trail := Trail{}
	if t != nil {
		trail = *t
	}
	for _, touched := range trail.Touched {
		if touched.Path == path {
			return t
		}
	}
	trail.Touched = append(slices.Clip(trail.Touched), Touched{Path: path, Tool: tool})
	return &trail
}

// Deny is the trail with a denial of tool's call added. A nil trail is an
// empty one, and the trail it is called on is left as it was.
func (t *Trail) Deny(tool, input string) *Trail {
	trail := Trail{}
	if t != nil {
		trail = *t
	}
	trail.Denied = append(slices.Clip(trail.Denied), Denial{Tool: tool, Input: input})
	return &trail
}
