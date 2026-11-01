package app

// briefForm is a brief's form as the package uses it: the parts a text
// given as a brief is checked for (ADR-026 rule 8), whatever file says
// them. The reader maps a brief document to it.
type briefForm struct {
	// parts are the form's parts, in the order it declares them.
	parts []briefPart
}

// briefPart is one part of a brief's form.
type briefPart struct {
	// heading is the part's heading line exactly, its Markdown included.
	heading  string
	required bool
	// reads, when set, is the exact text the part must read.
	reads string
	// reference says what the part refers to, which must exist: "file",
	// or nothing.
	reference string
}
