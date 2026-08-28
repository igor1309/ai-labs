/// Reduces per-document position state: anchor recording at sentence
/// transitions, live progress offset, idle jumps, and clearing on natural
/// finish or start-over.
public final class PlaybackPositionReducer {

    public init() {}
}

public extension PlaybackPositionReducer {

    func reduce(
        _ state: State,
        _ event: Event
    ) -> (State, Effect?) {

        switch event {
        case let .spokenOffsetChanged(spokenUTF16Offset):
            return spokenOffsetChanged(state, spokenUTF16Offset: spokenUTF16Offset)

        case .playbackFinishedNaturally, .startOverRequested:
            return clearPosition(state)

        case let .idleJumpRequested(direction):
            return idleJumpRequested(state, direction: direction)

        case let .frontMatterModeChanged(mode):
            var state = state
            state.applyFrontMatterMode(mode)
            return (state, nil)
        }
    }
}

public extension PlaybackPositionReducer {

    typealias State = PlaybackPositionState
    typealias Event = PlaybackPositionEvent
    typealias Effect = PlaybackPositionEffect
}

private extension PlaybackPositionReducer {

    func spokenOffsetChanged(_ state: State, spokenUTF16Offset: Int) -> (State, Effect?) {

        var state = state
        state.liveDocumentUTF16Offset = state.derivation.documentUTF16Offset(
            forSpokenUTF16Offset: spokenUTF16Offset
        )
        guard state.documentPath != nil else {
            return (state, nil)
        }

        let anchor = state.derivation.documentAnchor(forSpokenUTF16Offset: spokenUTF16Offset)
        return record(anchor: anchor, in: state)
    }

    func clearPosition(_ state: State) -> (State, Effect?) {

        var state = state
        state.storedAnchor = nil
        state.liveDocumentUTF16Offset = nil
        guard let documentPath = state.documentPath else {
            return (state, nil)
        }

        return (state, .clearAnchor(documentPath: documentPath))
    }

    func idleJumpRequested(_ state: State, direction: SentenceJumpDirection) -> (State, Effect?) {

        let speechText = state.derivation.speechText
        let from = state.resumeSpokenUTF16Offset
        let target: Int? = switch direction {
        case .previous:
            PlaybackPositionMapping.previousSentenceStartUTF16Offset(in: speechText, from: from)
        case .next:
            PlaybackPositionMapping.nextSentenceStartUTF16Offset(in: speechText, from: from)
        }
        guard let target else {
            return (state, nil)
        }

        var state = state
        // After an idle jump the position IS the anchor — drop any stale
        // frozen live offset so progress tracks the jump.
        state.liveDocumentUTF16Offset = nil
        let anchor = state.derivation.documentAnchor(forSpokenUTF16Offset: target)
        return record(anchor: anchor, in: state, recordWithoutPath: true)
    }

    /// Stores the anchor and emits a persist effect when it moved; without a
    /// document path the anchor is stored only when `recordWithoutPath` (idle
    /// jumps track position in memory even for unpersistable documents).
    func record(anchor: Int, in state: State, recordWithoutPath: Bool = false) -> (State, Effect?) {

        var state = state
        guard let documentPath = state.documentPath else {
            if recordWithoutPath {
                state.storedAnchor = anchor
            }
            return (state, nil)
        }

        guard anchor != state.storedAnchor else {
            return (state, nil)
        }

        state.storedAnchor = anchor
        return (state, .persistAnchor(documentPath: documentPath, anchor: anchor))
    }
}
