package app

import "github.com/igor1309/ai-labs/agister/internal/domain/document"

// declaredBlock is one document a repository blocks as the package uses
// it (ADR-018), whatever file says it. The reader maps a blocks document
// to its blocks.
type declaredBlock struct {
	// kind and name are the document blocked: a process, a workflow, an
	// agent or a runtime mapping.
	kind document.Kind
	name string
	// reason is why, "" where none is given.
	reason string
}
