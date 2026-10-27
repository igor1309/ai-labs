import Session

public extension SessionPieces {

    struct MicrophonePort: SessionMicrophoneCapture {

        let pieces: SessionPieces

        public func start() async throws { try await pieces.startMicrophoneCapture() }
        public func stop() async throws { try await pieces.stopCapture(.microphone) }
    }

    struct CallPort: SessionCallCapture {

        let pieces: SessionPieces

        public func start(selection: SessionCallCaptureSelection) async throws {

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

        handler(sink: SystemLogSink())
    }
}

extension SessionPieces {

    nonisolated func handler(sink: any LogSink) -> SessionEffectHandler {

        SessionEffectHandler(
            folder: LoggingFolder(base: self, log: .init(sink: sink, name: "folder")),
            processes: LoggingProcesses(base: self, log: .init(sink: sink, name: "processes")),
            microphoneCapture: LoggingMicrophone(base: microphoneCapture, log: .init(sink: sink, name: "microphoneCapture")),
            callCapture: LoggingCallCapture(base: callCapture, log: .init(sink: sink, name: "callCapture")),
            microphoneTrack: LoggingTrack(base: microphoneTrack, log: .init(sink: sink, name: "microphoneTrack")),
            callTrack: LoggingTrack(base: callTrack, log: .init(sink: sink, name: "callTrack")),
            callText: LoggingCallText(base: self, log: .init(sink: sink, name: "callText")),
            transcript: LoggingTranscript(base: transcript, log: .init(sink: sink, name: "transcript"))
        )
    }
}
