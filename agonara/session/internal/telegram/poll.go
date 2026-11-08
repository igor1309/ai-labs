package telegram

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

// PollAPI reads updates without exposing the bot's message-delivery collaborator.
type PollAPI interface {
	Call(context.Context, string, map[string]any) (json.RawMessage, error)
}

// PollStorage stores transport bookkeeping, never reading position.
type PollStorage interface {
	Load() (State, error)
	Save(State) error
}
type UpdateHandler interface {
	Handle(context.Context, Update, State) (State, error)
}
type Wait func(context.Context, time.Duration) error

type Poller struct {
	api     PollAPI
	handler UpdateHandler
	storage PollStorage
	wait    Wait
	log     func(string)
}

func NewPoller(api PollAPI, handler UpdateHandler, storage PollStorage, wait Wait, log func(string)) (*Poller, error) {
	if api == nil || handler == nil || storage == nil || wait == nil || log == nil {
		return nil, errors.New("poll API, handler, storage, wait and log are required")
	}
	return &Poller{api, handler, storage, wait, log}, nil
}

// Run returns after cancellation or an unrecoverable storage/poller conflict.
func (p *Poller) Run(ctx context.Context) error {
	state, err := p.storage.Load()
	if err != nil {
		return err
	}
	for ctx.Err() == nil {
		raw, err := p.api.Call(ctx, "getUpdates", map[string]any{"offset": state.Offset, "timeout": 25, "allowed_updates": []string{"message", "callback_query"}})
		if ctx.Err() != nil {
			return nil
		}
		var updates []Update
		if err == nil {
			err = json.Unmarshal(raw, &updates)
		}
		for _, update := range updates {
			if err != nil {
				break
			}
			if update.UpdateID < state.Offset {
				continue
			}
			next, handleErr := p.handler.Handle(ctx, update, state)
			err = handleErr
			if err != nil {
				break
			}
			next.Offset = update.UpdateID + 1
			if err := p.storage.Save(next); err != nil {
				return err
			}
			state = next
		}
		if err != nil {
			var apiErr *Error
			if errors.As(err, &apiErr) && apiErr.Code == 409 {
				return err
			}
			p.log("ERROR: " + err.Error())
			if err = p.wait(ctx, 5*time.Second); err != nil {
				return nil
			}
		}
	}
	return nil
}
