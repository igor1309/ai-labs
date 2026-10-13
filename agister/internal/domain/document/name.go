package document

import "regexp"

var namePattern = regexp.MustCompile(`^[a-z][a-z0-9_-]*$`)

// ValidName reports whether name is usable as a definition name.
func ValidName(name string) bool { return namePattern.MatchString(name) }
