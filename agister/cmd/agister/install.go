package main

import (
	"context"

	"github.com/igor1309/ai-labs/agister/internal/adapters/fsdefs"
	"github.com/igor1309/ai-labs/agister/internal/app"
	"github.com/igor1309/ai-labs/agister/internal/domain/definition"
)

var _ app.InstallStager = installStager{}

// installStager stages an install's result as home's settings store does,
// its stages read as app's settings.
type installStager struct{ fsdefs.Store }

func (s installStager) Stage(ctx context.Context, docs []definition.Document) (app.GateDefinitions, func(), error) {
	staged, remove, err := s.Store.Stage(ctx, docs)
	if err != nil {
		return nil, nil, err
	}
	return staged, remove, nil
}
