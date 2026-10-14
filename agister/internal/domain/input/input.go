// Package input is the vocabulary of inputs and input sources shared by
// definitions, calls and run records.
package input

// PromptSource is the source a call records for the inputs that give its
// process's prompt and guidance (ADR-028 rule 8). It is no input source a
// process may declare: one that does is refused, as is optional, which
// went with it.
const PromptSource = "prompt"

// PromptInput is the input that gives a call its process's prompt, and
// GuidanceInput the prefix of the one that gives each guidance prompt,
// guidance.<name> (ADR-028 rule 8).
const (
	PromptInput   = "prompt"
	GuidanceInput = "guidance."
)

// CollectionSource is the input source through which a workflow's join
// receives the collection: for each fan-out node, in declaration order, its
// node name, process, run and recorded output. Only a join is given one; a
// process called on its own, or as a fan-out node, has none to receive.
const CollectionSource = "workflow.collection"

// FileSource is the input source that reads a file, the one whose value
// may name the forms its text must have (ADR-026 rule 8).
const FileSource = "file"
