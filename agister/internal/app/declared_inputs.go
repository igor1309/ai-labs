package app

// declaredParam is a param as the package uses it: a value the caller of a
// process or a workflow supplies, whatever file declares it. The reader
// maps a declared param to it.
type declaredParam struct {
	name string
	// defaultValue is the value of a param the caller does not supply,
	// where hasDefault says the param has one: an empty default is one
	// too.
	defaultValue string
	hasDefault   bool
}

// declaredValue is an input value as the package uses it: one input the
// agent receives and where it comes from, whatever file declares it. The
// reader maps a declared value to it.
type declaredValue struct {
	name string
	// source is the kind of its input source, such as "git.diff", "file"
	// or "param".
	source string
	// args are the source's arguments. They may reference ${param.<name>}
	// and ${value.<name>}, the resolved text of an input value declared
	// before this one.
	args map[string]string
	// forms are the brief forms its text must have one of (ADR-026 rule
	// 8), by name; none: its text is not checked.
	forms []string
}
