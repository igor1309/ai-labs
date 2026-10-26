import Darwin
import struct SideText.Audio
import class LiveAudio.LiveAudio
import RecordedCapture
import Session
import enum SystemAudioCapture.ProcessSelection
import TrackFile

public struct LiveCaptureAudio: CaptureAudio {

    let capture: LiveAudio

    public init(capture: LiveAudio) { self.capture = capture }

    public var capturedThrough: Double { capture.capturedThrough }

    public func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async {

        for await piece in await capture.listen() {
            await receive(Audio(start: piece.start, samples: piece.samples, sampleRate: piece.sampleRate))
        }
    }
}

extension SessionPieces {

    func startMicrophoneCapture() async throws {

        let capture = CaptureAdapter(begin: startMicrophone, unpack: {
            CapturedPiece(samples: $0.samples, sampleRate: $0.sampleRate)
        })
        try await startCapture(capture, side: .microphone)
    }

    func startCallCapture(selection: SessionCallCaptureSelection) async throws {

        let resolved: SystemAudioCapture.ProcessSelection
        switch selection {
        case let .chosen(selection):
            guard let known = selections[selection.id] else { throw Failure.unknownSelection(selection.id) }
            resolved = known
        case .everyAppButAudelin:
            resolved = .allExcept([getpid()])
        }
        let startCall = startCall
        let capture = CaptureAdapter(begin: { try await startCall(resolved) }, unpack: {
            CapturedPiece(samples: $0.samples, sampleRate: $0.sampleRate)
        })
        try await startCapture(capture, side: .call)
    }

    func stopCapture(_ side: SessionSide) async throws {

        try await sides[side]?.stopCapture?()
    }

    private func startCapture<Piece>(_ capture: CaptureAdapter<Piece>, side: SessionSide) async throws {

        guard let track = sides[side]?.track else { throw Failure.unavailableTrack(side) }
        let live = LiveAudio(capture: capture)
        let recorded = RecordedCapture(capture: RecordedInput(capture: live), track: recordingTrack(side, track))
        sides[side]?.audio.attach(makeCaptureAudio(side, live))
        do {
            try await recorded.start()
            let news = news.continuation
            let failures = Task(executorPreference: executor) {
                var stopFailure: (any Error)?
                for await failure in recorded.failures {
                    switch failure {
                    case let .track(error):
                        news.yield(.pieceFailed(.track(side), error: String(describing: error)))
                    case let .capture(error):
                        news.yield(.pieceFailed(.capture(side), error: String(describing: error)))
                    case let .stop(error):
                        stopFailure = error
                    }
                }
                return stopFailure
            }
            let audio = sides[side]!.audio
            sides[side]?.stopCapture = {
                // Runtime failures already have their own forwarding path.
                _ = try? await recorded.stop()
                await audio.drain()
                if let failure = await failures.value { throw failure }
            }
        } catch let RecordingFailure.capture(error) {
            throw error
        }
    }
}
