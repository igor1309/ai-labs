package app

// givenSkill is a skill as the package uses it: what a call is given of a
// skill its process or its agent names (ADR-021), whatever file says it.
// The reader maps a skill document to it.
type givenSkill struct {
	name string
	// bytes are the whole skill, unchanged: what the call is given.
	bytes []byte
	// sha256 is the digest of bytes, by which a call identifies the skill
	// it was given.
	sha256 string
}
