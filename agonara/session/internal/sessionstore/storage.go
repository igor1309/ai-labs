package sessionstore

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"math"
	"os"

	"github.com/igor1309/ai-labs/agonara/session/internal/store"
)

// ReadingFile is the only reader of the legacy reading formats. Migration never writes them.
type ReadingFile struct {
	Path, LegacyWeb, LegacyBot string
	validate                   func(ReadingRecord) error
}

func NewReadingFile(path, legacyWeb, legacyBot string, validate func(ReadingRecord) error) (*ReadingFile, error) {
	if validate == nil {
		return nil, errors.New("reading validator is required")
	}
	return &ReadingFile{Path: path, LegacyWeb: legacyWeb, LegacyBot: legacyBot, validate: validate}, nil
}

func (f ReadingFile) Save(s ReadingRecord) error {
	return store.Save(f.Path, readingFileRecord{Version: 1, ReadingRecord: s})
}
func (f ReadingFile) Load() (ReadingRecord, error) {
	data, err := os.ReadFile(f.Path)
	if err == nil {
		var record readingFileRecord
		if err = json.Unmarshal(data, &record); err != nil {
			return ReadingRecord{}, err
		}
		if record.Version != 1 {
			return ReadingRecord{}, errors.New("invalid reading file version")
		}
		s := record.ReadingRecord
		return s, f.validate(s)
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return ReadingRecord{}, err
	}
	s := initialReading()
	// An existing higher-priority file must be valid; corruption is never treated as absence.
	webData, found, err := legacy(f.LegacyWeb)
	if err != nil {
		return s, err
	}
	botData, botFound, botErr := legacy(f.LegacyBot)
	if botErr != nil {
		return s, botErr
	}
	var bot legacyBotRecord
	if botFound {
		botErr = json.Unmarshal(botData, &bot)
	}
	if found {
		var p struct {
			ProgramID string `json:"programId"`
			EntityID  string `json:"entityId"`
			Title     string `json:"title"`
			Page      int    `json:"page"`
		}
		if err = json.Unmarshal(webData, &p); err != nil {
			return s, err
		}
		s.Current.PlaceRecord = PlaceRecord{Screen: "entity", EntityID: p.EntityID, Page: &p.Page}
		s.Resume = &BookmarkRecord{ProgramID: p.ProgramID, EntityID: p.EntityID, Title: p.Title, Page: p.Page}
	} else if botFound {
		if botErr != nil {
			return s, botErr
		}
		s.Current = bot.Session
		if s.Current.Screen == "" {
			s.Current = initialReading().Current
			s.Current.Step = bot.Session.Step
		}
		if s.Current.Screen == "entity" && s.Current.Page != nil {
			s.Resume = &BookmarkRecord{EntityID: s.Current.EntityID, Title: s.Current.Title, Page: *s.Current.Page}
		}
	}

	// Revisions never revisit a callback issued by the previous polling owner,
	// including when the web place takes precedence over its reading position.
	if botFound && botErr == nil {
		if bot.Session.Step < 0 || bot.Session.Step == math.MaxInt {
			return s, errors.New("invalid legacy callback revision")
		}
		s.Current.Step = max(s.Current.Step, bot.Session.Step+1)
	}
	if err = f.validate(s); err != nil {
		return s, err
	}
	if err = f.Save(s); err != nil {
		return s, fmt.Errorf("initialize reading state: %w", err)
	}
	return s, nil
}
func legacy(path string) ([]byte, bool, error) {
	if path == "" {
		return nil, false, nil
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, false, nil
	}
	return data, err == nil, err
}

// TransportFile retains only Telegram bookkeeping in its new file; legacy bytes stay intact.
type TransportFile struct{ Path, Legacy string }

func (f TransportFile) Load() (TransportRecord, error) {
	data, found, err := legacy(f.Path)
	if err != nil {
		return TransportRecord{}, err
	}
	if found {
		var s TransportRecord
		err = json.Unmarshal(data, &s)
		if err == nil {
			err = validTransport(s)
		}
		return s, err
	}
	data, found, err = legacy(f.Legacy)
	if err != nil {
		return TransportRecord{}, err
	}
	var s TransportRecord
	if found {
		var old legacyBotRecord
		if err = json.Unmarshal(data, &old); err != nil {
			return s, err
		}
		s.Offset, s.Revision = old.Offset, old.Session.Step
	}
	if err := validTransport(s); err != nil {
		return s, err
	}
	return s, f.Save(s)
}
func (f TransportFile) Save(s TransportRecord) error { return store.Save(f.Path, s) }

func validTransport(s TransportRecord) error {
	if s.Offset < 0 || s.Revision < 0 {
		return errors.New("invalid transport offset or revision")
	}
	return nil
}

func initialReading() ReadingRecord {
	return ReadingRecord{Current: SessionRecord{PlaceRecord: PlaceRecord{Screen: "programs"}, Items: []ItemRecord{}, History: []PlaceRecord{}}}
}
