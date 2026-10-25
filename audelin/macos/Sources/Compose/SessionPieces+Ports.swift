import Session

public extension SessionPieces {

    struct MicrophonePort: SessionMicrophoneCapture {

        let pieces: SessionPieces

        public func start() async throws { try await pieces.startMicrophoneCapture() }
        public func stop() async throws { try await pieces.stopCapture(.microphone) }
    }

    struct CallPort: SessionCallCapture {

        let pieces: SessionPieces

        public func start(selection: SessionProcessSelection?) async throws {

            try await pieces.startCallCapture(selection: selection)
        }

        public func stop() async throws { try await pieces.stopCapture(.call) }
    }

    struct TrackPort: SessionTrackFile {

        let pieces: SessionPieces
        let side: SessionSide

        public func open(in folder: SessionCallFolder) async throws { try await pieces.openTrack(side, in: folder) }
        public func close() async throws { try await pieces.closeTrack(side) }
    }

    struct TranscriptPort: SessionTranscript {

        let pieces: SessionPieces

        public func open(in folder: SessionCallFolder) async throws { try await pieces.openTranscript(in: folder) }
        public func close() async throws { try await pieces.closeTranscript() }
    }

    nonisolated var microphoneCapture: MicrophonePort { MicrophonePort(pieces: self) }
    nonisolated var callCapture: CallPort { CallPort(pieces: self) }
    nonisolated var microphoneTrack: TrackPort { TrackPort(pieces: self, side: .microphone) }
    nonisolated var callTrack: TrackPort { TrackPort(pieces: self, side: .call) }
    nonisolated var transcript: TranscriptPort { TranscriptPort(pieces: self) }

    nonisolated func handler() -> SessionEffectHandler {

        SessionEffectHandler(
            folder: self, processes: self, microphoneCapture: microphoneCapture, callCapture: callCapture,
            microphoneTrack: microphoneTrack, callTrack: callTrack, callText: self, transcript: transcript
        )
    }
}
