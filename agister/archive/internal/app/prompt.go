package app

// promptText is a prompt as the package uses it: the fixed text a process
// names as its prompt or its guidance (ADR-028 rule 8), whatever file says
// it. The reader maps a prompt document to it.
type promptText struct {
	name string
	text string
	// sha256 is the digest of the text, by which a call identifies the
	// prompt it was given.
	sha256 string
}
